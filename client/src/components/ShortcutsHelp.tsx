import { useEffect, useState } from 'react';
import { KeyboardIcon } from './icons';

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Enter', description: 'Send the current message' },
  { keys: 'Shift + Enter', description: 'Insert a new line without sending' },
  { keys: 'Esc', description: 'Stop an in-flight response, or cancel an edit' },
  { keys: 'Double-click a chat title', description: 'Rename that chat' },
  { keys: '?', description: 'Open this shortcuts panel' },
];

/** A small, self-contained "tool": a keyboard-shortcuts reference panel.
 * Opens via the sidebar footer button or the "?" key (ignored while typing
 * in an input/textarea so it doesn't hijack a literal "?" character). */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '?' && !typing) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="shortcuts-trigger"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={() => setOpen(true)}
      >
        <KeyboardIcon size={15} />
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Keyboard shortcuts</h3>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <ul className="shortcuts-list">
              {SHORTCUTS.map((s) => (
                <li key={s.keys}>
                  <kbd>{s.keys}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
