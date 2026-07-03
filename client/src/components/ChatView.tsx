import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { fileToAttachment, generate, streamChat, MAX_ATTACHMENT_BYTES, type ChatHistoryItem } from '../api';
import type { Attachment, ChatMessage, ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';
import { ConfirmVideoModal } from './ConfirmVideoModal';

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

const KIND_ICON: Record<Attachment['kind'], string> = {
  image: '🖼️',
  audio: '🎵',
  video: '🎬',
  document: '📄',
};

function newId(): string {
  return crypto.randomUUID();
}

export function ChatView({ session, onUpdateSession }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ messageId: string; prompt: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Full attachment bytes, kept in memory only — never written to
  // localStorage (base64 media would blow the ~5-10MB quota). This rolls up
  // everything uploaded so far in the chat, so a later "generate the video"
  // confirmation can still hand those files to Omni.
  const sessionAttachmentsRef = useRef<Attachment[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    onUpdateSession((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setAttachError(null);
    const room = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return;
    }

    const toAdd = files.slice(0, room);
    const oversized = toAdd.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = toAdd.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);

    if (oversized.length > 0) {
      setAttachError(`${oversized.map((f) => f.name).join(', ')} exceeds the 8MB attachment limit.`);
    }
    if (files.length > toAdd.length) {
      setAttachError(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} files can be attached per message.`);
    }

    const converted = await Promise.all(ok.map(fileToAttachment));
    setPendingAttachments((prev) => [...prev, ...converted]);
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function rememberSessionAttachments(attachments: Attachment[]) {
    if (attachments.length === 0) return;
    const merged = [...sessionAttachmentsRef.current, ...attachments];
    sessionAttachmentsRef.current = merged.slice(-MAX_SESSION_ATTACHMENTS);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || streaming) return;

    const attachments = pendingAttachments;
    setInput('');
    setPendingAttachments([]);
    setAttachError(null);
    setError(null);

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      text,
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
      messages: [...s.messages, userMsg, { id: modelMsgId, role: 'model', text: '' }],
    }));

    setStreaming(true);
    let accumulated = '';

    try {
      for await (const event of streamChat(historyForRequest)) {
        if (event.type === 'text') {
          accumulated += event.text;
          patchMessage(modelMsgId, { text: accumulated });
        } else if (event.type === 'video_request') {
          setPendingConfirm({ messageId: modelMsgId, prompt: event.prompt });
          patchMessage(modelMsgId, {
            text: accumulated || `I can generate a video for you: "${event.prompt}"`,
            pendingVideoPrompt: event.prompt,
          });
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setStreaming(false);
    }
  }

  async function handleConfirm(confirmed: boolean) {
    if (!pendingConfirm) return;
    const { messageId, prompt } = pendingConfirm;
    setPendingConfirm(null);
    patchMessage(messageId, { pendingVideoPrompt: undefined });

    if (!confirmed) {
      onUpdateSession((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, text: `${m.text}\n\n_Cancelled — video not generated._` } : m
        ),
      }));
      return;
    }

    patchMessage(messageId, { isGeneratingVideo: true });

    try {
      const results = await generate(prompt, sessionAttachmentsRef.current);
      const video = results.find((r) => r.type === 'video');
      patchMessage(messageId, {
        isGeneratingVideo: false,
        videoUrl: video?.uri || video?.dataUrl,
        text: video ? `${session.messages.find((m) => m.id === messageId)?.text ?? ''}\n\nHere's your video:` : 'Video generation did not return a video.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video generation failed';
      patchMessage(messageId, {
        isGeneratingVideo: false,
        text: `${session.messages.find((m) => m.id === messageId)?.text ?? ''}\n\n_Video generation failed: ${message}_`,
      });
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {session.messages.length === 0 && (
          <div className="chat-empty">
            <NanoniMark size={44} />
            <h2>How can I help you today?</h2>
            <p>
              Ask me anything, attach files for context, or ask me to create a video — I'll always
              check with you before generating one.
            </p>
          </div>
        )}

        {session.messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
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
              {m.text && <span className="chat-bubble-text">{m.text}</span>}
              {m.isGeneratingVideo && (
                <div className="inline-generating">
                  <span className="spinner" /> Generating your video…
                </div>
              )}
              {m.videoUrl && <video src={m.videoUrl} controls loop className="chat-video" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="chat-error">{error}</div>}
      {attachError && <div className="chat-error">{attachError}</div>}

      <form className="chat-composer" onSubmit={send}>
        {pendingAttachments.length > 0 && (
          <div className="attachment-chips attachment-chips-pending">
            {pendingAttachments.map((a) => (
              <span key={a.id} className="attachment-chip removable">
                {KIND_ICON[a.kind]} {a.name}
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => removePendingAttachment(a.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          <button
            type="button"
            className="chat-attach-btn"
            title="Attach files"
            disabled={streaming}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/*,audio/*,video/*,text/*,application/pdf"
            onChange={handleFilesSelected}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Nanoni…"
            disabled={streaming}
          />
          <button type="submit" disabled={streaming || (!input.trim() && pendingAttachments.length === 0)}>
            {streaming ? '…' : 'Send'}
          </button>
        </div>
      </form>

      {pendingConfirm && (
        <ConfirmVideoModal
          prompt={pendingConfirm.prompt}
          onCancel={() => handleConfirm(false)}
          onConfirm={() => handleConfirm(true)}
        />
      )}
    </div>
  );
}
