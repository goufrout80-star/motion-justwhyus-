import { useEffect, useState } from 'react';
import { Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { PromptFlowNode } from './types';
import { PROMPT_MODELS, MAX_REFERENCE_FILES } from './types';
import type { ThinkingLevel } from '../../workflowApi';
import { uploadAttachment } from '../../api';
import { Dropzone } from './Dropzone';
import { HandleColumn } from './HandleColumn';
import { ChatIcon, ImageIcon, PlayIcon } from '../icons';

const THINKING_LEVELS: ThinkingLevel[] = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];

export function PromptNode({ id, data }: NodeProps<PromptFlowNode>) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
      data.onChange({ error: 'Only image files can be attached.' });
      return;
    }
    data.onChange({ attachmentsUploading: true, error: undefined });
    try {
      const uploaded = await Promise.all(
        images.map(async (f) => {
          const a = await uploadAttachment(f);
          return { url: a.url, mimeType: a.mimeType, name: a.name };
        })
      );
      data.onChange({
        attachments: [...data.attachments, ...uploaded].slice(0, MAX_REFERENCE_FILES),
        attachmentsUploading: false,
      });
    } catch (err) {
      data.onChange({
        attachmentsUploading: false,
        error: err instanceof Error ? err.message : 'Attachment upload failed',
      });
    }
  }

  function removeAttachment(index: number) {
    data.onChange({ attachments: data.attachments.filter((_, i) => i !== index) });
  }

  return (
    <div className="wf-node wf-node-prompt">
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
        <ChatIcon size={15} className="wf-node-icon" />
        Prompt / Refine
      </div>

      <Dropzone
        files={data.attachments}
        uploading={data.attachmentsUploading}
        maxFiles={MAX_REFERENCE_FILES}
        placeholder={
          <>
            <ImageIcon size={15} /> Drop up to 6 images for context, or click to browse
          </>
        }
        onFiles={(files) => void handleFiles(files)}
        onRemove={removeAttachment}
      />

      <label className="wf-field">
        <span>Idea</span>
        <textarea
          className="nodrag"
          rows={3}
          placeholder="Describe what you want, roughly…"
          value={data.prompt}
          onChange={(e) => data.onChange({ prompt: e.target.value })}
        />
      </label>

      <label className="wf-field">
        <span>Model</span>
        <select className="nodrag" value={data.model} onChange={(e) => data.onChange({ model: e.target.value as PromptFlowNode['data']['model'] })}>
          {PROMPT_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="wf-field">
        <span>Thinking level</span>
        <select
          className="nodrag"
          value={data.thinkingLevel}
          onChange={(e) => data.onChange({ thinkingLevel: e.target.value as ThinkingLevel })}
        >
          {THINKING_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l.charAt(0) + l.slice(1).toLowerCase()}
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

      <button type="button" className="wf-advanced-toggle nodrag" onClick={() => setAdvancedOpen((v) => !v)}>
        {advancedOpen ? '▾' : '▸'} Advanced: system instruction
      </button>
      {advancedOpen && (
        <label className="wf-field">
          <textarea
            className="nodrag"
            rows={3}
            value={data.systemInstruction}
            onChange={(e) => data.onChange({ systemInstruction: e.target.value })}
          />
        </label>
      )}

      <button
        type="button"
        className="wf-run-btn nodrag"
        disabled={data.status === 'running'}
        onClick={data.onRun}
      >
        {data.status === 'running' ? <span className="spinner wf-spinner" /> : <PlayIcon size={12} />} Run
      </button>

      {data.error && <div className="wf-node-error">{data.error}</div>}
      {data.output && (
        <div className="wf-node-output">
          <span className="wf-output-label">Refined prompt</span>
          <p>{data.output}</p>
        </div>
      )}
    </div>
  );
}
