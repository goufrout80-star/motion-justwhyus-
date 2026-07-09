import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { generate, type GenerationResult } from '../api';
import type { Attachment, VideoDuration, VideoMode } from '../types';
import { ResultCard } from './ResultCard';
import { NanoniMark } from './NanoniMark';
import { McpConnect } from './McpConnect';
import { useAttachments } from '../hooks/useAttachments';
import { AudioIcon, DocumentIcon, ImageIcon, VideoIcon } from './icons';

const MODES: { value: VideoMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text_to_video', label: 'Text to video' },
  { value: 'image_to_video', label: 'Image to video' },
  { value: 'reference_to_video', label: 'Reference to video' },
  { value: 'edit', label: 'Edit' },
];

const DURATIONS: { value: VideoDuration; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...([3, 4, 5, 6, 7, 8, 9, 10] as const).map((s) => ({ value: s, label: `${s} seconds` })),
];

const KIND_ICON: Record<Attachment['kind'], ReactNode> = {
  image: <ImageIcon size={13} />,
  audio: <AudioIcon size={13} />,
  video: <VideoIcon size={13} />,
  document: <DocumentIcon size={13} />,
};

const MAX_REFERENCE_FILES = 4;

/** Video rendering can take up to a minute — cycle through these so the
 * loading state feels alive instead of a static spinner the whole time. */
const LOADING_STAGES = [
  'Warming up the render engine…',
  'Composing your scene…',
  'Rendering frames…',
  'Applying final touches…',
  'Almost there…',
];

export function OmniManualPanel() {
  const [prompt, setPrompt] = useState('');
  const {
    attachments,
    uploading,
    error: attachError,
    addFiles,
    remove: removeAttachment,
    clear: clearAttachments,
  } = useAttachments(MAX_REFERENCE_FILES);
  const [mode, setMode] = useState<VideoMode>('auto');
  const [duration, setDuration] = useState<VideoDuration>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [stageIndex, setStageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) {
      setStageIndex(0);
      return;
    }
    const id = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 4500);
    return () => clearInterval(id);
  }, [loading]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading || uploading) return;

    setLoading(true);
    setError(null);
    try {
      const data = await generate(prompt, attachments, { mode, duration });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="manual-panel">
      <header className="manual-header">
        <div className="logo">
          <NanoniMark size={26} />
          <span>
            Create with <span className="logo-accent">Omni</span>
          </span>
        </div>
        <p className="tagline">Manual video generation — set the mode and duration yourself.</p>
      </header>

      <form className="prompt-card" onSubmit={handleSubmit}>
        <textarea
          className="prompt-input"
          placeholder="Describe the video you want to create…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />

        <div className="settings-row">
          <label className="settings-field">
            <span className="settings-label">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as VideoMode)}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-label">Video duration</span>
            <select
              value={String(duration)}
              onChange={(e) => setDuration(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={String(d.value)} value={String(d.value)}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(attachments.length > 0 || uploading) && (
          <div className="attachment-chips">
            {attachments.map((a) => (
              <span key={a.id} className="attachment-chip removable">
                {KIND_ICON[a.kind]} {a.name}
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(a.id)}>
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

        <div className="prompt-actions">
          <button
            type="button"
            className="chat-attach-btn"
            title="Attach reference files"
            aria-label="Attach reference files"
            disabled={uploading}
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
            onChange={addFiles}
          />

          {attachments.length > 0 && (
            <button type="button" className="clear-btn" onClick={clearAttachments}>
              Remove all
            </button>
          )}

          <button type="submit" className="generate-btn" disabled={loading || uploading || !prompt.trim()}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>

      {attachError && <div className="error-banner">{attachError}</div>}
      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>{LOADING_STAGES[stageIndex]}</p>
          <div className="loading-progress">
            <div className="loading-progress-bar" />
          </div>
          <div className="result-skeleton" aria-hidden="true">
            <div className="result-skeleton-media" />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <section className="results-grid">
          {results.map((result, i) => (
            <ResultCard key={i} result={result} />
          ))}
        </section>
      )}

      <McpConnect />
    </div>
  );
}
