export interface GenerationResult {
  type: 'text' | 'video' | 'image';
  text?: string;
  dataUrl?: string;
  uri?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function generate(prompt: string, image: File | null): Promise<GenerationResult[]> {
  const body: Record<string, string> = { prompt };

  if (image) {
    body.imageBase64 = await fileToBase64(image);
    body.imageMimeType = image.type;
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // The server may (rarely) return non-JSON — e.g. a platform-level crash page.
  // Read as text first and parse defensively so we surface a useful message.
  const text = await res.text();
  let data: { results?: GenerationResult[]; error?: unknown; message?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text.slice(0, 500) || 'Unexpected server response');
  }

  if (!res.ok) {
    const message =
      data?.message || (typeof data?.error === 'string' ? data.error : null) || text.slice(0, 500);
    throw new Error(message || 'Generation failed');
  }

  return (data?.results ?? []) as GenerationResult[];
}
