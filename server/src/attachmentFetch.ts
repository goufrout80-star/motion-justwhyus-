/**
 * Only Cloudinary delivery URLs are allowed — this value comes straight from
 * the client, and fetchAttachmentBase64 does a real server-side fetch of it,
 * so without this check a client could point our server at an arbitrary URL
 * (internal services, cloud metadata endpoints, etc.), an SSRF vector.
 * Cloudinary delivery URLs are always served from res.cloudinary.com.
 */
function isTrustedAttachmentUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

/**
 * Fetches attachment bytes from a Cloudinary URL server-side and returns
 * them as base64. This runs as a normal outbound fetch from the serverless
 * function, so it isn't subject to Vercel's ~4.5MB *incoming* request body
 * limit — that's the whole point of routing large attachments through
 * Cloudinary instead of inlining them in the request to /api/chat or
 * /api/generate.
 */
export async function fetchAttachmentBase64(url: string): Promise<string> {
  if (!isTrustedAttachmentUrl(url)) {
    throw new Error('Attachment URL must be a Cloudinary delivery URL.');
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch attachment (${res.status} ${res.statusText})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}
