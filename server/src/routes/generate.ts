import { Router } from 'express';
import { generateFromPrompt } from '../gemini.js';

export const generateRouter = Router();

generateRouter.post('/', async (req, res) => {
  try {
    const prompt = (req.body?.prompt as string | undefined)?.trim();
    if (!prompt) {
      return res.status(400).json({ error: 'A prompt is required.' });
    }

    const imageBase64 = req.body?.imageBase64 as string | undefined;
    const imageMimeType = req.body?.imageMimeType as string | undefined;

    const assets = await generateFromPrompt({ prompt, imageBase64, imageMimeType });

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
