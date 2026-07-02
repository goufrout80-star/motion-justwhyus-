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
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || 'Generation failed');
  }

  return data.results as GenerationResult[];
}
