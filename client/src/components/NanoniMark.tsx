/**
 * The NANONI scribble-wave logo. Renders the real brand asset from
 * /public/logo.svg (orange #FF3D00 wave, 1000x560 viewBox — wide format),
 * sized by height so it works at any scale from sidebar to empty states.
 */
export function NanoniMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      style={{ height: size, width: 'auto', display: 'block' }}
      draggable={false}
    />
  );
}
