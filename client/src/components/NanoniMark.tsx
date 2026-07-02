export function NanoniMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="nanoni-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#nanoni-gradient)" />
      <path
        d="M14 34V14h4.2l11.6 14.6V14H34v20h-4.2L18.2 19.4V34H14z"
        fill="white"
      />
    </svg>
  );
}
