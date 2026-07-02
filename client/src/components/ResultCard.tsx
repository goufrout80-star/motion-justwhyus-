import type { GenerationResult } from '../api';

export function ResultCard({ result }: { result: GenerationResult }) {
  if (result.type === 'video') {
    return (
      <div className="result-card">
        {result.dataUrl ? (
          <video src={result.dataUrl} controls loop className="result-media" />
        ) : (
          <a href={result.uri} target="_blank" rel="noreferrer" className="result-link">
            View generated video
          </a>
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
