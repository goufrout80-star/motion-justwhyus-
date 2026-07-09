import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { streamRemotionChat, type RemotionHistoryItem } from '../remotionApi';
import type { Attachment, RemotionMessage, RemotionModelId, RemotionProject } from '../types';
import { NanoniMark } from './NanoniMark';
import { RemotionPreview } from './RemotionPreview';
import { useAttachments } from '../hooks/useAttachments';
import { AudioIcon, DocumentIcon, ImageIcon, StopIcon, VideoIcon } from './icons';

interface RemotionStudioViewProps {
  project: RemotionProject;
  onUpdateProject: (updater: (p: RemotionProject) => RemotionProject) => void;
  onNewProject: () => void;
}

const MAX_ATTACHMENTS_PER_MESSAGE = 4;
/** How many files carry forward through the whole project so a later edit
 * can still reference earlier-attached assets without re-uploading. */
const MAX_PROJECT_ATTACHMENTS = 6;

const KIND_ICON: Record<Attachment['kind'], ReactNode> = {
  image: <ImageIcon size={13} />,
  audio: <AudioIcon size={13} />,
  video: <VideoIcon size={13} />,
  document: <DocumentIcon size={13} />,
};

const MODEL_OPTIONS: { value: RemotionModelId; label: string }[] = [
  { value: 'gemini-3.5-flash', label: 'Flash' },
  { value: 'gemini-3.1-pro', label: 'Pro' },
];

function newId(): string {
  return crypto.randomUUID();
}

