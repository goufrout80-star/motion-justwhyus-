import { Router } from 'express';
import {
  generateFromPrompt,
  type AttachmentKind,
  type InputAttachment,
  type VideoDuration,
  type VideoMode,
} from '../gemini.js';

export const generateRouter = Router();

const VALID_MODES: VideoMode[] = ['auto', 'text_to_video', 'image_to_video', 'reference_to_video', 'edit'];
const VALID_KINDS: AttachmentKind[] = ['image', 'audio', 'video', 'document'];
const MAX_ATTACHMENTS = 6;

function parseAttachments(raw: unknown): InputAttachment[] {
  if (!Array.isArray(raw)) return [];
  const attachments: InputAttachment[] = [];
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== 'object') continue;
    const { url, mimeType, kind } = item as Record<string, unknown>;
    if (typeof url !== 'string' || typeof mimeType !== 'string' || !url) continue;
    const resolvedKind: AttachmentKind = VALID_KINDS.includes(kind as AttachmentKind)
      ? (kind as AttachmentKind)
      : 'document';
    attachments.push({ url, mimeType, kind: resolvedKind });
  }
  return attachments;
}

generateRouter.post('/', async (req, res) => {
  try {
    const prompt = (req.body?.prompt as string | undefined)?.trim();
    if (!prompt) {
      return res.status(400).json({ error: 'A prompt is required.' });
    }

    const attachments = parseAttachments(req.body?.attachments);

    const rawMode = req.body?.mode as string | undefined;
    const mode: VideoMode | undefined = VALID_MODES.includes(rawMode as VideoMode)
      ? (rawMode as VideoMode)
      : undefined;

    const rawDuration = req.body?.duration;
    let duration: VideoDuration | undefined;
    if (rawDuration === 'auto') {
      duration = 'auto';
    } else if (typeof rawDuration === 'number') {
      duration = rawDuration;
    }

    const assets = await generateFromPrompt({ prompt, attachments, mode, duration });

    const results = assets.map((asset) => {
      if (asset.type === 'text') {
        return { type: 'text', text: asset.text };
      }
      // Return media inline as a data URL so it works on serverless
      // platforms (Vercel) with no persistent filesystem. When the model
      // delivers to Cloud Storage instead, pass the uri straight through.
      if (asset.base64Data) {
        return {
          type: asset.type,
          dataUrl: `data:${asset.mimeType};base64,${asset.base64Data}`,
        };
      }
      return { type: asset.type, uri: asset.uri };
    });

    res.json({ results });
  } catch (err) {
    console.error('[generate] failed', err);
    const message = err instanceof Error ? err.message : 'Generation failed';
    res.status(500).json({ error: message });
  }
});
