import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  kind: 'error' | 'info';
}

const AUTO_DISMISS_MS = 6000;

/** A small toast-notification stack — replaces static error banners with
 * dismissible, auto-expiring notifications that don't permanently occupy
 * layout space once read. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
  }, []);

  const push = useCallback(
    (message: string, kind: Toast['kind'] = 'error') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, kind }]);
      timersRef.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}
