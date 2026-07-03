/**
 * Only Vercel Blob storage URLs are allowed — this value comes straight
 * from the client, and fetchAttachmentBase64 does a real server-side fetch
 * of it, so without this check a client could point our server at an
 * arbitrary URL (internal services, cloud metadata endpoints, etc.), an SSRF
 * vector. Blob URLs always look like https://<id>.public.blob.vercel-storage.com/...
 */
function isTrustedBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/**
 * Fetches attachment bytes from a Vercel Blob URL server-side and returns
 * them as base64. This runs as a normal outbound fetch from the serverless
 * function, so it isn't subject to Vercel's ~4.5MB *incoming* request body
 * limit — that's the whole point of routing large attachments through Blob
 * instead of inlining them in the request to /api/chat or /api/generate.
 */
export async function fetchAttachmentBase64(url: string): Promise<string> {
  if (!isTrustedBlobUrl(url)) {
    throw new Error('Attachment URL must be a Vercel Blob storage URL.');
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch attachment (${res.status} ${res.statusText})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}
