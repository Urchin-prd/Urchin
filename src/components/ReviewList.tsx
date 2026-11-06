import { useState } from 'react';
import { api, type Project } from '../api';
import { fmt, useLoad } from '../hooks';

interface Finding { severity: 'high' | 'medium' | 'low'; file: string; issue: string; why: string }
interface Review { id: string; sha: string; message: string | null; author: string | null; verdict: 'ok' | 'concerns' | 'error'; findings: string; created_at: number }

const parseFindings = (raw: string): Finding[] => {
  try { return JSON.parse(raw) as Finding[]; } catch { return []; }
};

/** Recent pushes Urchin has read for bugs. A push can deploy fine and still hide a bug that nothing has triggered yet. */
export default function ReviewList({ project }: { project: Project }) {
  const list = useLoad(() => api<{ reviews: Review[] }>(`/projects/${project.id}/reviews`), [project.id], 30000);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const reviews = list.data?.reviews ?? [];
  if (!reviews.length) return null;

  return (
    <div className="reviews">
      <h3 className="reviews-title">Push reviews</h3>
      {reviews.slice(0, 8).map((r) => {
        const findings = parseFindings(r.findings);
        const isOpen = open[r.id] ?? false;
        const concern = r.verdict === 'concerns';
        const label = r.verdict === 'ok' ? 'looks fine' : r.verdict === 'concerns' ? `${findings.length} to check` : 'not reviewed';
        return (
          <div className="inc" key={r.id}>
            <button className="inc-head" aria-expanded={isOpen} disabled={!findings.length} onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))}>
              <span className={`dot ${concern ? 'unknown' : r.verdict === 'ok' ? 'up' : 'investigated'}`} />
              <span className="inc-title">{r.message ?? r.sha.slice(0, 7)}</span>
              <span className={`badge ${concern ? 'pending' : r.verdict === 'ok' ? 'resolved' : 'unknown'}`}>{label}</span>
            </button>
            <div className="inc-meta muted small">
              {project.github_repo
                ? <a href={`https://github.com/${project.github_repo}/commit/${r.sha}`} target="_blank" rel="noreferrer">{r.sha.slice(0, 7)} ↗</a>
                : r.sha.slice(0, 7)}
              {r.author ? ` · ${r.author}` : ''} · {fmt(r.created_at)}
            </div>
            {isOpen && findings.length > 0 && (
              <div className="inc-body">
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
