import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Content, GenerateContentConfig, Tool } from '@google/genai';
import { getVertexClient } from './vertexClient.js';

// Same Vertex AI project/auth as the rest of the app. Hardcoded model id —
// see chatGemini.ts / gemini.ts for why (a stale env var once caused a 400
// on every request).
const CODE_MODEL = 'gemini-3.5-flash';

export interface RemotionChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const WRITE_COMPOSITION_FUNCTION_NAME = 'write_composition';

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: WRITE_COMPOSITION_FUNCTION_NAME,
        description:
          'Propose a Remotion video composition (brand new, or a full replacement when editing an ' +
          'existing one). This does NOT apply the code — it only surfaces a preview + confirmation in ' +
          'the app UI. The user must explicitly accept it before it becomes the active composition.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'One short sentence describing what this composition/edit does.',
            },
            code: {
              type: 'string',
              description:
                'Plain JavaScript (JSX allowed, NO TypeScript syntax, NO import/require/export statements). ' +
                'Must define a component exactly as: const Composition = () => { ... }; — the last line of the ' +
                'file. Available in scope, already imported: React, and from Remotion — AbsoluteFill, Sequence, ' +
                'Series, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random. No image/video/font ' +
                'assets are available yet — build purely from shapes, gradients, CSS, and text.',
            },
            durationInFrames: {
              type: 'integer',
              description: 'Total length of the composition in frames at 30fps (e.g. 150 = 5 seconds). 60-900.',
            },
          },
          required: ['summary', 'code', 'durationInFrames'],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION =
  'You are a Remotion video-composition coding assistant embedded in Nanoni Studio, a chat-driven ' +
  'motion graphics tool. The user describes a video idea or an edit in plain language; you respond by ' +
  'calling write_composition with real, runnable Remotion code. Never paste code as plain chat text — ' +
  'always use the function call, for both first creation and every subsequent edit (edits replace the ' +
  'whole file, so include everything, not a diff). Keep a short, friendly text reply alongside the call ' +
  'explaining what you built or changed. If the user is just chatting/asking questions with no video ' +
  'intent, reply normally in text and do not call the function. Favor bold color, motion (interpolate, ' +
  'spring), and Sequence-based timing — this is a demo tool, so make compositions visually striking.';

function toContents(history: RemotionChatMessage[]): Content[] {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

export type RemotionChatEvent =
  | { type: 'text'; text: string }
  | { type: 'code_proposal'; code: string; summary: string; durationInFrames: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Streams a coding-chat turn. Plain text is yielded as it arrives; if the
 * model calls write_composition, that's surfaced as a single code_proposal
 * event — never auto-applied, the client asks the user to confirm first.
 */
export async function* streamRemotionChat(
  history: RemotionChatMessage[]
): AsyncGenerator<RemotionChatEvent> {
  const config: GenerateContentConfig = {
    maxOutputTokens: 8192,
    temperature: 0.9,
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
    model: CODE_MODEL,
    contents: toContents(history),
    config,
  });

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        yield { type: 'text', text: part.text };
      } else if (part.functionCall?.name === WRITE_COMPOSITION_FUNCTION_NAME) {
        const args = part.functionCall.args as
          | { code?: string; summary?: string; durationInFrames?: number }
          | undefined;
        if (args?.code) {
          yield {
            type: 'code_proposal',
            code: args.code,
            summary: args.summary || 'Updated composition',
            durationInFrames: Math.max(60, Math.min(900, args.durationInFrames || 150)),
          };
        }
      }
    }
  }

  yield { type: 'done' };
}
