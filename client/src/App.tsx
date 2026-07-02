import { useRef, useState, type FormEvent } from 'react';
import { generate, type GenerationResult } from './api';
import { ResultCard } from './components/ResultCard';
import { GoogleG } from './components/GoogleG';
import { McpConnect } from './components/McpConnect';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
      const data = await generate(prompt, image);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="logo">
          <GoogleG />
          <span>
            Omni <span className="logo-accent">Studio</span>
          </span>
        </div>
        <p className="tagline">
          Generate video, images, and ideas with{' '}
          <span className="gemini-mark">Gemini Omni</span> on Google Cloud
        </p>
      </header>

      <main className="main">
        <form className="prompt-card" onSubmit={handleSubmit}>
          <textarea
            className="prompt-input"
            placeholder="Describe the video you want to create…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />

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
      </main>
    </div>
  );
}
