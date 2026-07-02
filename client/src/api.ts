import type { VideoDuration, VideoMode } from './types';

export interface GenerationResult {
  type: 'text' | 'video' | 'image';
  text?: string;
  dataUrl?: string;
  uri?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface GenerateOptions {
  mode?: VideoMode;
  duration?: VideoDuration;
}

export async function generate(
  prompt: string,
  image: File | null,
  options: GenerateOptions = {}
): Promise<GenerationResult[]> {
  const body: Record<string, unknown> = { prompt };

  if (image) {
    body.imageBase64 = await fileToBase64(image);
    body.imageMimeType = image.type;
  }
  if (options.mode) body.mode = options.mode;
  if (options.duration !== undefined) body.duration = options.duration;

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
}

/**
 * Streams a chat turn from the server over SSE. The server frames each
 * event as `data: <json>\n\n`; this parses that incrementally as chunks
 * arrive so the UI can render text as it's generated.
 */
export async function* streamChat(messages: ChatHistoryItem[]): AsyncGenerator<ChatEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
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
