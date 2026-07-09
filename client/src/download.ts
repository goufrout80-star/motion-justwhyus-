/**
 * Downloads a file to the user's device. A plain <a download> is ignored by
 * browsers for cross-origin URLs (our media lives on Vercel Blob / Cloudinary
 * / data URLs), so fetch the bytes and save through a same-origin object URL.
 * Falls back to opening in a new tab if the fetch is blocked.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function downloadVideo(url: string, filename = 'nanoni-video.mp4'): Promise<void> {
  return downloadFile(url, filename);
}

export function downloadImage(url: string, filename = 'nanoni-image.png'): Promise<void> {
  return downloadFile(url, filename);
}
