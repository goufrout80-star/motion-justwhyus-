import type { Attachment, VideoDuration, VideoMode } from './types';
import { kindFromMimeType } from './types';

export interface GenerationResult {
  type: 'text' | 'video' | 'image';
  text?: string;
  dataUrl?: string;
  uri?: string;
}

/** Max size per attached file. Files upload straight to Cloudinary from
 * the browser, so this is only a sanity cap — not constrained by Vercel's
 * ~4.5MB serverless function request body limit like inlining would be. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

/**
 * Uploads a file directly to Cloudinary from the browser using an unsigned
 * upload preset — no token round-trip to our own server, no CORS issues
 * (Cloudinary's upload API is designed for direct browser uploads), and no
 * dependency on Vercel account/store configuration. The upload preset name
 * is not a secret (it only grants upload, not read/delete/list), so it's
 * safe to ship in the client bundle.
 */
export async function uploadAttachment(file: File): Promise<Attachment> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      'Attachment uploads are not configured — set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Upload failed');
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    kind: kindFromMimeType(file.type || ''),
    url: data.secure_url as string,
  };
}

function toWireAttachment(a: Attachment) {
  return { url: a.url, mimeType: a.mimeType, kind: a.kind };
}

export interface GenerateOptions {
  mode?: VideoMode;
  duration?: VideoDuration;
}

export async function generate(
  prompt: string,
  attachments: Attachment[] = [],
  options: GenerateOptions = {},
  signal?: AbortSignal
): Promise<GenerationResult[]> {
  const body: Record<string, unknown> = { prompt };

  if (attachments.length > 0) {
    body.attachments = attachments.map(toWireAttachment);
  }
  if (options.mode) body.mode = options.mode;
  if (options.duration !== undefined) body.duration = options.duration;

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  // The server may (rarely) return non-JSON — e.g. a platform-level crash page.
  // Read as text first and parse defensively so we surface a useful message.
  const text = await res.text();
  let data: { results?: GenerationResult[]; error?: unknown; message?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text.slice(0, 500) || 'Unexpected server response');
  }

  if (!res.ok) {
    const message =
      data?.message || (typeof data?.error === 'string' ? data.error : null) || text.slice(0, 500);
    throw new Error(message || 'Generation failed');
  }

  return (data?.results ?? []) as GenerationResult[];
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'video_request'; prompt: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
  /** Only sent for the newest message — older turns are text-only since we
   * don't keep attachment bytes around after they've already been sent once. */
  attachments?: Attachment[];
}

/**
 * Streams a chat turn from the server over SSE. The server frames each
 * event as `data: <json>\n\n`; this parses that incrementally as chunks
 * arrive so the UI can render text as it's generated.
 */
export async function* streamChat(
  messages: ChatHistoryItem[],
  signal?: AbortSignal
): AsyncGenerator<ChatEvent> {
  const wireMessages = messages.map((m) => ({
    role: m.role,
    text: m.text,
    ...(m.attachments && m.attachments.length > 0
      ? { attachments: m.attachments.map(toWireAttachment) }
      : {}),
  }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: wireMessages }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text)?.message || text;
    } catch {
      // keep raw text
    }
    throw new Error(message || 'Chat failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const line = rawEvent.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice('data: '.length)) as ChatEvent;
      } catch {
        // ignore a malformed chunk rather than breaking the whole stream
      }
    }
  }
}
