import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Content, GenerateContentConfig, Tool } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

/**
 * Chat uses the Gemini Developer API (a plain API key from Google AI
 * Studio), which is a different credential and endpoint than the Vertex AI
 * client in gemini.ts used for video generation. Built lazily for the same
 * reason as the video client: a missing key should surface as a JSON error
 * on first use, not crash the whole serverless function at import time.
 */
let client: GoogleGenAI | null = null;

function getChatClient(): GoogleGenAI {
  if (client) return client;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Get a key from https://aistudio.google.com/apikey and add it to server/.env (or Vercel env vars) to enable chat.'
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
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
  'normally, search the web, and look up places. If — and only if — the user asks you to create, ' +
  'generate, animate, or render a video, call the generate_video function with a clear, detailed ' +
  'prompt instead of describing the video yourself in text. Do not call generate_video for any ' +
  'other kind of request.';

function toContents(history: ChatMessage[]): Content[] {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
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

  const stream = await getChatClient().models.generateContentStream({
    model: CHAT_MODEL,
    contents: toContents(history),
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
