export type ThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
export type PersonGeneration = 'ALLOW_ALL' | 'ALLOW_ADULT' | 'ALLOW_NONE';
export type SafetyLevel = 'off' | 'low' | 'medium' | 'high';

export interface ReferenceImageRef {
  url: string;
  mimeType: string;
}

/**
 * Forces Cloudinary to deliver a clean, standard PNG regardless of the
 * original file's format or color profile. Exotic sources (HEIC, CMYK
 * JPEGs, WEBP with unusual profiles) can otherwise trip Gemini's image
 * validator with a bare "Provided image is not valid." — letting
 * Cloudinary re-encode first sidesteps that entirely.
 */
function normalizeReferenceImage(ref: ReferenceImageRef): ReferenceImageRef {
  const url = ref.url.includes('/upload/') ? ref.url.replace('/upload/', '/upload/f_png,q_auto/') : ref.url;
  return { url, mimeType: 'image/png' };
}

export interface RefinePromptRequest {
  model: string;
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  attachments?: ReferenceImageRef[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: (T & { error?: string }) | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text.slice(0, 500) || 'Unexpected server response');
  }
  if (!res.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data as T;
}

export async function refinePrompt(req: RefinePromptRequest): Promise<string> {
  const body: RefinePromptRequest = {
    ...req,
    attachments: req.attachments?.map(normalizeReferenceImage),
  };
  const { text } = await postJson<{ text: string }>('/api/workflow/refine-prompt', body);
  return text;
}

export interface GenerateImageRequest {
  model: string;
  prompt: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  aspectRatio?: string;
  imageSize?: string;
  personGeneration?: PersonGeneration;
  outputMimeType?: string;
  safetyLevel?: SafetyLevel;
  /** Cloudinary URLs for dropped/uploaded reference images (up to 6) — the
   * server fetches them and passes them to the model alongside the prompt. */
  referenceImages?: ReferenceImageRef[];
}

export interface WorkflowImage {
  mimeType: string;
  dataUrl: string;
}

export async function generateWorkflowImage(req: GenerateImageRequest): Promise<WorkflowImage[]> {
  const body: GenerateImageRequest = {
    ...req,
    referenceImages: req.referenceImages?.map(normalizeReferenceImage),
  };
  const { images } = await postJson<{ images: WorkflowImage[] }>('/api/workflow/generate-image', body);
  return images;
}
