import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PromptNode } from './workflow/PromptNode';
import { ImageNode } from './workflow/ImageNode';
import { randomHandleColor } from './workflow/HandleColumn';
import type {
  ImageFlowNode,
  ImageNodeData,
  NodeContext,
  PromptFlowNode,
  PromptNodeData,
  SerializableNode,
  WorkflowNode,
  WorkflowTemplate,
} from './workflow/types';
import { MAX_HANDLES } from './workflow/types';
import { emptyContext } from './workflow/types';
import { refinePrompt, generateWorkflowImage } from '../workflowApi';
import { uploadAttachment } from '../api';
import { useToasts } from '../hooks/useToasts';
import { ToastStack } from './ToastStack';
import { loadWorkflowTemplates, saveWorkflowTemplates } from '../workflowStorage';
import { FolderIcon, PlayIcon, PlusIcon, SaveIcon } from './icons';

const NODE_TYPES = { promptNode: PromptNode, imageNode: ImageNode };
const DEFAULT_EDGE_COLOR = 'var(--orange-line)';

function newPromptNode(position: { x: number; y: number }): PromptFlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'promptNode',
    position,
    data: {
      prompt: '',
      model: 'gemini-3.5-flash',
      thinkingLevel: 'MEDIUM',
      temperature: 1,
      topP: 0.95,
      // Generous headroom: thinking levels above MINIMAL spend part of the
      // token budget on invisible reasoning before writing output, so a low
      // limit here can come back with an empty result.
      maxOutputTokens: 2048,
      systemInstruction:
        "Rewrite the user's idea into a single, detailed, vivid prompt suitable for an AI image generator. Respond with only the rewritten prompt.",
      attachments: [],
      attachmentsUploading: false,
      inputHandles: ['in-1'],
      outputHandles: ['out-1'],
      outputHandleColors: { 'out-1': randomHandleColor() },
      inputHandleColors: {},
      contextTexts: [],
      contextImages: [],
      status: 'idle',
      onChange: () => {},
      onRun: () => {},
      onAddInput: () => {},
      onRemoveInput: () => {},
      onAddOutput: () => {},
      onRemoveOutput: () => {},
    },
  };
}

function newImageNode(position: { x: number; y: number }): ImageFlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'imageNode',
    position,
    data: {
      directPrompt: '',
      hasUpstream: false,
      model: 'gemini-3.1-flash-image',
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 2048,
      aspectRatio: '1:1',
      imageSize: '2K',
      personGeneration: 'ALLOW_ADULT',
      outputMimeType: 'image/png',
      safetyLevel: 'medium',
      referenceImages: [],
      referenceUploading: false,
      inputHandles: ['in-1'],
      outputHandles: ['out-1'],
      outputHandleColors: { 'out-1': randomHandleColor() },
      inputHandleColors: {},
      contextTexts: [],
      contextImages: [],
      status: 'idle',
      onChange: () => {},
      onRun: () => {},
      onAddInput: () => {},
      onRemoveInput: () => {},
      onAddOutput: () => {},
      onRemoveOutput: () => {},
    },
  };
}

function initialGraph(): { nodes: WorkflowNode[]; edges: Edge[] } {
  const prompt = newPromptNode({ x: 40, y: 140 });
  const image = newImageNode({ x: 520, y: 60 });
  return {
    nodes: [prompt, image],
    edges: [
      {
        id: `${prompt.id}-${image.id}`,
        source: prompt.id,
        target: image.id,
        sourceHandle: 'out-1',
        targetHandle: 'in-1',
      },
    ],
  };
}

/** Strips callbacks and ephemeral run state (status/output/images/error,
 * accumulated context, upload-in-progress flags) before saving — a
 * template is a reusable config, not a snapshot of a specific run. */
function toSerializableNode(n: WorkflowNode): SerializableNode {
  if (n.type === 'imageNode') {
    const {
      onChange: _onChange,
      onRun: _onRun,
      onAddInput: _onAddInput,
      onRemoveInput: _onRemoveInput,
      onAddOutput: _onAddOutput,
      onRemoveOutput: _onRemoveOutput,
      status: _status,
      error: _error,
      images: _images,
      referenceUploading: _referenceUploading,
      hasUpstream: _hasUpstream,
      inputHandleColors: _inputHandleColors,
      contextTexts: _contextTexts,
      contextImages: _contextImages,
      ...rest
    } = n.data;
    return { id: n.id, type: n.type, position: n.position, data: rest };
  }
  const {
    onChange: _onChange,
    onRun: _onRun,
    onAddInput: _onAddInput,
    onRemoveInput: _onRemoveInput,
    onAddOutput: _onAddOutput,
    onRemoveOutput: _onRemoveOutput,
    status: _status,
    error: _error,
    output: _output,
    attachmentsUploading: _attachmentsUploading,
    inputHandleColors: _inputHandleColors,
    contextTexts: _contextTexts,
    contextImages: _contextImages,
    ...rest
  } = n.data;
  return { id: n.id, type: n.type, position: n.position, data: rest };
}

