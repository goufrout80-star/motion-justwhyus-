import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { generate, streamChat, type ChatHistoryItem } from '../api';
import type { Attachment, ChatMessage, ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';
import { MarkdownText } from './Markdown';
import { downloadVideo } from '../download';
import { useAttachments } from '../hooks/useAttachments';
import { useToasts } from '../hooks/useToasts';
import { ToastStack } from './ToastStack';
import {
  AudioIcon,
  BulbIcon,
  ChevronDownIcon,
  DocumentIcon,
  DownloadIcon,
  ImageIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  StopIcon,
  VideoIcon,
} from './icons';

interface ChatViewProps {
  session: ChatSession;
  onUpdateSession: (updater: (s: ChatSession) => ChatSession) => void;
}

/** How many files we'll carry forward across the whole chat to hand to Omni
 * once a video is confirmed — keeps the request small even in a long chat
 * where several files were attached over time. */
const MAX_SESSION_ATTACHMENTS = 4;
/** How many files can be attached to a single message at once. */
const MAX_ATTACHMENTS_PER_MESSAGE = 4;

const KIND_ICON: Record<Attachment['kind'], ReactNode> = {
  image: <ImageIcon size={13} />,
  audio: <AudioIcon size={13} />,
  video: <VideoIcon size={13} />,
  document: <DocumentIcon size={13} />,
};

function newId(): string {
  return crypto.randomUUID();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Vertex's safety filter rejections are generic 400s with wording that
 * varies ("prompt is blocked due to prohibited contents", "blocked due to
 * prohibited content guidelines", etc.) — normalize them into one clear,
 * actionable message instead of surfacing the raw API text. */
function friendlyVideoError(raw: string): string {
  if (/prohibited content|blocked/i.test(raw)) {
    return "This prompt was blocked by Google's safety filters. Try rephrasing it to avoid sensitive, violent, or restricted content, then try again.";
  }
  if (/quota|too_many_requests|429/i.test(raw)) {
    return "Omni's request quota was hit. Wait a minute, then try again.";
  }
  return raw;
}

export function ChatView({ session, onUpdateSession }: ChatViewProps) {
  const [input, setInput] = useState('');
  const {
    attachments: pendingAttachments,
    uploading,
    error: attachError,
    addFiles: handleFilesSelected,
    remove: removePendingAttachment,
    clear: clearPendingAttachments,
    setError: setAttachError,
  } = useAttachments(MAX_ATTACHMENTS_PER_MESSAGE);
  const [streaming, setStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Full attachment bytes, kept in memory only — never written to
  // localStorage (base64 media would blow the ~5-10MB quota). This rolls up
  // everything uploaded so far in the chat, so a later "generate the video"
  // confirmation can still hand those files to Omni.
  const sessionAttachmentsRef = useRef<Attachment[]>([]);

  useEffect(() => {
    if (!streaming) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') abortRef.current?.abort();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [streaming]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowScrollToBottom(true);
    }
  }, [session.messages]);

  function handleMessagesScroll() {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollToBottom(!nearBottom);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollToBottom(false);
  }

  useEffect(() => {
    if (!attachError) return;
    pushToast(attachError);
    setAttachError(null);
  }, [attachError, pushToast, setAttachError]);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    onUpdateSession((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  function rememberSessionAttachments(attachments: Attachment[]) {
    if (attachments.length === 0) return;
    const merged = [...sessionAttachmentsRef.current, ...attachments];
    sessionAttachmentsRef.current = merged.slice(-MAX_SESSION_ATTACHMENTS);
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
    } catch {
      // clipboard blocked — nothing else to do
    }
  }

  async function runStream(historyForRequest: ChatHistoryItem[], modelMsgId: string) {
    setStreaming(true);
    let accumulated = '';
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of streamChat(historyForRequest, controller.signal)) {
        if (event.type === 'text') {
          accumulated += event.text;
          patchMessage(modelMsgId, { text: accumulated });
        } else if (event.type === 'video_request') {
          patchMessage(modelMsgId, {
            text: accumulated || `I can generate a video for you: "${event.prompt}"`,
            pendingVideoPrompt: event.prompt,
            videoPrompt: event.prompt,
          });
        } else if (event.type === 'error') {
          pushToast(event.message);
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        pushToast(err instanceof Error ? err.message : 'Chat failed');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || streaming) return;

    const attachments = pendingAttachments;
    setInput('');
    clearPendingAttachments();
    requestAnimationFrame(autosize);

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      text,
      createdAt: Date.now(),
      attachments: attachments.length > 0 ? attachments.map((a) => ({ name: a.name, kind: a.kind })) : undefined,
    };
    rememberSessionAttachments(attachments);

    const modelMsgId = newId();
    const priorMessages: ChatHistoryItem[] = session.messages.map((m) => ({ role: m.role, text: m.text }));
    const historyForRequest: ChatHistoryItem[] = [
      ...priorMessages,
      { role: 'user', text, attachments },
    ];

    onUpdateSession((s) => ({
      ...s,
      title: s.title || text.slice(0, 60) || 'Attachment',
      updatedAt: Date.now(),
      messages: [...s.messages, userMsg, { id: modelMsgId, role: 'model', text: '', createdAt: Date.now() }],
    }));

    await runStream(historyForRequest, modelMsgId);
  }

  function regenerate(messageId: string) {
    if (streaming) return;
    const index = session.messages.findIndex((m) => m.id === messageId);
    if (index === -1 || session.messages[index].role !== 'model') return;

    const historyForRequest: ChatHistoryItem[] = session.messages
      .slice(0, index)
      .map((m) => ({ role: m.role, text: m.text }));

    patchMessage(messageId, {
      text: '',
      createdAt: Date.now(),
      pendingVideoPrompt: undefined,
      videoPrompt: undefined,
      videoUrl: undefined,
      videoError: undefined,
    });

    void runStream(historyForRequest, messageId);
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function startEdit(m: ChatMessage) {
    if (streaming) return;
    setEditingId(m.id);
    setEditValue(m.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
  }

  function commitEdit(messageId: string) {
    const index = session.messages.findIndex((m) => m.id === messageId);
    const newText = editValue.trim();
    if (index === -1 || !newText) {
      cancelEdit();
      return;
    }

    const historyForRequest: ChatHistoryItem[] = session.messages
      .slice(0, index)
      .map((m) => ({ role: m.role, text: m.text }));
    historyForRequest.push({ role: 'user', text: newText });

    const modelMsgId = newId();
    onUpdateSession((s) => ({
      ...s,
      messages: [
        ...s.messages.slice(0, index),
        { ...s.messages[index], text: newText, createdAt: Date.now() },
        { id: modelMsgId, role: 'model', text: '', createdAt: Date.now() },
      ],
    }));
    cancelEdit();
    void runStream(historyForRequest, modelMsgId);
  }

  function respondToConfirm(messageId: string, confirmed: boolean) {
    const message = session.messages.find((m) => m.id === messageId);
    if (!message?.pendingVideoPrompt) return;

    if (!confirmed) {
      patchMessage(messageId, {
        pendingVideoPrompt: undefined,
        videoPrompt: undefined,
        text: `${message.text}\n\n_Cancelled — video not generated._`,
      });
      return;
    }

    patchMessage(messageId, { pendingVideoPrompt: undefined });
    generateVideo(messageId, message.videoPrompt!);
  }

  async function generateVideo(messageId: string, prompt: string) {
    patchMessage(messageId, { isGeneratingVideo: true, videoError: undefined });

    try {
      const results = await generate(prompt, sessionAttachmentsRef.current);
      const video = results.find((r) => r.type === 'video');
      const baseText = session.messages.find((m) => m.id === messageId)?.text ?? '';
      patchMessage(messageId, {
        isGeneratingVideo: false,
        videoUrl: video?.uri || video?.dataUrl,
        text: video ? `${baseText}\n\nHere's your video:` : baseText,
        videoError: video ? undefined : 'Video generation did not return a video.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video generation failed';
      patchMessage(messageId, {
        isGeneratingVideo: false,
        videoError: friendlyVideoError(message),
      });
    }
  }

  function retryVideo(messageId: string) {
    const message = session.messages.find((m) => m.id === messageId);
    if (!message?.videoPrompt) return;
    generateVideo(messageId, message.videoPrompt);
  }

  const lastModelId = [...session.messages].reverse().find((m) => m.role === 'model')?.id;

  return (
    <div className="chat-view">
      <div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
        {session.messages.length === 0 && (
          <div className="chat-empty">
            <NanoniMark size={40} />
            <p className="script-accent">Create Everything.</p>
            <h2>How can I help you today?</h2>
            <p>
              Ask me anything, attach files for context, or ask me to create a video — I'll always
              check with you before generating one.
            </p>
            <div className="suggestion-row">
              <button className="suggestion-chip" onClick={() => setInput('Create a cinematic video of ')}>
                <VideoIcon size={14} /> Create a video…
              </button>
              <button className="suggestion-chip" onClick={() => setInput('Brainstorm ideas for ')}>
                <BulbIcon size={14} /> Brainstorm ideas
              </button>
              <button className="suggestion-chip" onClick={() => setInput('Search the web for ')}>
                <SearchIcon size={14} /> Search the web
              </button>
            </div>
          </div>
        )}

        {session.messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
            {m.role === 'model' && (
              <div className="chat-avatar">
                <NanoniMark size={16} />
              </div>
            )}
            <div className="chat-bubble-content">
              {m.attachments && m.attachments.length > 0 && (
                <div className="attachment-chips">
                  {m.attachments.map((a, i) => (
                    <span key={i} className="attachment-chip">
                      {KIND_ICON[a.kind]} {a.name}
                    </span>
                  ))}
                </div>
              )}
              {editingId === m.id ? (
                <div className="edit-message">
                  <textarea
                    className="nodrag"
                    autoFocus
                    rows={2}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        commitEdit(m.id);
                      } else if (e.key === 'Escape') {
                        cancelEdit();
                      }
                    }}
                  />
                  <div className="edit-message-actions">
                    <button type="button" className="inline-confirm-btn secondary" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button type="button" className="inline-confirm-btn primary" onClick={() => commitEdit(m.id)}>
                      Save & submit
                    </button>
                  </div>
                </div>
              ) : (
                m.text && (
                  <div className="chat-bubble-text">
                    {m.role === 'model' ? <MarkdownText text={m.text} /> : m.text}
                  </div>
                )
              )}
              {m.role === 'model' && !m.text && streaming && m.id === lastModelId && (
                <span className="typing-dots" aria-label="Nanoni is thinking">
                  <span />
                  <span />
                  <span />
                </span>
              )}

              {m.pendingVideoPrompt && (
                <div className="inline-confirm">
                  <button className="inline-confirm-btn secondary" onClick={() => respondToConfirm(m.id, false)}>
                    No, cancel
                  </button>
                  <button className="inline-confirm-btn primary" onClick={() => respondToConfirm(m.id, true)}>
                    Yes, create video
                  </button>
                </div>
              )}

              {m.isGeneratingVideo && (
                <div className="inline-generating">
                  <span className="spinner" /> Generating your video — this can take a minute…
                </div>
              )}

              {m.videoError && (
                <div className="inline-video-error">
                  <span>{m.videoError}</span>
                  <button className="inline-confirm-btn primary" onClick={() => retryVideo(m.id)}>
                    Try again
                  </button>
                </div>
              )}

              {m.videoUrl && (
                <div className="chat-video-wrap">
                  <video src={m.videoUrl} controls loop className="chat-video" />
                  <button
                    type="button"
                    className="download-btn"
                    onClick={() => downloadVideo(m.videoUrl!)}
                  >
                    <DownloadIcon size={16} />
                    Download MP4
                  </button>
                </div>
              )}

              {m.role === 'model' && m.text && (
                <div className="bubble-actions">
                  <button
                    type="button"
                    className="bubble-action"
                    title="Copy message"
                    onClick={() => copyMessage(m.id, m.text)}
                  >
                    {copiedId === m.id ? 'Copied ✓' : 'Copy'}
                  </button>
                  {m.id === lastModelId && !streaming && (
                    <button
                      type="button"
                      className="bubble-action"
                      title="Regenerate response"
                      onClick={() => regenerate(m.id)}
                    >
                      <RefreshIcon size={13} /> Regenerate
                    </button>
                  )}
                </div>
              )}

              {m.role === 'user' && m.text && !streaming && editingId !== m.id && (
                <div className="bubble-actions">
                  <button
                    type="button"
                    className="bubble-action"
                    title="Edit message"
                    onClick={() => startEdit(m)}
                  >
                    <PencilIcon size={12} /> Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollToBottom && (
        <button
          type="button"
          className="scroll-to-bottom-btn"
          aria-label="Scroll to latest message"
          onClick={scrollToBottom}
        >
          <ChevronDownIcon size={16} />
        </button>
      )}

      <form className="chat-composer" onSubmit={send}>
        {(pendingAttachments.length > 0 || uploading) && (
          <div className="attachment-chips attachment-chips-pending">
            {pendingAttachments.map((a) => (
              <span key={a.id} className="attachment-chip removable">
                {KIND_ICON[a.kind]} {a.name}
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => removePendingAttachment(a.id)}>
                  ×
                </button>
              </span>
            ))}
            {uploading && (
              <span className="attachment-chip">
                <span className="spinner" /> Uploading…
              </span>
            )}
          </div>
        )}

        <div className="chat-input-row">
          <button
            type="button"
            className="chat-attach-btn"
            title="Attach files"
            aria-label="Attach files"
            disabled={streaming || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 11.5 12.6 19a5.1 5.1 0 0 1-7.2-7.2l8-8a3.4 3.4 0 0 1 4.8 4.8l-7.9 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.4"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/*,audio/*,video/*,text/*,application/pdf"
            onChange={handleFilesSelected}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Nanoni…"
            disabled={streaming}
          />
          <button
            type={streaming ? 'button' : 'submit'}
            className={`send-btn${streaming ? ' send-btn-stop' : ''}`}
            aria-label={streaming ? 'Stop generating' : 'Send'}
            title={streaming ? 'Stop generating' : 'Send'}
            disabled={!streaming && (uploading || (!input.trim() && pendingAttachments.length === 0))}
            onClick={streaming ? stopStreaming : undefined}
          >
            {streaming ? (
              <StopIcon size={14} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
      </form>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
