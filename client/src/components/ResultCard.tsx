import type { GenerationResult } from '../api';
import { downloadVideo } from '../download';

export function ResultCard({ result }: { result: GenerationResult }) {
  if (result.type === 'video') {
    const src = result.dataUrl || result.uri;
    return (
      <div className="result-card">
        {result.dataUrl ? (
          <video src={result.dataUrl} controls loop className="result-media" />
        ) : (
          <a href={result.uri} target="_blank" rel="noreferrer" className="result-link">
            View generated video
          </a>
        )}
        {src && (
          <div className="result-actions">
            <button type="button" className="download-btn" onClick={() => downloadVideo(src)}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download MP4
            </button>
          </div>
        )}
      </div>
    );
  }

  if (result.type === 'image') {
    return (
      <div className="result-card">
        {result.dataUrl ? (
          <img src={result.dataUrl} alt="Generated" className="result-media" />
        ) : (
          <a href={result.uri} target="_blank" rel="noreferrer" className="result-link">
            View generated image
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="result-card result-text">
      <p>{result.text}</p>
    </div>
  );
}
