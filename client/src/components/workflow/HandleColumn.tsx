import { Handle, Position, type HandleType } from '@xyflow/react';
import { MAX_HANDLES } from './types';
import { PlusIcon } from '../icons';

/** A genuinely random, vivid hue — called once per connector at creation
 * time (not derived from the id), so every socket gets its own distinct
 * color rather than everything sharing 1-2 colors by name. */
export function randomHandleColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 75%, 58%)`;
}

const UNCONNECTED_COLOR = 'var(--muted)';

interface HandleColumnProps {
  type: HandleType;
  position: Position.Left | Position.Right;
  ids: string[];
  /** Handle id -> color. Outputs: assigned once at creation (stable).
   * Inputs: computed from whatever output they're currently wired to. */
  colors: Record<string, string>;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/** A vertical strip of connector sockets along one edge of a workflow node
 * — up to MAX_HANDLES, with a "+" to add another and a small "×" to remove
 * one (once there's more than one). Each socket only ever carries a single
 * connection — wiring a new edge to an already-used socket replaces the
 * old one instead of stacking (enforced in WorkflowView's onConnect). */
export function HandleColumn({ type, position, ids, colors, onAdd, onRemove }: HandleColumnProps) {
  const side = position === Position.Left ? 'left' : 'right';
  return (
    <div className={`wf-handle-column wf-handle-column-${side}`}>
      {ids.map((id) => (
        <div key={id} className="wf-handle-row">
          <Handle type={type} position={position} id={id} style={{ background: colors[id] ?? UNCONNECTED_COLOR }} />
          {ids.length > 1 && (
            <button
              type="button"
              className="wf-handle-remove nodrag"
              title="Remove connector"
              onClick={() => onRemove(id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {ids.length < MAX_HANDLES && (
        <button type="button" className="wf-handle-add nodrag" title="Add connector" onClick={onAdd}>
          <PlusIcon size={10} />
        </button>
      )}
    </div>
  );
}
