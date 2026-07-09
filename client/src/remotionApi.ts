import type { Attachment, RemotionModelId } from './types';

export type RemotionChatEvent =
  | { type: 'text'; text: string }
  | {
      type: 'code_proposal';
      code: string;
      summary: string;
      durationInFrames: number;
      fps: number;
      width: number;
      height: number;
    }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface RemotionHistoryItem {
  role: 'user' | 'model';
  text: string;
  /** Only sent for the newest message — older turns are text-only since we
   * don't keep attachment bytes around after they've already been sent once. */
  attachments?: Attachment[];
}

function toWireAttachment(a: Attachment) {
  return { url: a.url, mimeType: a.mimeType, kind: a.kind };
}

/**
 * Streams a Remotion coding-chat turn over SSE — same framing as
 * client/src/api.ts's streamChat, kept as a separate small parser here so
 * this tool has no coupling to the video-chat module.
 */
export async function* streamRemotionChat(
  messages: RemotionHistoryItem[],
  model: RemotionModelId,
  signal?: AbortSignal
): AsyncGenerator<RemotionChatEvent> {
  const wireMessages = messages.map((m) => ({
    role: m.role,
    text: m.text,
    ...(m.attachments && m.attachments.length > 0
      ? { attachments: m.attachments.map(toWireAttachment) }
      : {}),
  }));

  const res = await fetch('/api/remotion-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: wireMessages, model }),
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
    throw new Error(message || 'Remotion chat failed');
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
        yield JSON.parse(line.slice('data: '.length)) as RemotionChatEvent;
      } catch {
        // ignore a malformed chunk rather than breaking the whole stream
      }
    }
  }
}
