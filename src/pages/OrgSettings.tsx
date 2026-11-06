import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Org } from '../api';
import { useAction, useLoad } from '../hooks';
import Modal from '../components/Modal';
import { PageSkeleton } from '../components/Skeleton';
import { GithubDangerZone } from '../components/GithubCard';

/** Organization settings: name, then the destructive actions. Owners only can change anything. */
export default function OrgSettingsPage() {
  const { orgId = '' } = useParams();
  const nav = useNavigate();
  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const org = orgs.data?.organizations.find((o) => o.id === orgId);
  const isOwner = org?.role === 'owner';

  const [name, setName] = useState('');
  useEffect(() => { if (org) setName(org.name); }, [org?.name]);
  const rename = useAction();
  const [saved, setSaved] = useState(false);
  const [del, setDel] = useState(false);

  if (orgs.loading) return <PageSkeleton />;
  if (!org) return <p className="error">{orgs.error ?? 'Organization not found.'}</p>;

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const res = await rename.run(() => api(`/orgs/${orgId}`, { method: 'PATCH', body: { name } }));
    if (res) { setSaved(true); orgs.reload(); }
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">{org.name} · your role: {org.role}</p>

      <form className="card stack" onSubmit={onRename}>
        <h2>General</h2>
        <label>Organization name
          <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={100} required disabled={!isOwner} />
        </label>
        {isOwner ? (
          <div className="row">
            <button className="btn primary" disabled={rename.busy || !name.trim() || name.trim() === org.name}>{rename.busy ? 'Saving…' : 'Save'}</button>
            {saved && <span className="ok small">Saved</span>}
            {rename.error && <span className="error small">{rename.error}</span>}
          </div>
        ) : <p className="muted small" style={{ margin: 0 }}>Only owners can change settings.</p>}
      </form>

      {isOwner && (
        <>
          <GithubDangerZone orgId={orgId} />
          <div className="card danger-zone">
            <h2>Delete organization</h2>
            <div className="row spread">
              <span className="muted small" style={{ flex: '1 1 220px' }}>Permanently deletes this organization, its services, incidents and keys. This can’t be undone.</span>
              <button className="btn danger" onClick={() => setDel(true)}>Delete organization</button>
            </div>
          </div>
        </>
      )}

      {del && <DeleteOrg org={org} onClose={() => setDel(false)} onDeleted={() => nav('/', { replace: true })} />}
    </>
  );
}

function DeleteOrg({ org, onClose, onDeleted }: { org: Org; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const act = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await act.run(() => api(`/orgs/${org.id}`, { method: 'DELETE', body: { confirm_name: typed } }));
    if (res) onDeleted();
  }
  return (
    <Modal title="Delete organization" description={<>This removes <b>{org.name}</b> and everything in it. Type its name to confirm.</>} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={org.name} autoComplete="off" />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn danger-solid" disabled={act.busy || typed.trim() !== org.name}>{act.busy ? 'Deleting…' : 'Delete forever'}</button>
        </div>
        {act.error && <p className="error small" style={{ margin: 0 }}>{act.error}</p>}
      </form>
    </Modal>
  );
}
