import { api, type GithubStatus, type Org } from '../api';
import { useAction, useLoad } from '../hooks';
import { useConfirm } from './Confirm';
import { Skeleton } from './Skeleton';
import GithubPermissions from './GithubPermissions';

export default function GithubCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const status = useLoad(() => api<GithubStatus>(`/orgs/${orgId}/github`), [orgId]);
  const act = useAction();
  const confirm = useConfirm();

  async function connect() {
    const res = await act.run(() => api<{ url: string }>(`/orgs/${orgId}/github/install-url`, { method: 'POST' }));
    if (res) window.location.href = res.url;
  }
  const g = status.data;
  return (
    <div className="card">
      <h2>GitHub</h2>
      {status.loading ? <Skeleton w="55%" h={32} r={6} /> : g?.connected ? (
        <div className="row spread">
          <span>Connected to <b>{g.github?.account_login ?? 'GitHub'}</b></span>
          {isOwner && (
            <button className="btn" onClick={connect} disabled={act.busy}>Change repos</button>
          )}
        </div>
      ) : (
        <div className="row spread">
          <span className="muted">Let Urchin read your repos (and later open fix PRs) by installing the GitHub App.</span>
          {isOwner ? <button className="btn primary" onClick={connect} disabled={act.busy}>Connect GitHub</button>
            : <span className="muted small">Ask an owner to connect.</span>}
        </div>
      )}
      <GithubPermissions status={g} />
      {(act.error || status.error) && <p className="error">{act.error ?? status.error}</p>}
    </div>
  );
}


/** Danger zone for the organization's GitHub connection. Shown to owners while GitHub is connected. */
export function GithubDangerZone({ orgId }: { orgId: string }) {
  const status = useLoad(() => api<GithubStatus>(`/orgs/${orgId}/github`), [orgId]);
  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const act = useAction();
  const confirm = useConfirm();
  const isOwner = orgs.data?.organizations.find((o) => o.id === orgId)?.role === 'owner';
  if (!status.data?.connected || !isOwner) return null;

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect GitHub?',
      description: 'Urchin will stop reading this organization’s repositories, for every service in it. The GitHub App stays installed; you can remove it separately in your GitHub settings.',
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    await act.run(() => api(`/orgs/${orgId}/github`, { method: 'DELETE' }));
    status.reload();
  }

  return (
    <div className="card danger-zone">
      <h2>Danger zone</h2>
      <div className="row spread">
        <span className="muted small" style={{ flex: '1 1 220px' }}>Disconnect GitHub for the whole organization. Every service loses repository access.</span>
        <button className="btn danger" onClick={disconnect} disabled={act.busy}>Disconnect GitHub</button>
      </div>
      {act.error && <p className="error small">{act.error}</p>}
    </div>
  );
}
