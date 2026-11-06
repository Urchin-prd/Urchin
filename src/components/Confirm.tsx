import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Ask>(() => Promise.resolve(false));

/** Promise-based replacement for window.confirm: `if (!(await confirm({ title: '…' }))) return;` */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const ask = useCallback<Ask>((opts) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    return new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  }, []);

  const close = useCallback((result: boolean) => {
    setState((s) => {
      s?.resolve(result);
      return null;
    });
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!state) return;
    cancelRef.current?.focus(); // safe default: the non-destructive action
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      // Keep Tab inside the dialog.
      if (e.key === 'Tab') {
        const focusables = document.querySelectorAll<HTMLElement>('.dialog button');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {state && (
        <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
            <h2 id="dialog-title">{state.title}</h2>
            {state.description && <p id="dialog-desc" className="muted">{state.description}</p>}
            <div className="dialog-actions">
              <button ref={cancelRef} className="btn" onClick={() => close(false)}>{state.cancelLabel ?? 'Cancel'}</button>
              <button className={`btn ${state.destructive ? 'danger-solid' : 'primary'}`} onClick={() => close(true)}>
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
