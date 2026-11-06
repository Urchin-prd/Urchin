import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useConfirm } from '../components/Confirm';
import { FEATURES, PROJECT_SECTIONS } from '../constants';
import ProjectSettings from './ProjectSettings';
import SetupChecklist from '../components/SetupChecklist';
import {
  API_URL, api, type Automation, type EventRow, type Incident, type ProjectMap, type Project,
} from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { ListSkeleton, PageSkeleton } from '../components/Skeleton';
import ConnectPanel from '../components/Connect';
import IncidentsWorkspace from '../components/Workspace';

export default function ProjectPage() {
  const { projectId = '', section } = useParams();
  const project = useLoad(() => api<{ project: Project }>(`/projects/${projectId}`), [projectId], 15000);
  const p = project.data?.project;

  if (project.loading) return <PageSkeleton />;
  if (!p) return <p className="error">{project.error ?? 'Project not found.'}</p>;

  // No (or unknown) section: a service that hasn't reported yet opens on Connect, otherwise Incidents.
  const known = PROJECT_SECTIONS.find((s) => s.id === section);
  if (!known) {
    return <Navigate to={`/projects/${p.id}/${p.last_heartbeat_at ? 'incidents' : 'connect'}`} replace />;
  }
  const current = known.id;

  return (
    <div className="project-main">
      <div className="project-head">
        <div className="row" style={{ gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
          <Link to={`/orgs/${p.org_id}`} className="muted small" title="Back to organization" style={{ textDecoration: 'none' }}>← Back</Link>
          <h1>{p.name}</h1>
          <span className={`badge ${p.status}`}>{p.status}</span>
        </div>
        <span className="muted small">{p.github_repo ?? 'No repo'} · last heartbeat {fmt(p.last_heartbeat_at)}</span>
      </div>
      <SetupChecklist project={p} />
      {current === 'connect' && <div className="card"><ConnectPanel project={p} /></div>}
      {current === 'incidents' && <IncidentsWorkspace project={p} />}
      {current === 'automations' && FEATURES.automations && <Automations projectId={p.id} />}
      {current === 'settings' && <ProjectSettings project={p} onSaved={project.reload} />}
    </div>
  );
}

// ---------------- Automations ----------------

const TRIGGER_SHORT: Record<string, string> = {
  incident_opened: 'Incident opened', incident_diagnosed: 'Incident diagnosed',
  service_down: 'Service down', service_recovered: 'Service recovered',
};

function Automations({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const list = useLoad(() => api<{ automations: Automation[] }>(`/projects/${projectId}/automations`), [projectId]);
  const act = useAction();

  async function create() {
    const res = await act.run(() => api<{ automation: { id: string } }>(`/projects/${projectId}/automations`, { body: { name: 'New automation' } }));
    if (res) nav(`/projects/${projectId}/automations/${res.automation.id}`);
  }
  async function patch(id: string, body: Partial<Pick<Automation, 'enabled' | 'permission'>>) {
    await act.run(() => api(`/automations/${id}`, { method: 'PATCH', body }));
    list.reload();
  }
  async function remove(a: Automation) {
    const ok = await confirm({
      title: `Delete "${a.name}"?`,
      description: 'The flow and its run history will be removed. This can\'t be undone.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    await act.run(() => api(`/automations/${a.id}`, { method: 'DELETE' }));
    list.reload();
  }

  const items = list.data?.automations ?? [];
  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Automations</h2>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Build flows that react to what happens: pick a trigger, add conditions, and choose what Urchin does.
          </p>
        </div>
        <button className="btn primary" onClick={create} disabled={act.busy}>New automation</button>
      </div>

      {list.loading && <ListSkeleton rows={2} />}
      {!list.loading && items.length === 0 && (
        <p className="var-empty muted">No automations yet. Create one to get a custom Telegram message when something happens.</p>
      )}
      {items.map((a) => (
        <div className="item auto-row" key={a.id}>
          <div style={{ minWidth: 0 }}>
            <Link to={`/projects/${projectId}/automations/${a.id}`}>{a.name}</Link>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {a.triggers?.length
                ? a.triggers.map((t) => <span key={t} className="badge">{TRIGGER_SHORT[t] ?? t}</span>)
                : <span className="muted small">No flow yet. Open it to build one.</span>}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <label className="switch" title="Also propose a fix and ask for Approve / Reject in Telegram after diagnosing (owners only)">
              <input type="checkbox" checked={a.permission === 'take_action'} disabled={act.busy}
                onChange={(e) => patch(a.id, { permission: e.target.checked ? 'take_action' : 'read_only' })} />
              <span className="small">Approval for fixes</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={a.enabled} disabled={act.busy} onChange={(e) => patch(a.id, { enabled: e.target.checked })} />
              <span className="small">{a.enabled ? 'On' : 'Off'}</span>
            </label>
            <Link className="btn small-btn" style={{ textDecoration: 'none' }} to={`/projects/${projectId}/automations/${a.id}`}>Edit</Link>
            <button className="btn small-btn danger" onClick={() => remove(a)} disabled={act.busy}>Delete</button>
          </div>
        </div>
      ))}
      {(act.error || list.error) && <p className="error small">{act.error ?? list.error}</p>}
    </div>
  );
}
