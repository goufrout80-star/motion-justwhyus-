import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';
import { resolveCredentials } from './credentials.js';

resolveCredentials();

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const model = process.env.GEMINI_MODEL || 'gemini-omni-flash-preview';

if (!project) {
  console.warn(
    '[gemini] GOOGLE_CLOUD_PROJECT is not set — video generation requests will fail until it is configured in server/.env'
  );
}

export const ai = new GoogleGenAI({
  vertexai: true,
  project,
  location,
  httpOptions: { headers: { 'Api-Revision': '2026-05-20' } },
});

export interface GeneratedAsset {
  type: 'text' | 'video' | 'image';
  text?: string;
  base64Data?: string;
  mimeType?: string;
  uri?: string;
}

export async function generateFromPrompt(params: {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
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

  const interaction = await ai.interactions.create({
    model,
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
