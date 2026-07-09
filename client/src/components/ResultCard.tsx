import type { GenerationResult } from '../api';
import { downloadImage, downloadVideo } from '../download';
import { DownloadIcon } from './icons';

function imageExtension(dataUrl: string): string {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);/.exec(dataUrl);
  const type = match?.[1] || 'png';
  return type === 'jpeg' ? 'jpg' : type;
}

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
              <DownloadIcon size={16} />
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
        {(result.dataUrl || result.uri) && (
          <div className="result-actions">
            <button
              type="button"
              className="download-btn"
              onClick={() => {
                const src = result.dataUrl || result.uri!;
                const ext = result.dataUrl ? imageExtension(result.dataUrl) : 'png';
                downloadImage(src, `nanoni-image-${Date.now()}.${ext}`);
              }}
            >
              <DownloadIcon size={16} />
              Download image
            </button>
          </div>
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
