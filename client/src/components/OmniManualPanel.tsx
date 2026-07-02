import { useRef, useState, type FormEvent } from 'react';
import { generate, type GenerationResult } from '../api';
import type { VideoDuration, VideoMode } from '../types';
import { ResultCard } from './ResultCard';
import { NanoniMark } from './NanoniMark';
import { McpConnect } from './McpConnect';

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

export function OmniManualPanel() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoMode>('auto');
  const [duration, setDuration] = useState<VideoDuration>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(file: File | null) {
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const data = await generate(prompt, image, { mode, duration });
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

        <div className="prompt-actions">
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Reference upload" className="upload-preview" />
            ) : (
              <span>+ Add reference image</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
            />
          </div>

          {image && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => {
                handleImageChange(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Remove image
            </button>
          )}

          <button type="submit" className="generate-btn" disabled={loading || !prompt.trim()}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Rendering your video — this can take a minute…</p>
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
