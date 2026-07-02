interface ConfirmVideoModalProps {
  prompt: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmVideoModal({ prompt, onCancel, onConfirm }: ConfirmVideoModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-video-title">
      <div className="modal-card">
        <h3 id="confirm-video-title">Create this video?</h3>
        <p className="modal-prompt">&ldquo;{prompt}&rdquo;</p>
        <p className="modal-hint">
          Nanoni will call Omni to generate an MP4 from this prompt. Are you sure you want to
          create the video?
        </p>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onCancel}>
            No, cancel
          </button>
          <button className="modal-btn primary" onClick={onConfirm}>
            Yes, create video
          </button>
        </div>
      </div>
    </div>
  );
}
