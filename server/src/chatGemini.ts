import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Content, GenerateContentConfig, Tool } from '@google/genai';
import { getVertexClient } from './vertexClient.js';
import { fetchAttachmentBase64 } from './attachmentFetch.js';

// Chat runs through the same Vertex AI project and auth as Omni video
// generation (gcloud ADC locally, Vercel OIDC + Workload Identity
// Federation in production) — no separate API key required.
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

export interface ChatAttachment {
  /** A Cloudinary delivery URL — the client uploads there directly to
   * avoid Vercel's ~4.5MB function request body limit; the server fetches
   * the bytes itself before building the inlineData part. */
  url: string;
  mimeType: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  /** Only expected on the newest message — see client/src/api.ts. */
  attachments?: ChatAttachment[];
}

export const GENERATE_VIDEO_FUNCTION_NAME = 'generate_video';

const tools: Tool[] = [
  { googleSearch: {} },
  { googleMaps: {} },
  {
    functionDeclarations: [
      {
        name: GENERATE_VIDEO_FUNCTION_NAME,
        description:
          'Propose generating a video with Omni for the user. This does NOT create the video — ' +
          'calling it only surfaces a confirmation prompt in the app UI. The video is only ' +
          'actually generated after the user explicitly confirms "yes".',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'A clear, detailed description of the video to generate.',
            },
          },
          required: ['prompt'],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION =
  'You are Nanoni, a helpful assistant embedded in an AI video generation studio. You can chat ' +
  'normally, search the web, and look up places. The user may attach files (images, audio, video, ' +
  'or documents) — use them as context when relevant, e.g. describing an attached image or ' +
  'transcribing/summarizing an attached audio or document. If — and only if — the user asks you ' +
  'to create, generate, animate, or render a video, call the generate_video function with a ' +
  'clear, detailed prompt instead of describing the video yourself in text; mention in the ' +
  'prompt when an attached file should be used as reference. Do not call generate_video for any ' +
  'other kind of request.';

const MAX_ATTACHMENTS_PER_MESSAGE = 4;

async function toContents(history: ChatMessage[]): Promise<Content[]> {
  return Promise.all(
    history.map(async (m) => {
      const attachments = (m.attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
      const inlineParts = await Promise.all(
        attachments.map(async (a) => ({
          inlineData: { data: await fetchAttachmentBase64(a.url), mimeType: a.mimeType },
        }))
      );
      return { role: m.role, parts: [{ text: m.text }, ...inlineParts] };
    })
  );
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'video_request'; prompt: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Streams a chat turn from Gemini. Plain text is yielded as it arrives; if
 * the model instead decides to call generate_video, that's surfaced as a
 * single video_request event (never auto-executed — the caller is
 * responsible for confirming with the user first).
 */
export async function* streamChat(history: ChatMessage[]): AsyncGenerator<ChatStreamEvent> {
  const config: GenerateContentConfig = {
    maxOutputTokens: 8192,
    temperature: 1,
    topP: 0.95,
    tools,
    systemInstruction: SYSTEM_INSTRUCTION,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
    ],
  };

  const stream = await getVertexClient().models.generateContentStream({
    model: CHAT_MODEL,
    contents: await toContents(history),
    config,
  });

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        yield { type: 'text', text: part.text };
      } else if (part.functionCall?.name === GENERATE_VIDEO_FUNCTION_NAME) {
        const args = part.functionCall.args as { prompt?: string } | undefined;
        if (args?.prompt) {
          yield { type: 'video_request', prompt: args.prompt };
        }
      }
    }
  }

  yield { type: 'done' };
}
