import type { Node } from '@xyflow/react';
import type { PersonGeneration, SafetyLevel, ThinkingLevel, WorkflowImage } from '../../workflowApi';

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export const PROMPT_MODELS = ['gemini-3.5-flash', 'gemini-3.1-pro-preview'] as const;
export const IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
] as const;

export const MAX_REFERENCE_FILES = 6;
export const MAX_HANDLES = 5;

export interface ReferenceImage {
  url: string;
  mimeType: string;
  name: string;
}

/** What flows along the wires: every node's own output gets unioned into
 * whatever it received, so by the time a chain reaches its last node, that
 * node has everything accumulated from every upstream node — however many
 * hops away — not just its one direct neighbor. */
export interface NodeContext {
  texts: string[];
  images: { url: string; mimeType: string }[];
}

export function emptyContext(): NodeContext {
  return { texts: [], images: [] };
}

/** Shared by every node type: a variable number of input/output connector
 * sockets (up to MAX_HANDLES each), plus the callbacks for the "+"/"-" UI
 * to add or remove one. Each output socket gets a random, stable color
 * assigned once at creation; input sockets are gray until wired, at which
 * point they (and the edge) take on the connected output's color. */
export interface HandlePorts {
  inputHandles: string[];
  outputHandles: string[];
  outputHandleColors: Record<string, string>;
  /** Computed fresh each render from current edges — not persisted. */
  inputHandleColors: Record<string, string>;
  onAddInput: () => void;
  onRemoveInput: (handleId: string) => void;
  onAddOutput: () => void;
  onRemoveOutput: (handleId: string) => void;
}

export interface PromptNodeData extends Record<string, unknown>, HandlePorts {
  prompt: string;
  model: (typeof PROMPT_MODELS)[number];
  thinkingLevel: ThinkingLevel;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  systemInstruction: string;
  /** Dropped/uploaded reference images (up to MAX_REFERENCE_FILES) — sent
   * alongside the idea text so refinement can consider them. */
  attachments: ReferenceImage[];
  attachmentsUploading: boolean;
  output?: string;
  /** Everything accumulated up to and including this node's own output —
   * what downstream nodes read as their incoming context. */
  contextTexts: string[];
  contextImages: { url: string; mimeType: string }[];
  status: NodeStatus;
  error?: string;
  onChange: (patch: Partial<PromptNodeData>) => void;
  onRun: () => void;
}

export interface ImageNodeData extends Record<string, unknown>, HandlePorts {
  /** Only used when there's no usable incoming text context. */
  directPrompt: string;
  hasUpstream: boolean;
  model: (typeof IMAGE_MODELS)[number];
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  aspectRatio: string;
  imageSize: '1K' | '2K' | '4K';
  personGeneration: PersonGeneration;
  outputMimeType: 'image/png' | 'image/jpeg';
  safetyLevel: SafetyLevel;
  /** Dropped/uploaded reference images (up to MAX_REFERENCE_FILES) — sent
   * alongside the prompt so the model can use them for image-to-image /
   * style/subject reference. */
  referenceImages: ReferenceImage[];
  referenceUploading: boolean;
  images?: WorkflowImage[];
  /** Everything accumulated up to and including this node's own output —
   * what downstream nodes read as their incoming context. Generated images
   * are re-uploaded to Cloudinary here so they have a fetchable URL for the
   * next hop, the same way a dropped reference image does. */
  contextTexts: string[];
  contextImages: { url: string; mimeType: string }[];
  status: NodeStatus;
  error?: string;
  onChange: (patch: Partial<ImageNodeData>) => void;
  onRun: () => void;
}

export type PromptFlowNode = Node<PromptNodeData, 'promptNode'>;
export type ImageFlowNode = Node<ImageNodeData, 'imageNode'>;
export type WorkflowNode = PromptFlowNode | ImageFlowNode;

/** The subset of node data worth persisting in a saved template — no
 * callbacks, no run status/output/generated images/context (those are
 * ephemeral and would bloat localStorage with base64 image data). */
export type SerializableNode = {
  id: string;
  type: 'promptNode' | 'imageNode';
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export interface WorkflowTemplate {
  id: string;
  name: string;
  savedAt: number;
  nodes: SerializableNode[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[];
}
