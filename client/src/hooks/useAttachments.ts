import { useState, type ChangeEvent } from 'react';
import { uploadAttachment, MAX_ATTACHMENT_BYTES } from '../api';
import type { Attachment } from '../types';

/**
 * Shared file-attachment state for the chat composer and the manual create
 * panel: validates size/count, uploads to Cloudinary, and tracks the
 * uploading/error state around it. Both surfaces need identical behavior
 * here, so it's pulled out rather than duplicated.
 */
export function useAttachments(maxFiles: number) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setError(null);
    const room = maxFiles - attachments.length;
    if (room <= 0) {
      setError(`You can attach up to ${maxFiles} file${maxFiles === 1 ? '' : 's'} at once.`);
      return;
    }

    const toAdd = files.slice(0, room);
    const oversized = toAdd.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = toAdd.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);

    if (oversized.length > 0) {
      const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
      setError(`${oversized.map((f) => f.name).join(', ')} exceeds the ${limitMb}MB attachment limit.`);
    }
    if (files.length > toAdd.length) {
      setError(`Only ${maxFiles} file${maxFiles === 1 ? '' : 's'} can be attached at once.`);
    }
    if (ok.length === 0) return;

    setUploading(true);
    try {
      const converted = await Promise.all(ok.map(uploadAttachment));
      setAttachments((prev) => [...prev, ...converted]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clear() {
    setAttachments([]);
  }

  return { attachments, uploading, error, addFiles, remove, clear, setError };
}
