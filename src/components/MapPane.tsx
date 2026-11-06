import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, type MapRoute, type Project, type ProjectMap } from '../api';
import { fmt } from '../hooks';
import { Skeleton } from './Skeleton';

// The canvas library is heavy, so it only loads when the graph is opened.
const FlowMap = lazy(() => import('./FlowMap'));

type MapResponse = { map: ProjectMap | null; updated_at: number | null };

const fileName = (p?: string) => (p ? p.split('/').slice(-2).join('/') : 'Other');

/**
 * The project map. By default: routes grouped by the file that defines them, read straight from the GitHub repo
 * (no AI). The flow-chart graph opens in an expanded, full-screen view.
 */
export default function MapPane({ project, onHide }: { project: Project; onHide?: () => void }) {
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [q, setQ] = useState('');
  const [graph, setGraph] = useState(false);
  const autoTried = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setData(await api<MapResponse>(`/projects/${project.id}/map/refresh`, { method: 'POST' }));
    } catch (e) {
      const err = e as ApiError;
      setError({ code: err.code ?? 'error', message: err.message });
    } finally {
      setRefreshing(false);
    }
  }, [project.id]);

  // Load the saved map; if there isn't one yet and the project has a repo, build it automatically (once).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<MapResponse>(`/projects/${project.id}/map`)
      .then((res) => {
        if (!alive) return;
        setData(res);
        if (!res.map && project.github_repo && autoTried.current !== project.id) {
          autoTried.current = project.id;
          void refresh();
        }
      })
      .catch((e: Error) => alive && setError({ code: 'error', message: e.message }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [project.id, project.github_repo, refresh]);

  useEffect(() => {
    if (!graph) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGraph(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [graph]);

  const map = data?.map ?? null;

  // Routes grouped by defining file; routes seen only in errors get their own group.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = new Map<string, MapRoute[]>();
    for (const r of map?.routes ?? []) {
      if (needle && !`${r.method ?? ''} ${r.path} ${r.file ?? ''}`.toLowerCase().includes(needle)) continue;
      const key = r.source === 'observed' ? '__observed' : (r.file ?? '__other');
      by.set(key, [...(by.get(key) ?? []), r]);
    }
    return [...by.entries()].sort((a, b) => {
      if (a[0] === '__observed') return 1;
      if (b[0] === '__observed') return -1;
      return b[1].length - a[1].length;
    });
  }, [map, q]);

  return (
    <section className="map-pane" aria-label="Project map">
      <div className="map-pane-head">
        <div style={{ minWidth: 0 }}>
          <b>Project map</b>
          {map && <div className="muted small map-sub">{map.summary}</div>}
        </div>
        <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
          {project.github_repo && (
            <button className="icon-btn" onClick={refresh} disabled={refreshing} aria-label="Refresh map from GitHub" title={`Refresh from GitHub${data?.updated_at ? ` (last read ${fmt(data.updated_at)})` : ''}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'spin' : ''} aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
            </button>
          )}
          {map && (
            <button className="icon-btn" onClick={() => setGraph(true)} aria-label="Open the graph" title="Open the graph">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11l9.4-4M7.3 13l9.4 4" /></svg>
            </button>
          )}
          {onHide && (
            <button className="icon-btn" onClick={onHide} aria-label="Hide map" title="Hide map">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {!project.github_repo ? (
        <p className="muted small map-msg">
          Add a GitHub repo in <Link to={`/projects/${project.id}/settings`}>Settings</Link> and Urchin will map this project’s routes from it.
        </p>
      ) : (loading || (refreshing && !map)) ? (
        <div className="map-msg stack" role="status" aria-busy="true">
          <span className="sr-only">Reading your repository…</span>
          <Skeleton w="50%" /><Skeleton h={26} r={6} /><Skeleton h={26} r={6} /><Skeleton h={26} r={6} />
        </div>
      ) : error && !map ? (
        <p className="error small map-msg">
          {error.code === 'github_not_connected'
            ? <>GitHub isn’t connected for this organization. <Link to={`/orgs/${project.org_id}`}>Connect it</Link> to build the map.</>
            : error.message}
        </p>
      ) : map ? (
        <>
          {error && <p className="error small map-msg">{error.message}</p>}
          {map.routes.length > 8 && (
            <div className="map-search"><input type="search" placeholder="Filter routes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          )}
          <div className="map-groups">
            {map.routes.length === 0 && (
              <p className="muted small map-msg">No routes detected. Urchin recognises Express, Fastify, Hono, NestJS, Next.js, Flask, FastAPI, Django, Go, Rails and Laravel.</p>
            )}
            {groups.map(([key, routes], idx) => {
              const errors = routes.reduce((n, r) => n + (r.error_count ?? 0), 0);
              return (
                <details className="map-group" key={key} open={idx < 2 || !!q}>
                  <summary>
                    <span className="map-group-name">{key === '__observed' ? 'Seen in errors only' : key === '__other' ? 'Other' : fileName(key)}</span>
                    <span className="muted small">{routes.length}</span>
                    {errors > 0 && <span className="badge down">{errors}</span>}
                  </summary>
                  {routes.map((r, i) => <RouteRow key={`${r.method}${r.path}${i}`} route={r} />)}
                </details>
              );
            })}
            {map.routes.length > 0 && groups.length === 0 && <p className="muted small map-msg">No routes match “{q}”.</p>}
          </div>

          {(map.integrations?.length || map.structure?.length) ? (
            <details className="map-details">
              <summary>
                Details
                <span className="muted small">{map.integrations?.length ? ` · talks to ${map.integrations.join(', ')}` : ''}</span>
              </summary>
              <div className="map-details-body">
                {map.structure?.map((s) => (
                  <div className="row spread small" key={s.dir}><code>{s.dir}/</code><span className="muted">{s.files} {s.files === 1 ? 'file' : 'files'}</span></div>
                ))}
              </div>
            </details>
          ) : null}

          {graph && (
            <div className="map-full" role="dialog" aria-modal="true" aria-label={`${project.name} graph`}>
              <div className="map-full-head">
                <div><b>{project.name}</b> <span className="muted small">· {map.summary}</span></div>
                <div className="row">
                  <span className="muted small"><span className="legend-dot" /> red = errors reported</span>
                  <button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
                  <button className="btn" onClick={() => setGraph(false)}>Close</button>
                </div>
              </div>
              <div className="map-full-canvas">
                <Suspense fallback={<Skeleton h="100%" r={0} />}>
                  <FlowMap project={project} map={map} variant="full" />
                </Suspense>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function RouteRow({ route: r }: { route: MapRoute }) {
  const method = (r.method ?? '*').toUpperCase();
  return (
    <div className="map-route" title={r.file}>
      <span className={`method m-${method.toLowerCase() === '*' ? 'any' : method.toLowerCase()}`}>{method === '*' ? 'ANY' : method}</span>
      <div className="map-route-main"><code>{r.path}</code></div>
      {!!r.error_count && <span className="badge down" title="Errors reported on this route">{r.error_count}</span>}
    </div>
  );
}
