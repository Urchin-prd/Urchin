import { useState } from 'react';
import { api, type Project } from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { ListSkeleton } from './Skeleton';

interface Finding { severity: 'high' | 'medium' | 'low'; file: string; issue: string; why: string }
interface Review {
  id: string; sha: string; message: string | null; author: string | null; verdict: 'ok' | 'concerns' | 'error'; findings: string; created_at: number;
  incident_status?: string | null; pr_number?: number | null; pr_url?: string | null;
}

const parseFindings = (raw: string): Finding[] => {
  try { return JSON.parse(raw) as Finding[]; } catch { return []; }
};

/** Recent pushes Urchin has read for bugs. A push can deploy fine and still hide a bug that nothing has triggered yet. */
export default function ReviewList({ project, asTab = false }: { project: Project; asTab?: boolean }) {
  const list = useLoad(() => api<{ reviews: Review[] }>(`/projects/${project.id}/reviews`), [project.id], 30000);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const again = useAction();
  const [busySha, setBusySha] = useState<string | null>(null);
  async function rerun(sha: string) {
    setBusySha(sha);
    await again.run(() => api(`/projects/${project.id}/reviews/${sha}/retry`, { method: 'POST' }));
    setBusySha(null);
    list.reload();
  }
  const reviews = list.data?.reviews ?? [];
  if (list.loading && asTab) return <ListSkeleton rows={3} />;
  if (!reviews.length) {
    return asTab ? <p className="muted small" style={{ margin: 0, padding: '12px 14px' }}>No pushes reviewed yet. Urchin reads each push to your main branch and flags risky changes.</p> : null;
  }

  return (
    <div className="reviews">
      {again.error && <p className="error small">{again.error}</p>}
      {!asTab && <h3 className="reviews-title">Push reviews</h3>}
      {reviews.slice(0, 8).map((r) => {
        const findings = parseFindings(r.findings);
        const isOpen = open[r.id] ?? false;
        const concern = r.verdict === 'concerns';
        // A review that opened an incident follows it: being fixed, fixed (by Urchin's pull request), or rolled back.
        const st = r.incident_status;
        const fixed = r.verdict === 'concerns' && st === 'resolved';
        const rolledBack = r.verdict === 'concerns' && st === 'reverted';
        const working = r.verdict === 'concerns' && !!st && !['resolved', 'reverted', 'failed'].includes(st);
        const label = fixed ? 'fixed' : rolledBack ? 'rolled back' : working ? 'being fixed'
          : r.verdict === 'ok' ? 'looks fine' : r.verdict === 'concerns' ? `${findings.length} to check` : 'not reviewed';
        const tone = fixed ? 'resolved' : working ? 'pending' : concern ? 'pending' : r.verdict === 'ok' ? 'resolved' : 'unknown';
        return (
          <div className="inc" key={r.id}>
            <button className="inc-head" aria-expanded={isOpen} disabled={!findings.length} onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))}>
              <span className={`dot ${fixed ? 'up' : concern ? 'unknown' : r.verdict === 'ok' ? 'up' : 'investigated'}`} />
              <span className="inc-title">{r.message ?? r.sha.slice(0, 7)}</span>
              <span className={`badge ${tone}`}>{label}</span>
            </button>
            <div className="inc-meta muted small">
              {project.github_repo
                ? <a href={`https://github.com/${project.github_repo}/commit/${r.sha}`} target="_blank" rel="noreferrer">{r.sha.slice(0, 7)} ↗</a>
                : r.sha.slice(0, 7)}
              {r.author ? ` · ${r.author}` : ''} · {fmt(r.created_at)}
              {r.verdict === 'error' && (
                <> · <button className="link-btn" disabled={busySha === r.sha} onClick={() => rerun(r.sha)}>{busySha === r.sha ? 'Reviewing…' : 'Review again'}</button></>
              )}
            </div>
            {isOpen && findings.length > 0 && (
              <div className="inc-body">
                {fixed && (
                  <p className="muted small" style={{ margin: '0 0 8px' }}>
                    Fixed by Urchin{r.pr_url ? <> in <a href={r.pr_url} target="_blank" rel="noreferrer">pull request #{r.pr_number} ↗</a></> : ''}. Check that every finding below is covered.
                  </p>
                )}
                {findings.map((f, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <span className={`badge ${f.severity === 'high' ? 'down' : f.severity === 'medium' ? 'pending' : 'unknown'}`}>{f.severity}</span>{' '}
                    {f.file && <code>{f.file}</code>}
                    <p style={{ margin: '4px 0 0' }}>{f.issue}</p>
                    {f.why && <p className="muted small" style={{ margin: 0 }}>{f.why}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
