import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Content, GenerateContentConfig, Part, Tool } from '@google/genai';
import { getVertexClient } from './vertexClient.js';
import { fetchAttachmentBase64 } from './attachmentFetch.js';

// Same Vertex AI project/auth as the rest of the app. A fixed allowlist
// instead of a free-text env var — see chatGemini.ts / gemini.ts for why an
// unchecked model string once caused a 400 on every request.
export type RemotionModelId = 'gemini-3.5-flash' | 'gemini-3.1-pro';
export const REMOTION_MODELS: RemotionModelId[] = ['gemini-3.5-flash', 'gemini-3.1-pro'];
const DEFAULT_MODEL: RemotionModelId = 'gemini-3.5-flash';

export function resolveRemotionModel(value: unknown): RemotionModelId {
  return REMOTION_MODELS.includes(value as RemotionModelId) ? (value as RemotionModelId) : DEFAULT_MODEL;
}

export type RemotionAttachmentKind = 'image' | 'audio' | 'video' | 'document';

export interface RemotionChatAttachment {
  /** A Cloudinary delivery URL — fetched server-side only for images (for
   * the model to actually see them); for video/audio/document the URL is
   * just handed to the model as a reference it can embed directly in code
   * via <Video src>/<Audio src>/<Img src>. */
  url: string;
  mimeType: string;
  kind: RemotionAttachmentKind;
}

export interface RemotionChatMessage {
  role: 'user' | 'model';
  text: string;
  /** Only expected on the newest message — see client/src/remotionApi.ts. */
  attachments?: RemotionChatAttachment[];
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
          'the app UI. The user must explicitly accept it before it becomes the active composition. You ' +
          'own both the code AND its timing/format — always set durationInFrames, fps, width, and height ' +
          'deliberately based on what best fits the request (e.g. a portrait 1080x1920 for a social clip, ' +
          '24fps for a cinematic feel, a duration that actually fits the motion you wrote).',
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
                'Series, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random, Img, Video, Audio. ' +
                'If the user attached reference files, their URLs are given to you in the conversation — use ' +
                '<Img src="URL">, <Video src="URL">, or <Audio src="URL"> to actually incorporate them. Without ' +
                'attached references, build purely from shapes, gradients, CSS, and text.',
            },
            durationInFrames: {
              type: 'integer',
              description: 'Total length of the composition in frames, at the fps you choose. 30-1800.',
            },
            fps: {
              type: 'integer',
              description: 'Frames per second for this composition. 24 (cinematic), 30 (default/standard), or 60 (smooth). Defaults to 30.',
            },
            width: {
              type: 'integer',
              description: 'Composition width in pixels, e.g. 1280 (landscape), 1080 (square/portrait base). Defaults to 1280.',
            },
            height: {
              type: 'integer',
              description: 'Composition height in pixels, e.g. 720 (landscape), 1920 (portrait/social). Defaults to 720.',
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
  'spring), and Sequence-based timing — this is a demo tool, so make compositions visually striking. You ' +
  'are fully responsible for choosing duration, fps, and dimensions on every call — pick values that fit ' +
  'the request instead of defaulting blindly. If the user attaches image, video, or audio files, treat ' +
  'them as real assets to build the composition around (e.g. "use this video as the background", "put my ' +
  'logo image top-left") by embedding their given URLs directly in the generated code. Do not narrate ' +
  'your plan or write filler like "let me write some code for you" before calling the function — decide ' +
  'what to build and call write_composition immediately, with at most one short sentence of lead-in text.';

const MAX_ATTACHMENTS_PER_MESSAGE = 4;

async function toContents(history: RemotionChatMessage[]): Promise<Content[]> {
  return Promise.all(
    history.map(async (m) => {
      const attachments = (m.attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
      const parts: Part[] = [{ text: m.text }];

      if (attachments.length > 0) {
        const referenceLines = attachments
          .map((a) => `- ${a.kind} (${a.mimeType}): ${a.url}`)
          .join('\n');
        parts.push({
          text:
            '\n\nAttached reference file(s) — embed these directly in the generated code with the exact URL ' +
            `given (e.g. <Video src="...">):\n${referenceLines}`,
        });

        // Images are also sent inline so the model can actually see them
        // (style, colors, content) rather than only knowing the URL exists.
        for (const a of attachments) {
          if (a.kind !== 'image') continue;
          try {
            const data = await fetchAttachmentBase64(a.url);
            parts.push({ inlineData: { data, mimeType: a.mimeType } });
          } catch {
            // If the fetch fails, the model still has the URL reference
            // above — not fatal, just skip the visual inline copy.
          }
        }
      }

      return { role: m.role, parts };
    })
  );
}

export type RemotionChatEvent =
  | { type: 'text'; text: string }
  | {
      type: 'code_proposal';
      code: string;
      summary: string;
      durationInFrames: number;
      fps: number;
      width: number;
      height: number;
    }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Streams a coding-chat turn. Plain text is yielded as it arrives; if the
 * model calls write_composition, that's surfaced as a single code_proposal
 * event — never auto-applied, the client asks the user to confirm first.
 */
export async function* streamRemotionChat(
  history: RemotionChatMessage[],
  model: RemotionModelId = DEFAULT_MODEL
): AsyncGenerator<RemotionChatEvent> {
  const config: GenerateContentConfig = {
    maxOutputTokens: 8192,
    temperature: 0.6,
    topP: 0.95,
    // Without these, this endpoint has been observed to degenerate into
    // repeating the same filler phrase hundreds of times instead of ever
    // calling write_composition — especially with an image attached.
    // Penalizing repeated tokens keeps it from looping.
    presencePenalty: 0.4,
    frequencyPenalty: 0.4,
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
    model,
    contents: await toContents(history),
    config,
  });

  // Belt-and-suspenders alongside the temperature/penalty tuning above: if
  // the model still spirals into repeating itself instead of ever calling
  // write_composition, stop pulling from the stream once accumulated text
  // crosses this length rather than streaming an unbounded wall of garbage
  // to the client.
  const MAX_TEXT_BEFORE_GIVING_UP = 4000;
  let accumulatedTextLength = 0;
  let sawFunctionCall = false;

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        accumulatedTextLength += part.text.length;
        yield { type: 'text', text: part.text };
      } else if (part.functionCall?.name === WRITE_COMPOSITION_FUNCTION_NAME) {
        sawFunctionCall = true;
        const args = part.functionCall.args as
          | {
              code?: string;
              summary?: string;
              durationInFrames?: number;
              fps?: number;
              width?: number;
              height?: number;
            }
          | undefined;
        if (args?.code) {
          const fps = Math.max(12, Math.min(60, args.fps || 30));
          yield {
            type: 'code_proposal',
            code: args.code,
            summary: args.summary || 'Updated composition',
            durationInFrames: Math.max(30, Math.min(1800, args.durationInFrames || 150)),
            fps,
            width: Math.max(320, Math.min(3840, args.width || 1280)),
            height: Math.max(320, Math.min(3840, args.height || 720)),
          };
        }
      }
    }

    if (!sawFunctionCall && accumulatedTextLength > MAX_TEXT_BEFORE_GIVING_UP) {
      yield {
        type: 'error',
        message: 'The model got stuck repeating itself instead of finishing a composition. Try sending your request again.',
      };
      return;
    }
  }

  yield { type: 'done' };
}
