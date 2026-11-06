import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** A three-dot button that opens a small menu. Esc and outside clicks close it; arrows move between items. */
export default function KebabMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('.kebab')?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...(menu.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="kebab-wrap" ref={root}>
      <button type="button" className="icon-btn kebab" aria-label={typeof label === 'string' ? label : 'More actions'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
      </button>
      {open && (
        <div className="kebab-menu" role="menu" ref={menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`kebab-item${it.danger ? ' danger' : ''}`}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onSelect(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
