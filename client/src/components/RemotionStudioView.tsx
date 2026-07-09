import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { streamRemotionChat, type RemotionHistoryItem } from '../remotionApi';
import type { RemotionMessage, RemotionProject } from '../types';
import { NanoniMark } from './NanoniMark';
import { RemotionPreview } from './RemotionPreview';
import { StopIcon } from './icons';

interface RemotionStudioViewProps {
  project: RemotionProject;
  onUpdateProject: (updater: (p: RemotionProject) => RemotionProject) => void;
  onNewProject: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export function RemotionStudioView({ project, onUpdateProject, onNewProject }: RemotionStudioViewProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setError(null);
    requestAnimationFrame(autosize);

    const userMsg: RemotionMessage = { id: newId(), role: 'user', text, createdAt: Date.now() };
    const modelMsgId = newId();
    const priorMessages: RemotionHistoryItem[] = project.messages.map((m) => ({ role: m.role, text: m.text }));
    const historyForRequest: RemotionHistoryItem[] = [...priorMessages, { role: 'user', text }];

    onUpdateProject((p) => ({
      ...p,
      title: p.title || text.slice(0, 60),
      updatedAt: Date.now(),
      messages: [...p.messages, userMsg, { id: modelMsgId, role: 'model', text: '' }],
    }));

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    try {
      for await (const event of streamRemotionChat(historyForRequest, controller.signal)) {
        if (event.type === 'text') {
          accumulated += event.text;
          patchMessage(modelMsgId, { text: accumulated });
        } else if (event.type === 'code_proposal') {
          patchMessage(modelMsgId, {
            text: accumulated || event.summary,
            pendingCode: event.code,
            pendingSummary: event.summary,
            pendingDurationInFrames: event.durationInFrames,
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
        text: `${message.text}\n\n_Declined — preview unchanged._`,
      });
      return;
    }

    onUpdateProject((p) => ({
      ...p,
      code: message.pendingCode!,
      durationInFrames: message.pendingDurationInFrames || p.durationInFrames,
      updatedAt: Date.now(),
      messages: p.messages.map((m) =>
        m.id === messageId
          ? { ...m, pendingCode: undefined, pendingSummary: undefined, pendingDurationInFrames: undefined, applied: true }
          : m
      ),
    }));
  }

  return (
    <div className="remotion-studio">
      <div className="remotion-chat-pane">
        <div className="chat-messages remotion-chat-messages">
          {project.messages.length === 0 && (
            <div className="chat-empty">
              <NanoniMark size={40} />
              <p className="script-accent">Create Everything.</p>
              <h2>What should we build?</h2>
              <p>
                Describe a video composition in plain language — colors, text, motion. I'll write real
                Remotion code and show you a live preview before anything is applied.
              </p>
            </div>
          )}

          {project.messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              <div className="chat-bubble-content">
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

        <form className="chat-composer" onSubmit={send}>
          <div className="chat-input-row">
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
              <button type="submit" className="send-btn" aria-label="Send" disabled={!input.trim()}>
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
