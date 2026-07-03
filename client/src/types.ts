export type VideoMode = 'auto' | 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit';
export type VideoDuration = 'auto' | number;

export type AttachmentKind = 'image' | 'audio' | 'video' | 'document';

/** A file attached in chat or the manual panel. `dataUrl` is kept in memory
 * only — attachments are never persisted to localStorage (base64 media can
 * easily blow the ~5-10MB quota), so they don't survive a page reload. */
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  dataUrl: string;
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
  attachments?: AttachmentMeta[];
  pendingVideoPrompt?: string;
  isGeneratingVideo?: boolean;
  videoUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export function kindFromMimeType(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}
