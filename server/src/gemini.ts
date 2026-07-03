import type { Interactions } from '@google/genai';
import { getVertexClient } from './vertexClient.js';

const model = process.env.GEMINI_MODEL || 'gemini-omni-flash-preview';

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
  data: string;
  mimeType: string;
  kind: AttachmentKind;
}

export async function generateFromPrompt(params: {
  prompt: string;
  attachments?: InputAttachment[];
  mode?: VideoMode;
  duration?: VideoDuration;
}): Promise<GeneratedAsset[]> {
  const content: Interactions.Content[] = [{ type: 'text', text: params.prompt }];

  for (const attachment of params.attachments ?? []) {
    content.push({
      type: attachment.kind,
      data: attachment.data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mime_type: attachment.mimeType as any,
    });
  }

  const mode = params.mode && params.mode !== 'auto' ? params.mode : undefined;
  const duration =
    typeof params.duration === 'number' && params.duration >= 3 && params.duration <= 10
      ? params.duration
      : undefined;

  // This app only generates video. Both `response_modalities` and
  // `system_instruction` are documented by the SDK's types but the live
  // Vertex "Interactions" preview endpoint for gemini-omni-flash-preview
  // rejects either one (even a plain string matching the SDK's own example)
  // with a bare "Request contains an invalid argument." 400 — verified
  // directly against the API. Folding the instruction into the user content
  // instead reliably still returns a video-only response.
  const attachmentHint =
    params.attachments && params.attachments.length > 0
      ? ` Use the attached file(s) as reference where relevant.`
      : '';
  content.unshift({
    type: 'text',
    text: `Generate a video (not text, not an image) for the following request:${attachmentHint}`,
  });

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
