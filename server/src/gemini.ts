import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
import { resolveCredentials } from './credentials.js';
import { getGoogleAuthClient } from './google-auth.js';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const model = process.env.GEMINI_MODEL || 'gemini-omni-flash-preview';

/**
 * The Vertex AI client is created lazily on first use. Building it at module
 * load meant that any auth/config problem crashed the whole serverless
 * function before the request handler could run — Vercel then returns plain
 * text ("A server error has occurred"), which the frontend can't parse as
 * JSON. Creating it inside the request path keeps every failure a JSON error.
 */
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;

  if (!project) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT is not set. Configure it in the environment (server/.env locally, or Vercel project settings).'
    );
  }

  // Local dev may resolve a key file or ADC; on Vercel this is a no-op.
  resolveCredentials();

  const authClient = getGoogleAuthClient();

  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    ...(authClient ? { googleAuthOptions: { authClient } } : {}),
    httpOptions: { headers: { 'Api-Revision': '2026-05-20' } },
  });

  return client;
}

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

export async function generateFromPrompt(params: {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  mode?: VideoMode;
  duration?: VideoDuration;
}): Promise<GeneratedAsset[]> {
  const content: Interactions.Content[] = [{ type: 'text', text: params.prompt }];

  if (params.imageBase64 && params.imageMimeType) {
    content.push({
      type: 'image',
      data: params.imageBase64,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mime_type: params.imageMimeType as any,
    });
  }

  const mode = params.mode && params.mode !== 'auto' ? params.mode : undefined;
  const duration =
    typeof params.duration === 'number' && params.duration >= 3 && params.duration <= 10
      ? params.duration
      : undefined;

  const interaction = await getClient().interactions.create({
    model,
    // This app only generates video. Constrain the model's output modality
    // (supported by the API) and reinforce it via system instruction, so
    // the model doesn't return a text-only or image-only reply instead.
    response_modalities: ['video'],
    system_instruction:
      'You always generate and return a video for every request. Never respond with only ' +
      'text or only an image — the output must always be a video.',
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
