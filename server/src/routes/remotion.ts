import { Router } from 'express';
import { streamRemotionChat, resolveRemotionModel, type RemotionChatMessage } from '../remotionChat.js';

export const remotionRouter = Router();

function hasValidAttachments(v: Record<string, unknown>): boolean {
  if (v.attachments === undefined) return true;
  if (!Array.isArray(v.attachments)) return false;
  return v.attachments.every(
    (a) =>
      a &&
      typeof a === 'object' &&
      typeof (a as Record<string, unknown>).url === 'string' &&
      typeof (a as Record<string, unknown>).mimeType === 'string' &&
      typeof (a as Record<string, unknown>).kind === 'string'
  );
}

function isRemotionMessage(value: unknown): value is RemotionChatMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (v.role === 'user' || v.role === 'model') && typeof v.text === 'string' && hasValidAttachments(v);
}

remotionRouter.post('/', async (req, res) => {
  const history = req.body?.messages;
  if (!Array.isArray(history) || history.length === 0 || !history.every(isRemotionMessage)) {
    res.status(400).json({ error: true, message: 'messages must be a non-empty array of { role, text }.' });
    return;
  }

  const model = resolveRemotionModel(req.body?.model);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of streamRemotionChat(history as RemotionChatMessage[], model)) {
      send(event);
    }
  } catch (err) {
    console.error('[remotion-chat] stream failed', err);
    const message = err instanceof Error ? err.message : 'Remotion chat failed';
    send({ type: 'error', message });
  } finally {
    res.end();
  }
});
