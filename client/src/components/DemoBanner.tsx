import { useState } from 'react';

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="demo-banner" role="note">
      <span>
        🚧 <strong>Demo</strong> — Nanoni is a work-in-progress showcase of AI chat + video
        generation tools. Things are actively moving; expect rough edges.
      </span>
      <button
        className="demo-banner-close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
