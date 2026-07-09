import { useEffect } from 'react';
import { Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { ImageFlowNode } from './types';
import { IMAGE_MODELS, MAX_REFERENCE_FILES } from './types';
import type { PersonGeneration, SafetyLevel } from '../../workflowApi';
import { uploadAttachment } from '../../api';
import { Dropzone } from './Dropzone';
import { HandleColumn } from './HandleColumn';
import { DownloadIcon, ImageIcon, PlayIcon } from '../icons';

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
const IMAGE_SIZES: ImageFlowNode['data']['imageSize'][] = ['1K', '2K', '4K'];
const PERSON_GENERATION: PersonGeneration[] = ['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE'];
const SAFETY_LEVELS: SafetyLevel[] = ['off', 'low', 'medium', 'high'];
const MIME_TYPES: ImageFlowNode['data']['outputMimeType'][] = ['image/png', 'image/jpeg'];

function downloadImage(dataUrl: string, mimeType: string) {
  const ext = mimeType.split('/')[1] || 'png';
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `nanoni-image-${Date.now()}.${ext}`;
  a.click();
}

export function ImageNode({ id, data }: NodeProps<ImageFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();

  // React Flow caches each node's handle positions; when handles are added
  // or removed dynamically (our +/- connector buttons) it must be told to
  // recompute them, or it throws trying to route edges to stale handles.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.inputHandles.length, data.outputHandles.length, updateNodeInternals]);

  async function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      data.onChange({ error: 'Only image files can be used as a reference.' });
      return;
    }
    data.onChange({ referenceUploading: true, error: undefined });
    try {
      const uploaded = await Promise.all(
        images.map(async (f) => {
          const a = await uploadAttachment(f);
          return { url: a.url, mimeType: a.mimeType, name: a.name };
        })
      );
      data.onChange({
        referenceImages: [...data.referenceImages, ...uploaded].slice(0, MAX_REFERENCE_FILES),
        referenceUploading: false,
      });
    } catch (err) {
      data.onChange({
        referenceUploading: false,
        error: err instanceof Error ? err.message : 'Reference image upload failed',
      });
    }
  }

  function removeReference(index: number) {
    data.onChange({ referenceImages: data.referenceImages.filter((_, i) => i !== index) });
  }

  return (
    <div className="wf-node wf-node-image">
      <HandleColumn
        type="target"
        position={Position.Left}
        ids={data.inputHandles}
        colors={data.inputHandleColors}
        onAdd={data.onAddInput}
        onRemove={data.onRemoveInput}
      />
      <HandleColumn
        type="source"
        position={Position.Right}
        ids={data.outputHandles}
        colors={data.outputHandleColors}
        onAdd={data.onAddOutput}
        onRemove={data.onRemoveOutput}
      />

      <div className="wf-node-header">
        <ImageIcon size={15} className="wf-node-icon" />
        Image Gen
      </div>

      <Dropzone
        files={data.referenceImages}
        uploading={data.referenceUploading}
        maxFiles={MAX_REFERENCE_FILES}
        placeholder={
          <>
            <ImageIcon size={15} /> Drop up to 6 reference images, or click to browse
          </>
        }
        onFiles={(files) => void handleFiles(files)}
        onRemove={removeReference}
      />

      <label className="wf-field">
        <span>{data.hasUpstream ? 'Prompt (fallback)' : 'Prompt'}</span>
        <textarea
          className="nodrag"
          rows={2}
          placeholder="Connect a Prompt node, or type directly…"
          value={data.directPrompt}
          onChange={(e) => data.onChange({ directPrompt: e.target.value })}
        />
      </label>

      <label className="wf-field">
        <span>Model</span>
        <select className="nodrag" value={data.model} onChange={(e) => data.onChange({ model: e.target.value as ImageFlowNode['data']['model'] })}>
          {IMAGE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <div className="wf-field-row">
        <label className="wf-field">
          <span>Temperature</span>
          <input
            className="nodrag"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={data.temperature}
            onChange={(e) => data.onChange({ temperature: Number(e.target.value) })}
          />
        </label>
        <label className="wf-field">
          <span>Top P</span>
          <input
            className="nodrag"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={data.topP}
            onChange={(e) => data.onChange({ topP: Number(e.target.value) })}
          />
        </label>
        <label className="wf-field">
          <span>Max tokens</span>
          <input
            className="nodrag"
            type="number"
            min={16}
            max={8192}
            step={16}
            value={data.maxOutputTokens}
            onChange={(e) => data.onChange({ maxOutputTokens: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="wf-field-row">
        <label className="wf-field">
          <span>Aspect ratio</span>
          <select className="nodrag" value={data.aspectRatio} onChange={(e) => data.onChange({ aspectRatio: e.target.value })}>
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Size</span>
          <select
            className="nodrag"
            value={data.imageSize}
            onChange={(e) => data.onChange({ imageSize: e.target.value as ImageFlowNode['data']['imageSize'] })}
          >
            {IMAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Format</span>
          <select
            className="nodrag"
            value={data.outputMimeType}
            onChange={(e) => data.onChange({ outputMimeType: e.target.value as ImageFlowNode['data']['outputMimeType'] })}
          >
            {MIME_TYPES.map((m) => (
              <option key={m} value={m}>
                {m.split('/')[1].toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="wf-field-row">
        <label className="wf-field">
          <span>People</span>
          <select
            className="nodrag"
            value={data.personGeneration}
            onChange={(e) => data.onChange({ personGeneration: e.target.value as PersonGeneration })}
          >
            {PERSON_GENERATION.map((p) => (
              <option key={p} value={p}>
                {p.replace('ALLOW_', '')}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Safety</span>
          <select
            className="nodrag"
            value={data.safetyLevel}
            onChange={(e) => data.onChange({ safetyLevel: e.target.value as SafetyLevel })}
          >
            {SAFETY_LEVELS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button type="button" className="wf-run-btn nodrag" disabled={data.status === 'running'} onClick={data.onRun}>
        {data.status === 'running' ? <span className="spinner wf-spinner" /> : <PlayIcon size={12} />} Run
      </button>

      {data.error && <div className="wf-node-error">{data.error}</div>}
      {data.images && data.images.length > 0 && (
        <div className="wf-image-results">
          {data.images.map((img, i) => (
            <div key={i} className="wf-image-result">
              <img src={img.dataUrl} alt="Generated" />
              <button type="button" className="nodrag" onClick={() => downloadImage(img.dataUrl, img.mimeType)}>
                <DownloadIcon size={14} /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
