import { useState } from 'react';
import { api, type EventRow, type Incident, type IncidentStatus } from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { ListSkeleton } from './Skeleton';

interface Stage { status: IncidentStatus; at: number; note?: string }

const STATE: Record<IncidentStatus, { label: string; badge: string; dot: string }> = {
  detected: { label: 'detected', badge: 'open', dot: 'down' },
  diagnosing: { label: 'diagnosing', badge: 'investigating', dot: 'unknown' },
  fix_proposed: { label: 'fix proposed', badge: 'investigating', dot: 'unknown' },
  awaiting_approval: { label: 'awaiting approval', badge: 'pending', dot: 'unknown' },
  merging: { label: 'merging', badge: 'investigating', dot: 'unknown' },
  deploying: { label: 'deploying', badge: 'investigating', dot: 'unknown' },
  verifying: { label: 'verifying', badge: 'investigating', dot: 'unknown' },
  resolved: { label: 'resolved', badge: 'resolved', dot: 'up' },
  reverted: { label: 'rolled back', badge: 'unknown', dot: 'unknown' },
  failed: { label: 'needs manual work', badge: 'down', dot: 'down' },
};

const KIND_LABEL: Record<Incident['kind'], string> = {
  error: 'error', downtime: 'downtime', unreachable: 'unreachable', deploy_failed: 'failed deploy', capacity: 'traffic',
};

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};

