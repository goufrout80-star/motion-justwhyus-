export type VideoMode = 'auto' | 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'edit';
export type VideoDuration = 'auto' | number;

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
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
