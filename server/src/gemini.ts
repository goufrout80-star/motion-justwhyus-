import type { Interactions } from '@google/genai';
import { getVertexClient } from './vertexClient.js';
import { fetchAttachmentBase64 } from './attachmentFetch.js';

// Hardcoded on purpose: a stale/typo'd GEMINI_MODEL env var on Vercel was
// causing "400 Request contains an invalid argument" from Vertex. The model
// id lives in code now so the environment can never break generation.
const model = 'gemini-omni-flash-preview';

export interface GeneratedAsset {
  type: 'text' | 'video' | 'image';
  text?: string;
  base64Data?: string;
  mimeType?: string;
  uri?: string;
}

/** Video generation task/mode. 'auto' lets the model decide from the prompt. */
export type VideoMode = 'auto' | 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit';

/** Duration in whole seconds (3-10), or 'auto' to let the model decide. */
export type VideoDuration = 'auto' | number;

export type AttachmentKind = 'image' | 'audio' | 'video' | 'document';

export interface InputAttachment {
  /** A Cloudinary delivery URL — the client uploads there directly to
   * avoid Vercel's ~4.5MB function request body limit; the server fetches
   * the bytes itself before building the Content part. Vertex's
   * Interactions API only accepts gs:// URIs for the `uri` field (verified
   * directly against the API — a public https URL is rejected outright),
   * so we can't just pass the Cloudinary URL straight through. */
  url: string;
  mimeType: string;
  kind: AttachmentKind;
}

export async function generateFromPrompt(params: {
  prompt: string;
  attachments?: InputAttachment[];
  mode?: VideoMode;
  duration?: VideoDuration;
}): Promise<GeneratedAsset[]> {
  // This app only generates video. Both `response_modalities` and
  // `system_instruction` are documented by the SDK's types but the live
  // Vertex "Interactions" preview endpoint for gemini-omni-flash-preview
  // rejects either one (even a plain string matching the SDK's own example)
  // with a bare "Request contains an invalid argument." 400 — verified
  // directly against the API. The instruction is folded into a SINGLE text
  // part together with the prompt (multiple text parts in one user_input
  // have also proven flaky against this preview endpoint).
  const attachmentHint =
    params.attachments && params.attachments.length > 0
      ? ' Use the attached file(s) as reference where relevant.'
      : '';
  const content: Interactions.Content[] = [
    {
      type: 'text',
      text: `Generate a video (not text, not an image) for the following request:${attachmentHint}\n\n${params.prompt}`,
    },
  ];

  for (const attachment of params.attachments ?? []) {
    content.push({
      type: attachment.kind,
      data: await fetchAttachmentBase64(attachment.url),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mime_type: attachment.mimeType as any,
    });
  }

  const mode = params.mode && params.mode !== 'auto' ? params.mode : undefined;
  const duration =
    typeof params.duration === 'number' && params.duration >= 3 && params.duration <= 10
      ? params.duration
      : undefined;

  const interaction = await getVertexClient().interactions.create({
    model,
    ...(mode
      ? {
          generation_config: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            video_config: { task: mode } as any,
          },
        }
      : {}),
    ...(duration
      ? {
          response_format: {
            type: 'video',
            duration: `${duration}s`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        }
      : {}),
    input: [
      {
        type: 'user_input',
        content,
      },
    ],
  });

  const assets: GeneratedAsset[] = [];

  if (interaction.steps) {
    for (const step of interaction.steps) {
      if (step.type === 'model_output' && step.content) {
        for (const part of step.content) {
          if (part.type === 'text') {
            assets.push({ type: 'text', text: part.text });
          } else if (part.type === 'video') {
            assets.push({
              type: 'video',
              base64Data: part.data,
              uri: part.uri,
              mimeType: part.mime_type || 'video/mp4',
            });
          } else if (part.type === 'image') {
            assets.push({
              type: 'image',
              base64Data: part.data,
              uri: part.uri,
              mimeType: part.mime_type || 'image/png',
            });
          }
        }
      }
    }
  }

  return assets;
}
