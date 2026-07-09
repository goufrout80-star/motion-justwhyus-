export type VideoMode = 'auto' | 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit';
export type VideoDuration = 'auto' | number;

export type AttachmentKind = 'image' | 'audio' | 'video' | 'document';

/** A file attached in chat or the manual panel. Uploaded directly to
 * Cloudinary from the browser (bypassing Vercel's ~4.5MB serverless
 * function request body limit) — `url` is a public Cloudinary URL the
 * server fetches server-side when it needs the actual bytes. Kept in
 * memory only; never persisted to localStorage. */
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  url: string;
}

/** Lightweight, persisted stand-in for an Attachment — just enough to show
 * a chip in the chat history after reload, once the real file data is gone. */
export interface AttachmentMeta {
  name: string;
  kind: AttachmentKind;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt?: number;
  attachments?: AttachmentMeta[];
  /** Set while waiting on the user's yes/no — shows inline confirm buttons. */
  pendingVideoPrompt?: string;
  /** The prompt actually used for generation — kept around (even after
   * confirm/cancel) so a failed attempt can be retried without re-asking. */
  videoPrompt?: string;
  isGeneratingVideo?: boolean;
  videoUrl?: string;
  videoError?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

// ============================================================
// Remotion Studio — chat-driven video composition builder
// ============================================================

export type RemotionModelId = 'gemini-3.5-flash' | 'gemini-3.1-pro';

export interface RemotionMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt?: number;
  attachments?: AttachmentMeta[];
  /** A proposed composition awaiting the user's yes/no. */
  pendingCode?: string;
  pendingSummary?: string;
  pendingDurationInFrames?: number;
  pendingFps?: number;
  pendingWidth?: number;
  pendingHeight?: number;
  /** True once this message's proposal was accepted and applied. */
  applied?: boolean;
}

export interface RemotionProject {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Which model this project's chat uses — switchable per project. */
  model: RemotionModelId;
  /** The currently active, applied composition. Empty until the first
   * proposal is accepted — the preview shows a placeholder until then. */
  code: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  messages: RemotionMessage[];
}

export function kindFromMimeType(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}
