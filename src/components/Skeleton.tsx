import type { CSSProperties } from 'react';

/** A single shimmering placeholder block. Decorative, so hidden from assistive tech. */
export function Skeleton({ w = '100%', h = 14, r = 6, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Wrapper that announces loading once to screen readers. */
function Busy({ children, label = 'Loading' }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Rows of text-like lines inside a card. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Busy>
      <div className="card stack">
        <Skeleton w={140} h={16} />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} w={i === rows - 1 ? '60%' : '100%'} />
        ))}
      </div>
    </Busy>
  );
}

/** A list of item rows (used inside an existing card). */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Busy>
      {Array.from({ length: rows }, (_, i) => (
        <div className="item row spread" key={i}>
          <Skeleton w={`${40 + ((i * 17) % 30)}%`} />
          <Skeleton w={56} h={20} r={999} />
        </div>
      ))}
    </Busy>
  );
}

/** A page: heading + subtitle + a couple of cards. */
export function PageSkeleton() {
  return (
    <Busy>
      <Skeleton w={220} h={28} r={8} style={{ marginBottom: 10 }} />
      <Skeleton w={320} h={14} style={{ marginBottom: 28 }} />
      <div className="card stack"><Skeleton w={120} h={16} /><Skeleton /><Skeleton w="70%" /></div>
      <div className="card stack"><Skeleton w={160} h={16} /><Skeleton /><Skeleton /><Skeleton w="45%" /></div>
    </Busy>
  );
}

/** Whole-app placeholder shown while we find out if you're signed in. Mirrors the real layout. */
export function AppSkeleton() {
  return (
    <div className="layout" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <header className="header" aria-hidden="true">
        <div className="header-left"><Skeleton w={32} h={32} r={6} /><Skeleton w={84} h={18} /></div>
        <Skeleton w={30} h={30} r={999} />
      </header>
      <aside className="sidebar" aria-hidden="true">
        <div className="stack">
          <Skeleton h={30} r={6} /><Skeleton h={30} r={6} w="80%" /><Skeleton h={30} r={6} w="65%" />
        </div>
      </aside>
      <main className="content"><div className="page"><PageSkeleton /></div></main>
    </div>
  );
}