function fromSerializableNode(n: SerializableNode): WorkflowNode {
  if (n.type === 'imageNode') {
    return {
      id: n.id,
      type: 'imageNode',
      position: n.position,
      data: {
        ...(newImageNode({ x: 0, y: 0 }).data),
        ...n.data,
        status: 'idle',
        referenceUploading: false,
        hasUpstream: false,
        contextTexts: [],
        contextImages: [],
      },
    } as ImageFlowNode;
  }
  return {
    id: n.id,
    type: 'promptNode',
    position: n.position,
    data: {
      ...(newPromptNode({ x: 0, y: 0 }).data),
      ...n.data,
      status: 'idle',
      attachmentsUploading: false,
      contextTexts: [],
      contextImages: [],
    },
  } as PromptFlowNode;
}

/** Converts a data: URL (a freshly generated image) into a File so it can
 * be re-uploaded to Cloudinary — a generated image only exists as inline
 * base64 until it has its own fetchable URL for the next hop to use. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/** Kahn's algorithm — nodes with no unmet dependencies first. Any leftover
 * nodes (a cycle) are appended in their original order as a fallback. */
function topologicalOrder(allNodes: WorkflowNode[], allEdges: Edge[]): WorkflowNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of allNodes) inDegree.set(n.id, 0);
  for (const e of allEdges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  }

  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const queue = allNodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  const ordered = new Set(order);
  for (const n of allNodes) if (!ordered.has(n.id)) order.push(n.id);
  return order.map((id) => byId.get(id)!);
}

function mergeContextFromMap(
  nodeId: string,
  allEdges: Edge[],
  contexts: Map<string, NodeContext>
): NodeContext {
  const texts: string[] = [];
  const images: NodeContext['images'] = [];
  for (const e of allEdges) {
    if (e.target !== nodeId) continue;
    const ctx = contexts.get(e.source);
    if (!ctx) continue;
    texts.push(...ctx.texts);
    images.push(...ctx.images);
  }
  return { texts, images };
}

