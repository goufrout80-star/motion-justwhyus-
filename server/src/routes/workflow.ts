import { Router } from 'express';
import { refinePrompt, generateImage, type ReferenceImageInput, type SafetyLevel } from '../imageWorkflow.js';

export const workflowRouter = Router();

const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
const PERSON_GENERATION = ['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE'] as const;
const SAFETY_LEVELS: SafetyLevel[] = ['off', 'low', 'medium', 'high'];
const MAX_REFERENCE_IMAGES = 6;

/** The SDK's ApiError carries the real upstream HTTP status (e.g. 429 for
 * quota exhaustion) — surface that instead of always answering 500, so the
 * client (and whoever's reading the network tab) can tell a quota hit from
 * an actual server bug. */
function upstreamStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return 500;
}

function parseReferenceImages(raw: unknown): ReferenceImageInput[] {
  if (!Array.isArray(raw)) return [];
  const images: ReferenceImageInput[] = [];
  for (const item of raw.slice(0, MAX_REFERENCE_IMAGES)) {
    if (!item || typeof item !== 'object') continue;
    const { url, mimeType } = item as Record<string, unknown>;
    if (typeof url === 'string' && typeof mimeType === 'string' && url) {
      images.push({ url, mimeType });
    }
  }
  return images;
}

workflowRouter.post('/refine-prompt', async (req, res) => {
  try {
    const model = (req.body?.model as string | undefined)?.trim();
    const prompt = (req.body?.prompt as string | undefined)?.trim();
    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt are required.' });
    }

    const rawThinkingLevel = req.body?.thinkingLevel as string | undefined;
    const thinkingLevel = THINKING_LEVELS.includes(rawThinkingLevel as (typeof THINKING_LEVELS)[number])
      ? (rawThinkingLevel as (typeof THINKING_LEVELS)[number])
      : undefined;

    const text = await refinePrompt({
      model,
      prompt,
      systemInstruction: req.body?.systemInstruction as string | undefined,
      thinkingLevel,
      temperature: typeof req.body?.temperature === 'number' ? req.body.temperature : undefined,
      topP: typeof req.body?.topP === 'number' ? req.body.topP : undefined,
      maxOutputTokens: typeof req.body?.maxOutputTokens === 'number' ? req.body.maxOutputTokens : undefined,
      attachments: parseReferenceImages(req.body?.attachments),
    });

    res.json({ text });
  } catch (err) {
    console.error('[workflow] refine-prompt failed', err);
    const message = err instanceof Error ? err.message : 'Prompt refinement failed';
    res.status(upstreamStatus(err)).json({ error: message });
  }
});

workflowRouter.post('/generate-image', async (req, res) => {
  try {
    const model = (req.body?.model as string | undefined)?.trim();
    const prompt = (req.body?.prompt as string | undefined)?.trim();
    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt are required.' });
    }

    const rawPersonGeneration = req.body?.personGeneration as string | undefined;
    const personGeneration = PERSON_GENERATION.includes(
      rawPersonGeneration as (typeof PERSON_GENERATION)[number]
    )
      ? (rawPersonGeneration as (typeof PERSON_GENERATION)[number])
      : undefined;

    const rawSafetyLevel = req.body?.safetyLevel as string | undefined;
    const safetyLevel = SAFETY_LEVELS.includes(rawSafetyLevel as SafetyLevel)
      ? (rawSafetyLevel as SafetyLevel)
      : undefined;

    const images = await generateImage({
      model,
      prompt,
      temperature: typeof req.body?.temperature === 'number' ? req.body.temperature : undefined,
      topP: typeof req.body?.topP === 'number' ? req.body.topP : undefined,
      maxOutputTokens: typeof req.body?.maxOutputTokens === 'number' ? req.body.maxOutputTokens : undefined,
      aspectRatio: req.body?.aspectRatio as string | undefined,
      imageSize: req.body?.imageSize as string | undefined,
      personGeneration,
      outputMimeType: req.body?.outputMimeType as string | undefined,
      safetyLevel,
      referenceImages: parseReferenceImages(req.body?.referenceImages),
    });

    res.json({
      images: images.map((img) => ({
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.base64Data}`,
      })),
    });
  } catch (err) {
    console.error('[workflow] generate-image failed', err);
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(upstreamStatus(err)).json({ error: message });
  }
});
