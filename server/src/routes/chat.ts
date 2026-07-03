import { Router } from 'express';
import { streamChat, type ChatMessage } from '../chatGemini.js';

export const chatRouter = Router();

function hasValidAttachments(v: Record<string, unknown>): boolean {
  if (v.attachments === undefined) return true;
  if (!Array.isArray(v.attachments)) return false;
  return v.attachments.every(
    (a) =>
      a &&
      typeof a === 'object' &&
      typeof (a as Record<string, unknown>).url === 'string' &&
      typeof (a as Record<string, unknown>).mimeType === 'string'
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (v.role === 'user' || v.role === 'model') && typeof v.text === 'string' && hasValidAttachments(v);
}

chatRouter.post('/', async (req, res) => {
  const history = req.body?.messages;
  if (!Array.isArray(history) || history.length === 0 || !history.every(isChatMessage)) {
    res.status(400).json({ error: true, message: 'messages must be a non-empty array of { role, text }.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of streamChat(history as ChatMessage[])) {
      send(event);
    }
  } catch (err) {
    console.error('[chat] stream failed', err);
    const message = err instanceof Error ? err.message : 'Chat failed';
    send({ type: 'error', message });
  } finally {
    res.end();
  }
});
