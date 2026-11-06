import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface Option { value: string; label: string; hint?: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Shown when nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name when the select isn't inside a <label>. */
  ariaLabel?: string;
  id?: string;
}

/**
 * The app's dropdown, in place of the browser's native one. Keyboard: Enter/Space/arrows open it, arrows move,
 * Enter picks, Esc closes, typing jumps to a matching option. The list is drawn in a portal so a modal or a
 * scrolling card never clips it, and it flips above the button when there isn't room below.
 */
export default function Select({ value, onChange, options, placeholder = 'Choose…', disabled, ariaLabel, id }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const selected = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const current = selected >= 0 ? options[selected] : undefined;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 180 && above > below;
    const maxH = Math.max(120, Math.min(280, flip ? above : below));
    setPos({ left: r.left, width: r.width, maxH, ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };

  const openList = () => {
    if (disabled) return;
    place();
    setActive(selected >= 0 ? selected : 0);
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (i: number) => { const o = options[i]; if (o) onChange(o.value); close(); };

  // Keep it attached to the button while the page scrolls or resizes; close on an outside press.
  useLayoutEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // Scroll the highlighted option into view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) pick(active); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const t = typed.current;
      t.text = Date.now() - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
      t.at = Date.now();
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(t.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className={`select${open ? ' open' : ''}${current ? '' : ' placeholder'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{current?.label ?? placeholder}</span>
        <svg className="select-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className="select-list"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {options.length === 0 && <li className="select-empty">Nothing to choose</li>}
          {options.map((o, i) => (
            <li
              key={o.value || `_${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`select-opt${i === active ? ' active' : ''}${o.value === value ? ' chosen' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <span className="select-opt-label">{o.label}</span>
              {o.hint && <span className="muted small">{o.hint}</span>}
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
              )}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
