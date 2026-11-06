/** Urchin mark: a round body with radiating spines. Uses currentColor so it themes automatically. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const spines = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = 7.5;
    const r2 = i % 2 === 0 ? 14 : 11.5;
    return { x1: 16 + r1 * Math.cos(a), y1: 16 + r1 * Math.sin(a), x2: 16 + r2 * Math.cos(a), y2: 16 + r2 * Math.sin(a) };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {spines.map((s, i) => (
        <line key={i} {...s} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ))}
      <circle cx="16" cy="16" r="6.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Urchin</span>
    </span>
  );
}