/** Compact incident rows. Expanding one shows the whole story: events, diagnosis, the change, the PR and every stage. */
export default function IncidentList({ projectId }: { projectId: string }) {
  const list = useLoad(() => api<{ incidents: Incident[] }>(`/projects/${projectId}/incidents`), [projectId], 8000);
  const act = useAction();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function setStatus(id: string, status: 'resolved' | 'detected') {
    await act.run(() => api(`/incidents/${id}`, { method: 'PATCH', body: { status } }));
    list.reload();
  }
  async function restart(id: string) {
    await act.run(() => api(`/incidents/${id}/diagnose`, { method: 'POST' }));
    list.reload();
  }

  if (list.loading) return <ListSkeleton rows={3} />;
  const incidents = list.data?.incidents ?? [];
  if (list.error && !incidents.length) return <p className="error small">{list.error}</p>;
  if (!incidents.length) {
    return (
      <div className="ws-empty">
        <span className="dot up" /> <b>All quiet</b>
        <p className="muted small">No incidents yet. When something breaks, it shows up here, and in Telegram, with a diagnosis and a fix.</p>
      </div>
    );
  }

  return (
    <div>
      {incidents.map((i) => {
        const isOpen = open[i.id] ?? false; // every incident starts collapsed; click one to see the whole story
        const st = STATE[i.status];
        return (
          <div className="inc" key={i.id}>
            <button className="inc-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [i.id]: !isOpen }))}>
              <span className={`dot ${st.dot}`} />
              <span className="inc-title">{i.summary}</span>
              <span className={`badge ${st.badge}`}>{st.label}</span>
              <svg className={`inc-chev${isOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="inc-meta muted small">
              {KIND_LABEL[i.kind]}{i.route ? ` · ${i.route}` : ''} · opened {fmt(i.created_at)}{i.resolved_at ? ` · closed ${fmt(i.resolved_at)}` : ''}
            </div>
            {isOpen && (
              <IncidentDetail
                projectId={projectId} incident={i} busy={act.busy} done={i.status === 'resolved'}
                onResolve={() => setStatus(i.id, 'resolved')} onReopen={() => setStatus(i.id, 'detected')} onRestart={() => restart(i.id)}
              />
            )}
          </div>
        );
      })}
      {act.error && <p className="error small">{act.error}</p>}
    </div>
  );
}

function IncidentDetail({ projectId, incident: i, busy, done, onResolve, onReopen, onRestart }: {
  projectId: string; incident: Incident; busy: boolean; done: boolean;
  onResolve: () => void; onReopen: () => void; onRestart: () => void;
}) {
  const stages = parse<Stage[]>(i.stage_history, []);
  const patch = parse<{ file?: string } | null>(i.fix_patch, null);
  const suspect = parse<{ sha: string; message: string; author: string } | null>(i.suspect_commit, null);
  const canRestart = (i.status === 'failed' || i.status === 'detected') && !i.merge_sha;

  return (
    <div className="inc-body">
      {i.failure_reason && (i.status === 'failed' || i.status === 'reverted') && (
        <p className="inc-reason">{i.failure_reason}</p>
      )}

      {suspect && (
        <>
          <h3>Prime suspect</h3>
          <p><code>{suspect.sha.slice(0, 7)}</code> {suspect.message} <span className="muted">by {suspect.author}</span></p>
        </>
      )}

      {i.ai_diagnosis
        ? <><h3>Diagnosis</h3><p>{i.ai_diagnosis}</p></>
        : <p className="muted small">{i.status === 'detected' || i.status === 'diagnosing' ? 'Diagnosing…' : 'No diagnosis.'}</p>}

      {(i.fix_summary || i.pr_url) && (
        <>
          <h3>Change</h3>
          <p>
            {patch?.file && <code>{patch.file}</code>} {i.fix_summary}
            {i.fix_forced_ask === 1 && <span className="muted small"> · larger than the safe limit, so approval was required</span>}
          </p>
          <p className="small">
            {i.pr_url && <a href={i.pr_url} target="_blank" rel="noreferrer">Pull request #{i.pr_number} ↗</a>}
            {i.revert_pr_url && <> · <a href={i.revert_pr_url} target="_blank" rel="noreferrer">Revert #{i.revert_pr_number} ↗</a></>}
          </p>
        </>
      )}
      {i.status === 'awaiting_approval' && <p className="muted small">Waiting for your Yes / No in Telegram.</p>}

      <IncidentEvents projectId={projectId} incidentId={i.id} />

      {stages.length > 0 && (
        <>
          <h3>Stages</h3>
          <ol className="stages">
            {stages.map((s, n) => (
              <li key={n}>
                <span className={`dot ${STATE[s.status]?.dot ?? 'unknown'}`} />
                <span>{STATE[s.status]?.label ?? s.status}</span>
                {s.note && <span className="muted small"> · {s.note}</span>}
                <span className="muted small stage-time">{fmt(s.at)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="row">
        {canRestart && <button className="btn small-btn" disabled={busy} onClick={onRestart}>Diagnose again</button>}
        {!done && <button className="btn small-btn" disabled={busy} onClick={onResolve}>Mark resolved</button>}
        {done && <button className="btn small-btn" disabled={busy} onClick={onReopen}>Reopen</button>}
      </div>
    </div>
  );
}

/** The error events that belong to this incident, loaded when it is expanded. */
function IncidentEvents({ projectId, incidentId }: { projectId: string; incidentId: string }) {
  const ev = useLoad(() => api<{ events: EventRow[] }>(`/projects/${projectId}/events?incident_id=${incidentId}&type=error&limit=10`), [projectId, incidentId]);
  const [stack, setStack] = useState<string | null>(null);
  const events = ev.data?.events ?? [];
  if (ev.loading || !events.length) return null;
  return (
    <>
      <h3>Events ({events.length}{events.length === 10 ? '+' : ''})</h3>
      <div className="inc-events">
        {events.map((e) => (
          <div key={e.id} className="inc-event">
            <button className="inc-event-head" onClick={() => setStack(stack === e.id ? null : e.id)} aria-expanded={stack === e.id}>
              <span className="inc-title">{e.message}</span>
              <span className="muted small">{fmt(e.created_at)}</span>
            </button>
            {e.route && <div className="muted small">{e.route}</div>}
            {stack === e.id && e.stack && <pre>{e.stack}</pre>}
          </div>
        ))}
      </div>
    </>
  );
}
