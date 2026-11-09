import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Project } from '../api';
import IncidentList from './IncidentList';
import ReviewList from './ReviewList';
import MapPane from './MapPane';

const WIDTH_KEY = 'urchin.map.width';
const DEFAULT_W = 460;
const MIN_MAP = 300;
const MIN_LIST = 320;
const HANDLE = 10;

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return v >= MIN_MAP ? v : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

/**
 * Incidents and the project map, joined in one card with an adjustable divider.
 * Drag the divider (or focus it and use the arrow keys) to resize; double-click to reset.
 */
export default function IncidentsWorkspace({ project }: { project: Project }) {
  const [mapW, setMapW] = useState(readWidth);
  const [mapHidden, setMapHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<'incidents' | 'reviews'>('incidents');
  const ref = useRef<HTMLDivElement>(null);

  const clamp = useCallback((v: number) => {
    const total = ref.current?.getBoundingClientRect().width ?? 1200;
    return Math.round(Math.min(Math.max(v, MIN_MAP), Math.max(MIN_MAP, total - MIN_LIST - HANDLE)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(mapW));
    } catch {
      /* storage unavailable */
    }
  }, [mapW]);

  // Keep the pane within bounds when the window is resized.
  useEffect(() => {
    const onResize = () => setMapW((w) => clamp(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !ref.current) return;
    setMapW(clamp(ref.current.getBoundingClientRect().right - e.clientX - HANDLE / 2));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setMapW((w) => clamp(w + step)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setMapW((w) => clamp(w - step)); }
    if (e.key === 'Home') { e.preventDefault(); setMapW(clamp(MIN_MAP)); }
    if (e.key === 'End') { e.preventDefault(); setMapW(clamp(9999)); }
  };

  return (
    <div
      ref={ref}
      className={`ws${mapHidden ? ' map-hidden' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--map-w': `${mapW}px` } as CSSProperties}
    >
      <section className="ws-list" aria-label="Incidents">
        <div className="ws-head">
          <div className="seg" role="tablist" aria-label="Incidents and push reviews">
            <button type="button" role="tab" aria-selected={tab === 'incidents'} className={tab === 'incidents' ? 'on' : ''} onClick={() => setTab('incidents')}>Incidents</button>
            <button type="button" role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>Push reviews</button>
          </div>
          {mapHidden && <button className="btn small-btn" onClick={() => setMapHidden(false)}>Show map</button>}
        </div>
        <div className="ws-scroll">
          {tab === 'incidents' ? <IncidentList projectId={project.id} /> : <ReviewList project={project} asTab />}
        </div>
      </section>

      {!mapHidden && (
        <>
          <div
            className="ws-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize map"
            aria-valuenow={mapW}
            aria-valuemin={MIN_MAP}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onDoubleClick={() => setMapW(clamp(DEFAULT_W))}
            onKeyDown={onKeyDown}
            title="Drag to resize · double-click to reset"
          >
            <span className="ws-grip" />
          </div>
          <MapPane project={project} onHide={() => setMapHidden(true)} />
        </>
      )}
    </div>
  );
}
