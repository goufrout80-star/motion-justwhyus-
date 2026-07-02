import { useEffect, useRef, useState, type FormEvent } from 'react';
import { generate, streamChat } from '../api';
import type { ChatMessage, ChatSession } from '../types';
import { NanoniMark } from './NanoniMark';
import { ConfirmVideoModal } from './ConfirmVideoModal';

interface ChatViewProps {
  session: ChatSession;
  onUpdateSession: (updater: (s: ChatSession) => ChatSession) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export function ChatView({ session, onUpdateSession }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ messageId: string; prompt: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    onUpdateSession((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setError(null);

    const userMsg: ChatMessage = { id: newId(), role: 'user', text };
    const modelMsgId = newId();
    const historyForRequest = [...session.messages, userMsg].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    onUpdateSession((s) => ({
      ...s,
      title: s.title || text.slice(0, 60),
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
      const results = await generate(prompt, null);
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
              Ask me anything, or ask me to create a video — I'll always check with you before
              generating one.
            </p>
          </div>
        )}

        {session.messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
            <div className="chat-bubble-content">
              <span className="chat-bubble-text">{m.text}</span>
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

      <form className="chat-input-row" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Nanoni…"
          disabled={streaming}
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          {streaming ? '…' : 'Send'}
        </button>
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
