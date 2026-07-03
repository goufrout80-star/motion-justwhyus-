export function NanoniMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="13" fill="#FF4D00" />
      {/* NANONI scribble-wave mark */}
      <path
        d="M9 30 L15 18 L21 30 L27 18 L33 30 L39 18"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
