import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { ReferenceImage } from './types';

interface DropzoneProps {
  files: ReferenceImage[];
  uploading: boolean;
  maxFiles: number;
  placeholder: ReactNode;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}

/** Shared multi-file image drag-and-drop, used by both the Prompt/Refine
 * and Image Gen nodes — drop up to `maxFiles` images, or click to browse. */
export function Dropzone({ files, uploading, maxFiles, placeholder, onFiles, onRemove }: DropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = files.length >= maxFiles;

  function handleFileList(list: FileList | null) {
    if (!list || list.length === 0 || atMax) return;
    const room = maxFiles - files.length;
    onFiles(Array.from(list).slice(0, room));
  }

  return (
    <div className="wf-dropzone-wrap">
      <div
        className={`wf-dropzone nodrag ${dragActive ? 'active' : ''} ${atMax ? 'disabled' : ''}`}
        onClick={() => !atMax && inputRef.current?.click()}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.stopPropagation();
          if (!atMax) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          handleFileList(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
      >
        {uploading ? (
          <span className="spinner wf-spinner" />
        ) : atMax ? (
          <span>Max {maxFiles} files attached</span>
        ) : (
          <span>{placeholder}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handleFileList(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="wf-dropzone-chips">
          {files.map((f, i) => (
            <span key={i} className="wf-dropzone-chip">
              <img src={f.url} alt={f.name} />
              <span className="wf-dropzone-chip-name">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
