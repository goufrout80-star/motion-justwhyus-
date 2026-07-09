import { HarmCategory, HarmBlockThreshold, ThinkingLevel } from '@google/genai';
import type { Content, GenerateContentConfig, Part } from '@google/genai';
import { getVertexClient } from './vertexClient.js';
import { fetchAttachmentBase64 } from './attachmentFetch.js';

export type SafetyLevel = 'off' | 'low' | 'medium' | 'high';

const SAFETY_THRESHOLD: Record<SafetyLevel, HarmBlockThreshold> = {
  off: HarmBlockThreshold.OFF,
  low: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  medium: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  high: HarmBlockThreshold.BLOCK_ONLY_HIGH,
};

function safetySettings(level: SafetyLevel) {
  const threshold = SAFETY_THRESHOLD[level];
  return [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold },
  ];
}

export interface ReferenceImageInput {
  url: string;
  mimeType: string;
}

async function referenceImageParts(images: ReferenceImageInput[] | undefined): Promise<Part[]> {
  if (!images || images.length === 0) return [];
  return Promise.all(
    images.map(async (img) => {
      const data = await fetchAttachmentBase64(img.url);
      return { inlineData: { data, mimeType: img.mimeType } };
    })
  );
}

export interface RefinePromptParams {
  model: string;
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  /** Cloudinary URLs for dropped images — the model sees these alongside
   * the idea text when writing the refined prompt. */
  attachments?: ReferenceImageInput[];
}

/** Runs a text model purely to rewrite/enhance a prompt — this is the
 * "Prompt / Refine" workflow node. It never generates the final image
 * itself; its text output becomes the input prompt for an Image Gen node. */
export async function refinePrompt(params: RefinePromptParams): Promise<string> {
  const config: GenerateContentConfig = {
    temperature: params.temperature,
    topP: params.topP,
    maxOutputTokens: params.maxOutputTokens,
    systemInstruction:
      params.systemInstruction ||
      'Rewrite the user\'s idea into a single, detailed, vivid prompt suitable for an AI image generator. ' +
        'Respond with only the rewritten prompt — no preamble, no explanation, no quotes.',
    ...(params.thinkingLevel
      ? { thinkingConfig: { thinkingLevel: ThinkingLevel[params.thinkingLevel] } }
      : {}),
  };

  const requestParts: Part[] = [...(await referenceImageParts(params.attachments)), { text: params.prompt }];
  const contents: Content[] = [{ role: 'user', parts: requestParts }];

  const response = await getVertexClient().models.generateContent({
    model: params.model,
    contents,
    config,
  });

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    // A model can burn its whole token budget on internal reasoning before
    // producing any visible output, especially at higher thinking levels
    // with a low maxOutputTokens — surface that clearly instead of quietly
    // returning an empty prompt that then breaks the downstream Image node.
    const finishReason = candidate?.finishReason;
    const hint =
      finishReason === 'MAX_TOKENS'
        ? ' The model ran out of its token budget (likely spent on internal thinking) before writing any output — raise "Max tokens" or lower the thinking level.'
        : '';
    throw new Error(`The model returned no text.${hint}`);
  }

  return text;
}

export interface GenerateImageParams {
  model: string;
  prompt: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  aspectRatio?: string;
  imageSize?: string;
  personGeneration?: 'ALLOW_ALL' | 'ALLOW_ADULT' | 'ALLOW_NONE';
  outputMimeType?: string;
  safetyLevel?: SafetyLevel;
  /** Cloudinary URLs for dropped reference images (up to 6) — fetched
   * server-side and included alongside the prompt for image-to-image
   * generation. */
  referenceImages?: ReferenceImageInput[];
}

export interface GeneratedImage {
  mimeType: string;
  base64Data: string;
}

/** Runs an image-generation model — the "Image Gen" workflow node. */
export async function generateImage(params: GenerateImageParams): Promise<GeneratedImage[]> {
  const config: GenerateContentConfig = {
    temperature: params.temperature,
    topP: params.topP,
    maxOutputTokens: params.maxOutputTokens,
    responseModalities: ['TEXT', 'IMAGE'],
    safetySettings: safetySettings(params.safetyLevel ?? 'medium'),
    imageConfig: {
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      personGeneration: params.personGeneration,
      ...(params.outputMimeType ? { imageOutputOptions: { mimeType: params.outputMimeType } } : {}),
    },
  };

  const requestParts: Part[] = [...(await referenceImageParts(params.referenceImages)), { text: params.prompt }];
  const contents: Content[] = [{ role: 'user', parts: requestParts }];

  const response = await getVertexClient().models.generateContent({
    model: params.model,
    contents,
    config,
  });

  const responseParts = response.candidates?.[0]?.content?.parts ?? [];
  const images: GeneratedImage[] = [];
  for (const part of responseParts) {
    if (part.inlineData?.data) {
      images.push({
        mimeType: part.inlineData.mimeType || 'image/png',
        base64Data: part.inlineData.data,
      });
    }
  }
  return images;
}