export function WorkflowView() {
  const init = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(init.edges);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(() => loadWorkflowTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Each socket carries at most one wire — connecting a new one to an
  // already-used socket (source or target) replaces the old wire.
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => {
        const filtered = eds.filter(
          (e) =>
            !(e.source === connection.source && e.sourceHandle === connection.sourceHandle) &&
            !(e.target === connection.target && e.targetHandle === connection.targetHandle)
        );
        return addEdge(connection, filtered);
      }),
    [setEdges]
  );

  function updateNodeData<T extends WorkflowNode>(id: string, patch: Partial<T['data']>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowNode) : n)));
  }

  function addHandle(nodeId: string, kind: 'input' | 'output') {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const key = kind === 'input' ? 'inputHandles' : 'outputHandles';
        const current = n.data[key];
        if (current.length >= MAX_HANDLES) return n;
        const prefix = kind === 'input' ? 'in' : 'out';
        const existing = new Set(current);
        let i = current.length + 1;
        let newId = `${prefix}-${i}`;
        while (existing.has(newId)) {
          i += 1;
          newId = `${prefix}-${i}`;
        }
        const patch: Record<string, unknown> = { [key]: [...current, newId] };
        if (kind === 'output') {
          patch.outputHandleColors = { ...n.data.outputHandleColors, [newId]: randomHandleColor() };
        }
        return { ...n, data: { ...n.data, ...patch } } as WorkflowNode;
      })
    );
  }

  function removeHandle(nodeId: string, kind: 'input' | 'output', handleId: string) {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const key = kind === 'input' ? 'inputHandles' : 'outputHandles';
        const current = n.data[key];
        if (current.length <= 1) return n;
        const patch: Record<string, unknown> = { [key]: current.filter((h) => h !== handleId) };
        if (kind === 'output') {
          const { [handleId]: _removed, ...rest } = n.data.outputHandleColors;
          patch.outputHandleColors = rest;
        }
        return { ...n, data: { ...n.data, ...patch } } as WorkflowNode;
      })
    );
    setEdges((eds) =>
      eds.filter((e) =>
        kind === 'input'
          ? !(e.target === nodeId && e.targetHandle === handleId)
          : !(e.source === nodeId && e.sourceHandle === handleId)
      )
    );
  }

  function mergeIncomingContext(nodeId: string): NodeContext {
    const texts: string[] = [];
    const images: NodeContext['images'] = [];
    for (const e of edges) {
      if (e.target !== nodeId) continue;
      const source = nodes.find((n) => n.id === e.source);
      if (!source) continue;
      texts.push(...source.data.contextTexts);
      images.push(...source.data.contextImages);
    }
    return { texts, images };
  }

  async function executePromptNode(id: string, contextOverride?: NodeContext): Promise<NodeContext | undefined> {
    const node = nodes.find((n): n is PromptFlowNode => n.id === id && n.type === 'promptNode');
    if (!node) return undefined;

    const incoming = contextOverride ?? mergeIncomingContext(id);
    const localPrompt = node.data.prompt.trim();
    const combinedPrompt = localPrompt || incoming.texts.join('\n\n');
    const combinedAttachments = [
      ...node.data.attachments.map((a) => ({ url: a.url, mimeType: a.mimeType })),
      ...incoming.images,
    ].slice(0, 6);

    if (!combinedPrompt && combinedAttachments.length === 0) {
      pushToast('This Prompt node has nothing to work with — type an idea, attach an image, or connect an input with content.');
      return undefined;
    }

    updateNodeData<PromptFlowNode>(id, { status: 'running', error: undefined });
    try {
      const text = await refinePrompt({
        model: node.data.model,
        prompt: combinedPrompt || 'Describe this image in vivid, detailed terms suitable for an AI image generator.',
        systemInstruction: node.data.systemInstruction,
        thinkingLevel: node.data.thinkingLevel,
        temperature: node.data.temperature,
        topP: node.data.topP,
        maxOutputTokens: node.data.maxOutputTokens,
        attachments: combinedAttachments,
      });
      const outContext: NodeContext = { texts: [...incoming.texts, text], images: incoming.images };
      updateNodeData<PromptFlowNode>(id, {
        status: 'done',
        output: text,
        error: undefined,
        contextTexts: outContext.texts,
        contextImages: outContext.images,
      });
      return outContext;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prompt refinement failed';
      updateNodeData<PromptFlowNode>(id, { status: 'error', error: message });
      pushToast(message);
      return undefined;
    }
  }

  async function executeImageNode(id: string, contextOverride?: NodeContext): Promise<NodeContext | undefined> {
    const node = nodes.find((n): n is ImageFlowNode => n.id === id && n.type === 'imageNode');
    if (!node) return undefined;

    const incoming = contextOverride ?? mergeIncomingContext(id);
    const prompt = incoming.texts.length > 0 ? incoming.texts.join('\n\n') : node.data.directPrompt.trim();
    const combinedReferences = [
      ...node.data.referenceImages.map((r) => ({ url: r.url, mimeType: r.mimeType })),
      ...incoming.images,
    ].slice(0, 6);

    if (!prompt.trim()) {
      pushToast('This Image node needs a prompt — connect a node with text, or type one directly.');
      return undefined;
    }

    updateNodeData<ImageFlowNode>(id, { status: 'running', error: undefined });
    try {
      const images = await generateWorkflowImage({
        model: node.data.model,
        prompt,
        temperature: node.data.temperature,
        topP: node.data.topP,
        maxOutputTokens: node.data.maxOutputTokens,
        aspectRatio: node.data.aspectRatio,
        imageSize: node.data.imageSize,
        personGeneration: node.data.personGeneration,
        outputMimeType: node.data.outputMimeType,
        safetyLevel: node.data.safetyLevel,
        referenceImages: combinedReferences,
      });
      if (images.length === 0) {
        updateNodeData<ImageFlowNode>(id, { status: 'error', error: 'No image was returned.' });
        pushToast('No image was returned — try adjusting the prompt or safety settings.');
        return undefined;
      }

      // Only worth re-uploading (for the next hop to reference) if this
      // node actually feeds something downstream.
      const hasOutgoing = edges.some((e) => e.source === id);
      const chainImages = hasOutgoing
        ? await Promise.all(
            images.map(async (img, i) => {
              const file = dataUrlToFile(img.dataUrl, `generated-${id}-${i}.png`);
              const uploaded = await uploadAttachment(file);
              return { url: uploaded.url, mimeType: uploaded.mimeType };
            })
          )
        : [];

      const outContext: NodeContext = { texts: incoming.texts, images: [...incoming.images, ...chainImages] };
      updateNodeData<ImageFlowNode>(id, {
        status: 'done',
        images,
        error: undefined,
        contextTexts: outContext.texts,
        contextImages: outContext.images,
      });
      return outContext;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image generation failed';
      updateNodeData<ImageFlowNode>(id, { status: 'error', error: message });
      pushToast(message);
      return undefined;
    }
  }

  async function runAll() {
    const order = topologicalOrder(nodes, edges);
    const contexts = new Map<string, NodeContext>();
    for (const node of order) {
      const incoming = mergeContextFromMap(node.id, edges, contexts);
      const result =
        node.type === 'promptNode'
          ? await executePromptNode(node.id, incoming)
          : await executeImageNode(node.id, incoming);
      contexts.set(node.id, result ?? emptyContext());
    }
  }

  function addNode(kind: 'prompt' | 'image') {
    const offset = nodes.length * 24;
    const node =
      kind === 'prompt'
        ? newPromptNode({ x: 40 + offset, y: 320 + offset })
        : newImageNode({ x: 520 + offset, y: 320 + offset });
    setNodes((nds) => [...nds, node]);
  }

  function saveTemplate() {
    const name = window.prompt('Name this workflow template:');
    if (!name?.trim()) return;
    const template: WorkflowTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      savedAt: Date.now(),
      nodes: nodes.map(toSerializableNode),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    };
    const next = [template, ...templates];
    setTemplates(next);
    saveWorkflowTemplates(next);
    setSelectedTemplateId(template.id);
    pushToast(`Saved "${template.name}".`, 'info');
  }

  function loadTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setNodes(template.nodes.map(fromSerializableNode));
    setEdges(template.edges);
    setSelectedTemplateId(id);
    pushToast(`Loaded "${template.name}".`, 'info');
  }

  function deleteTemplate(id: string) {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    saveWorkflowTemplates(next);
    if (selectedTemplateId === id) setSelectedTemplateId('');
  }

  const displayNodes = nodes.map((n) => {
    const inputHandleColors: Record<string, string> = {};
    for (const handleId of n.data.inputHandles) {
      const edge = edges.find((e) => e.target === n.id && e.targetHandle === handleId);
      if (!edge) continue;
      const source = nodes.find((sn) => sn.id === edge.source);
      const color = source?.data.outputHandleColors[edge.sourceHandle ?? ''];
      if (color) inputHandleColors[handleId] = color;
    }

    if (n.type === 'imageNode') {
      const hasUpstream = edges.some((e) => e.target === n.id);
      const data: ImageNodeData = {
        ...n.data,
        hasUpstream,
        inputHandleColors,
        onChange: (patch) => updateNodeData<ImageFlowNode>(n.id, patch),
        onRun: () => executeImageNode(n.id),
        onAddInput: () => addHandle(n.id, 'input'),
        onRemoveInput: (handleId) => removeHandle(n.id, 'input', handleId),
        onAddOutput: () => addHandle(n.id, 'output'),
        onRemoveOutput: (handleId) => removeHandle(n.id, 'output', handleId),
      };
      return { ...n, data };
    }
    const data: PromptNodeData = {
      ...n.data,
      inputHandleColors,
      onChange: (patch) => updateNodeData<PromptFlowNode>(n.id, patch),
      onRun: () => {
        void executePromptNode(n.id);
      },
      onAddInput: () => addHandle(n.id, 'input'),
      onRemoveInput: (handleId) => removeHandle(n.id, 'input', handleId),
      onAddOutput: () => addHandle(n.id, 'output'),
      onRemoveOutput: (handleId) => removeHandle(n.id, 'output', handleId),
    };
    return { ...n, data };
  });

  const displayEdges = edges.map((e) => {
    const source = nodes.find((n) => n.id === e.source);
    const color = source?.data.outputHandleColors[e.sourceHandle ?? ''];
    return { ...e, style: { stroke: color ?? DEFAULT_EDGE_COLOR, strokeWidth: 2 } };
  });

  return (
    <div className="workflow-view">
      <div className="workflow-toolbar">
        <div className="workflow-toolbar-title">
          <span className="script-accent small">Image Workflow</span>
          <span className="workflow-beta-badge">Beta</span>
        </div>
        <div className="workflow-toolbar-actions">
          <button type="button" className="wf-toolbar-btn" onClick={() => addNode('prompt')}>
            <PlusIcon size={12} /> Prompt node
          </button>
          <button type="button" className="wf-toolbar-btn" onClick={() => addNode('image')}>
            <PlusIcon size={12} /> Image node
          </button>

          <label className="wf-template-select">
            <FolderIcon size={13} />
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                if (e.target.value) loadTemplate(e.target.value);
              }}
            >
              <option value="">Load template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {selectedTemplateId && (
            <button
              type="button"
              className="wf-toolbar-btn"
              title="Delete this template"
              onClick={() => deleteTemplate(selectedTemplateId)}
            >
              Delete
            </button>
          )}

          <button type="button" className="wf-toolbar-btn" onClick={saveTemplate}>
            <SaveIcon size={13} /> Save
          </button>

          <button type="button" className="generate-btn wf-run-all" onClick={() => void runAll()}>
            <PlayIcon size={13} /> Run all
          </button>
        </div>
      </div>

      <div className="workflow-canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          colorMode="dark"
          fitView
        >
          <Background gap={20} color="#2a2a2f" />
          <Controls />
          <MiniMap pannable zoomable className="wf-minimap" />
        </ReactFlow>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