export function RemotionStudioView({ project, onUpdateProject, onNewProject }: RemotionStudioViewProps) {
  const [input, setInput] = useState('');
  const {
    attachments: pendingAttachments,
    uploading,
    error: attachError,
    addFiles: handleFilesSelected,
    remove: removePendingAttachment,
    clear: clearPendingAttachments,
  } = useAttachments(MAX_ATTACHMENTS_PER_MESSAGE);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Full attachment bytes for the whole project (never persisted — see
  // client/src/components/ChatView.tsx for the identical pattern), so an
  // edit later in the conversation can still reference an asset attached
  // several messages ago without the user re-uploading it.
  const projectAttachmentsRef = useRef<Attachment[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project.messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }

  function patchMessage(id: string, patch: Partial<RemotionMessage>) {
    onUpdateProject((p) => ({
      ...p,
      messages: p.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  function rememberProjectAttachments(attachments: Attachment[]) {
    if (attachments.length === 0) return;
    const merged = [...projectAttachmentsRef.current, ...attachments];
    projectAttachmentsRef.current = merged.slice(-MAX_PROJECT_ATTACHMENTS);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function setModel(model: RemotionModelId) {
    onUpdateProject((p) => ({ ...p, model }));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || streaming) return;

    const attachments = pendingAttachments;
    setInput('');
    clearPendingAttachments();
    setError(null);
    requestAnimationFrame(autosize);

    const userMsg: RemotionMessage = {
      id: newId(),
      role: 'user',
      text,
      createdAt: Date.now(),
      attachments: attachments.length > 0 ? attachments.map((a) => ({ name: a.name, kind: a.kind })) : undefined,
    };
    rememberProjectAttachments(attachments);

    const modelMsgId = newId();
    const priorMessages: RemotionHistoryItem[] = project.messages.map((m) => ({ role: m.role, text: m.text }));
    const historyForRequest: RemotionHistoryItem[] = [...priorMessages, { role: 'user', text, attachments }];

    onUpdateProject((p) => ({
      ...p,
      title: p.title || text.slice(0, 60) || 'Attachment',
      updatedAt: Date.now(),
      messages: [...p.messages, userMsg, { id: modelMsgId, role: 'model', text: '' }],
    }));

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    try {
      for await (const event of streamRemotionChat(historyForRequest, project.model, controller.signal)) {
        if (event.type === 'text') {
          accumulated += event.text;
          patchMessage(modelMsgId, { text: accumulated });
        } else if (event.type === 'code_proposal') {
          patchMessage(modelMsgId, {
            text: accumulated || event.summary,
            pendingCode: event.code,
            pendingSummary: event.summary,
            pendingDurationInFrames: event.durationInFrames,
            pendingFps: event.fps,
            pendingWidth: event.width,
            pendingHeight: event.height,
          });
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Remotion chat failed');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function respondToProposal(messageId: string, accept: boolean) {
    const message = project.messages.find((m) => m.id === messageId);
    if (!message?.pendingCode) return;

    if (!accept) {
      patchMessage(messageId, {
        pendingCode: undefined,
        pendingSummary: undefined,
        pendingDurationInFrames: undefined,
        pendingFps: undefined,
        pendingWidth: undefined,
        pendingHeight: undefined,
        text: `${message.text}\n\n_Declined — preview unchanged._`,
      });
      return;
    }

    onUpdateProject((p) => ({
      ...p,
      code: message.pendingCode!,
      durationInFrames: message.pendingDurationInFrames || p.durationInFrames,
      fps: message.pendingFps || p.fps,
      width: message.pendingWidth || p.width,
      height: message.pendingHeight || p.height,
      updatedAt: Date.now(),
      messages: p.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              pendingCode: undefined,
              pendingSummary: undefined,
              pendingDurationInFrames: undefined,
              pendingFps: undefined,
              pendingWidth: undefined,
              pendingHeight: undefined,
              applied: true,
            }
          : m
      ),
    }));
  }

  return (
    <div className="remotion-studio">
      <div className="remotion-chat-pane">
        <div className="remotion-model-switch" role="radiogroup" aria-label="Model">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={project.model === opt.value}
              className={`remotion-model-btn ${project.model === opt.value ? 'active' : ''}`}
              onClick={() => setModel(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="chat-messages remotion-chat-messages">
          {project.messages.length === 0 && (
            <div className="chat-empty">
              <NanoniMark size={40} />
              <p className="script-accent">Create Everything.</p>
              <h2>What should we build?</h2>
              <p>
                Describe a video composition in plain language — colors, text, motion, timing, format. Attach
                images or video/audio references and I'll build with them. I'll write real Remotion code and
                show you a live preview before anything is applied.
              </p>
            </div>
          )}

          {project.messages.map((m) => (
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

                {m.pendingCode && (
                  <div className="inline-confirm">
                    <button className="inline-confirm-btn secondary" onClick={() => respondToProposal(m.id, false)}>
                      Decline
                    </button>
                    <button className="inline-confirm-btn primary" onClick={() => respondToProposal(m.id, true)}>
                      Apply to preview
                    </button>
                  </div>
                )}

                {m.applied && <span className="applied-badge">✓ Applied</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}
        {attachError && <div className="chat-error">{attachError}</div>}

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
              title="Attach reference files"
              aria-label="Attach reference files"
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
              accept="image/*,audio/*,video/*"
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
              onKeyDown={handleKeyDown}
              placeholder="Describe the video composition…"
              disabled={streaming}
            />
            {streaming ? (
              <button type="button" className="send-btn stop-btn" aria-label="Stop" onClick={stopStreaming}>
                <StopIcon size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="send-btn"
                aria-label="Send"
                disabled={uploading || (!input.trim() && pendingAttachments.length === 0)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
        </form>
      </div>

      <div className="remotion-preview-pane">
        <div className="remotion-preview-toolbar">
          <span className="remotion-preview-meta">
            {project.width}×{project.height} · {project.fps}fps ·{' '}
            {(project.durationInFrames / project.fps).toFixed(1)}s
          </span>
          <span className="nav-badge">Preview only — export coming soon</span>
          <button type="button" className="remotion-new-btn" onClick={onNewProject}>
            + New project
          </button>
        </div>
        <div className="remotion-preview-frame">
          <RemotionPreview
            code={project.code}
            durationInFrames={project.durationInFrames}
            fps={project.fps}
            width={project.width}
            height={project.height}
          />
        </div>
      </div>
    </div>
  );
}
