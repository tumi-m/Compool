'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Acknowledgement for actions whose result lands somewhere else on the page, or
 * nowhere visible at all.
 *
 * The click-through found half a dozen actions that worked and looked like they
 * had not: a confirmation rendered above the fold, a run dispatched with no word
 * about where it went, an item removed with no way back. A toast is the smallest
 * thing that fixes all of them at once — and an undo on it is what lets a
 * destructive action stay one click without being careless.
 */

export type Tone = 'info' | 'good' | 'warn';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  toast: (message: string, opts?: { tone?: Tone; action?: Toast['action']; ms?: number }) => void;
}

const Ctx = createContext<ToastApi>({ toast: () => {} });

let counter = 0;

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());
  const paused = useRef(false);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      const t = window.setTimeout(() => {
        // Never pull a toast out from under a pointer or keyboard focus: that is
        // exactly when someone is reaching for its Undo.
        if (paused.current) return schedule(id, 1500);
        dismiss(id);
      }, ms);
      timers.current.set(id, t);
    },
    [dismiss],
  );

  const toast = useCallback<ToastApi['toast']>(
    (message, opts = {}) => {
      const id = ++counter;
      setItems((xs) => [...xs.slice(-3), { id, message, tone: opts.tone ?? 'info', action: opts.action }]);
      // Longer when there is something to act on.
      schedule(id, opts.ms ?? (opts.action ? 8000 : 5000));
    },
    [schedule],
  );

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="toaster"
        role="region"
        aria-label="Notifications"
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        onFocus={() => (paused.current = true)}
        onBlur={() => (paused.current = false)}
      >
        {/* Polite, so it never interrupts what a screen reader is already saying. */}
        <div aria-live="polite" aria-atomic="false" className="toastStack">
          {items.map((t) => (
            <div key={t.id} className="toast" data-tone={t.tone}>
              <span className="toastMsg">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="toastAction"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button type="button" className="toastClose" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}
