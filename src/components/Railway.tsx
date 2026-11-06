import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Project } from '../api';
import { useAction, useLoad } from '../hooks';
import { useConfirm } from './Confirm';
import KebabMenu from './KebabMenu';
import Modal from './Modal';
import Select from './Select';
import { Skeleton } from './Skeleton';
import { RailwayLogo } from './Logos';

interface RailwayStatus { configured: boolean; connected: boolean; account_name: string | null }
interface RailwayProject { id: string; name: string; services: { id: string; name: string }[]; environments: { id: string; name: string }[] }

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Railway connected.', ok: true },
  denied: { text: 'Railway access was not approved.', ok: false },
  expired: { text: 'That connect link expired. Try again.', ok: false },
  error: { text: 'Something went wrong connecting Railway.', ok: false },
};

/** Integrations card: connect the organization's Railway account (read-only). Reconnect and Disconnect live in the ⋮ menu. */
export function RailwayCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const status = useLoad(() => api<RailwayStatus>(`/orgs/${orgId}/railway`), [orgId]);
  const [params, setParams] = useSearchParams();
  const act = useAction();
  const confirm = useConfirm();
  const msg = MESSAGES[params.get('railway') ?? ''];
  const s = status.data;

  async function connect() {
    const res = await act.run(() => api<{ url: string }>(`/orgs/${orgId}/railway/connect-url`, { method: 'POST' }));
    if (res) window.location.href = res.url;
  }
  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect Railway?',
      description: 'Urchin stops reading deployments, logs and metrics from Railway, and every service loses its Railway link. You can also revoke access on Railway.',
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    await act.run(() => api(`/orgs/${orgId}/railway`, { method: 'DELETE' }));
    status.reload();
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}><RailwayLogo /><h2 style={{ margin: 0 }}>Railway</h2></div>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          {!status.loading && (s?.connected ? <span className="badge up">Connected</span> : <span className="badge unknown">Not connected</span>)}
          {isOwner && s?.connected && (
            <KebabMenu label="Railway actions" items={[
              { label: 'Reconnect', onSelect: connect, disabled: act.busy },
              { label: 'Disconnect', onSelect: disconnect, danger: true, disabled: act.busy },
            ]} />
          )}
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Read-only. Lets Urchin check your host’s deployments, logs and CPU/memory when diagnosing.
      </p>
      {msg && (
        <p className={msg.ok ? 'ok small' : 'error small'} style={{ margin: 0 }}>
          {msg.text} <button className="link-btn" onClick={() => { params.delete('railway'); setParams(params, { replace: true }); }}>Dismiss</button>
        </p>
      )}
      {s?.connected && s.account_name && <p className="muted small" style={{ margin: 0 }}>Signed in as <b>{s.account_name}</b>. Link a service under its Settings.</p>}
      {status.loading && <Skeleton w={110} h={32} r={6} />}
      {!status.loading && s && !s.configured && <p className="muted small" style={{ margin: 0 }}>Not set up on the backend yet (Railway client ID and secret).</p>}
      {!status.loading && s?.configured && !s.connected && isOwner && (
        <div><button className="btn" onClick={connect} disabled={act.busy}>{act.busy ? 'Opening…' : 'Connect Railway'}</button></div>
      )}
      {!status.loading && s?.configured && !s.connected && !isOwner && <p className="muted small" style={{ margin: 0 }}>Ask an owner to connect.</p>}
      {(act.error || status.error) && <p className="error small" style={{ margin: 0 }}>{act.error ?? status.error}</p>}
    </div>
  );
}

/**
 * Service Settings: which Railway project, service and environment this service runs on.
 * Only shown once Railway is connected for the organization; the form opens in a modal.
 */
export function RailwayLink({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const status = useLoad(() => api<RailwayStatus>(`/orgs/${project.org_id}/railway`), [project.org_id]);
  const [open, setOpen] = useState(false);
  const linked = !!project.railway_service_id;

  if (!status.data?.connected) return null; // nothing to link until the integration is connected

  return (
    <div className="card">
      <div className="setting">
        <div className="setting-main">
          <div className="setting-title">
            <h2>Hosting</h2>
            {linked ? <span className="badge up">Railway linked</span> : <span className="badge unknown">Not linked</span>}
          </div>
          <span className="setting-sum">
            {linked ? 'Urchin checks Railway’s deployments, logs and CPU/memory for this service.' : 'Link this service to its Railway service so diagnoses can use its logs and metrics.'}
          </span>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>{linked ? 'Edit' : 'Link service'}</button>
      </div>
      {open && <LinkModal project={project} linked={linked} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />}
    </div>
  );
}

function LinkModal({ project, linked, onClose, onSaved }: { project: Project; linked: boolean; onClose: () => void; onSaved: () => void }) {
  const list = useLoad(() => api<{ projects: RailwayProject[] }>(`/orgs/${project.org_id}/railway/projects`), [project.org_id]);
  const [pid, setPid] = useState(project.railway_project_id ?? '');
  const [sid, setSid] = useState(project.railway_service_id ?? '');
  const [eid, setEid] = useState(project.railway_environment_id ?? '');
  const act = useAction();
  const projects = list.data?.projects ?? [];
  const current = projects.find((p) => p.id === pid);

  async function save(clear = false) {
    const body = clear
      ? { railway_project_id: null, railway_service_id: null, railway_environment_id: null }
      : { railway_project_id: pid, railway_service_id: sid, railway_environment_id: eid };
    const res = await act.run(() => api(`/projects/${project.id}`, { method: 'PATCH', body }));
    if (res) onSaved();
  }

  return (
    <Modal title="Railway hosting" description="Pick where this service runs on Railway." onClose={onClose} width={480}>
      {list.loading ? (
        <div className="stack"><Skeleton w="100%" h={38} r={6} /><Skeleton w="100%" h={38} r={6} /><Skeleton w="100%" h={38} r={6} /></div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label>Project
            <Select value={pid} onChange={(v) => { setPid(v); setSid(''); setEid(''); }} ariaLabel="Railway project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          </label>
          <label>Service
            <Select value={sid} onChange={setSid} disabled={!current} ariaLabel="Railway service"
              options={(current?.services ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </label>
          <label>Environment
            <Select value={eid} onChange={setEid} disabled={!current} ariaLabel="Railway environment"
              options={(current?.environments ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          </label>
          {!list.error && projects.length === 0 && <p className="muted small" style={{ margin: 0 }}>No Railway projects found. Reconnect Railway and allow a workspace.</p>}
          {(act.error || list.error) && <p className="error small" style={{ margin: 0 }}>{act.error ?? list.error}</p>}
          <div className="dialog-actions">
            {linked && <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={() => void save(true)} disabled={act.busy}>Unlink</button>}
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={act.busy || !pid || !sid || !eid}>{act.busy ? 'Saving…' : linked ? 'Update' : 'Link service'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
