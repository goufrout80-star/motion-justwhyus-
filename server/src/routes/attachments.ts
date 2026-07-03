import { Router } from 'express';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const attachmentsRouter = Router();

const ALLOWED_CONTENT_TYPES = ['image/*', 'audio/*', 'video/*', 'text/*', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * Issues short-lived client tokens so the browser can upload attachment
 * bytes straight to Vercel Blob storage, bypassing Vercel's ~4.5MB request
 * body limit on serverless functions (which chat/generate would otherwise
 * hit for anything beyond a small image). The server later fetches the blob
 * URL itself — an outbound fetch isn't subject to that same limit — to build
 * the base64 payload Gemini/Omni actually need.
 */
attachmentsRouter.post('/', async (req, res) => {
  try {
    const body = req.body as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
        addRandomSuffix: true,
      }),
    });
    res.json(jsonResponse);
  } catch (err) {
    console.error('[attachments] upload token failed', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ error: message });
  }
});
