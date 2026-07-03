import { put, head } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://motion.nanoni.studio').replace(
  /\/+$/,
  ''
);

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pathnameFor(id: string): string {
  return `videos/${id}.mp4`;
}

/**
 * True once a Vercel Blob store is attached to the project (Storage ->
 * Create Database -> Blob), which auto-injects BLOB_READ_WRITE_TOKEN. Until
 * then, callers should fall back to inlining video bytes directly.
 */
export function isVideoHostingConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isValidVideoId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * Uploads a generated video to Vercel Blob storage and returns a stable link
 * under our own domain (e.g. https://motion.nanoni.studio/videos/<id>)
 * instead of a raw *.blob.vercel-storage.com URL. The pathname is
 * deterministic (addRandomSuffix: false) so /videos/:id can resolve it back
 * via a metadata lookup without needing a separate database.
 */
export async function storeVideo(
  base64Data: string,
  mimeType: string
): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  const buffer = Buffer.from(base64Data, 'base64');

  await put(pathnameFor(id), buffer, {
    access: 'public',
    contentType: mimeType || 'video/mp4',
    addRandomSuffix: false,
  });

  return { id, url: `${PUBLIC_BASE_URL}/videos/${id}` };
}

/**
 * Resolves a /videos/:id request to the underlying Blob storage URL, or
 * null if the id is malformed or the video doesn't exist (expired, deleted,
 * or never uploaded).
 */
export async function resolveVideoUrl(id: string): Promise<string | null> {
  if (!isValidVideoId(id)) return null;

  try {
    const meta = await head(pathnameFor(id));
    return meta.url;
  } catch {
    return null;
  }
}
