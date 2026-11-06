import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Onboarding, { hasSkippedService } from './Onboarding';
import { api, type GithubStatus, type Org, type Project } from '../api';
import { useAction, useLoad } from '../hooks';
import { GITHUB_MESSAGES, ORG_KEY } from '../constants';
import { useConfirm } from '../components/Confirm';
import { PageSkeleton, Skeleton } from '../components/Skeleton';
import GithubCard from '../components/GithubCard';
import Modal from '../components/Modal';
import Select from '../components/Select';
import HowItWorks from '../components/HowItWorks';

export default function OrgPage() {
  const { orgId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const firstProjects = useLoad(() => api<{ projects: Project[] }>(`/orgs/${orgId}/projects`), [orgId]);
  const org = orgs.data?.organizations.find((o) => o.id === orgId);
  const isOwner = org?.role === 'owner';


  useEffect(() => {
    try {
      sessionStorage.setItem(ORG_KEY, orgId);
    } catch {
      /* storage unavailable */
    }
  }, [orgId]);

  const gh = params.get('github');
  const ghMsg = gh ? GITHUB_MESSAGES[gh] : undefined;

  if (orgs.loading || firstProjects.loading) return <PageSkeleton />;
  if (!org) return <p className="error">{orgs.error ?? 'Organization not found.'}</p>;
  // A new org's home IS the guided setup (inside the dashboard shell). If the user skipped adding a service,
  // show the regular org page; remaining setup lives in the sidebar tracks.
  if (firstProjects.data?.projects.length === 0 && !hasSkippedService(orgId) && !gh) return <Onboarding />;

  return (
    <>
      <Link to="/" className="small">← Organizations</Link>
      <h1>{org.name}</h1>
      <p className="muted small">Your role: {org.role} · <Link to={`/orgs/${orgId}/setup`}>Guided setup</Link></p>
      {ghMsg && (
        <div className="card row spread">
          <span className={ghMsg.ok ? 'ok' : 'error'}>{ghMsg.text}</span>
          <button className="btn" onClick={() => { params.delete('github'); setParams(params, { replace: true }); }}>Dismiss</button>
        </div>
      )}
      <GithubCard orgId={orgId} isOwner={isOwner} />
      <ProjectsSection orgId={orgId} />
    </>
  );
}

// ---------------- Projects ----------------

function ProjectsSection({ orgId }: { orgId: string }) {
  const nav = useNavigate();
  const projects = useLoad(() => api<{ projects: Project[] }>(`/orgs/${orgId}/projects`), [orgId], 20000);
  const gh = useLoad(() => api<GithubStatus>(`/orgs/${orgId}/github`), [orgId]);
  const repos = useLoad(
    async () => (gh.data?.connected ? api<{ repos: { full_name: string }[] }>(`/orgs/${orgId}/github/repos`) : { repos: [] }),
    [orgId, gh.data?.connected],
  );
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [interval, setIntervalMin] = useState(1);
  const [downAfter, setDownAfter] = useState(3);
  const [liveUrl, setLiveUrl] = useState('');
  const [healthPath, setHealthPath] = useState('/');
  const create = useAction();
  const [open, setOpen] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await create.run(() =>
      api<{ project: Project }>(`/orgs/${orgId}/projects`, {
        body: {
          name, github_repo: repo || undefined, check_interval_minutes: interval, down_after_minutes: downAfter,
          live_url: liveUrl.trim() || undefined, health_path: liveUrl.trim() ? healthPath.trim() || '/' : undefined,
        },
      }),
    );
    // Land on the new service's Connect tab so the code snippets are right there.
    if (res) nav(`/projects/${res.project.id}`);
  }

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 14 }}>
        <h2 className="row" style={{ margin: 0, gap: 8 }}>Projects <HowItWorks /></h2>
        <button className="btn primary" onClick={() => setOpen(true)}>New project</button>
      </div>

      {projects.data?.projects.length === 0 && <p className="muted">No projects yet.</p>}
      {projects.data?.projects.map((p) => (
        <div className="item row spread" key={p.id}>
          <span><Link to={`/projects/${p.id}`}>{p.name}</Link> <span className="muted small">{p.github_repo}</span></span>
          <span className={`badge ${p.status}`}>{p.status}</span>
        </div>
      ))}
      {open && (
        <Modal title="New project" description="A service Urchin watches." onClose={() => setOpen(false)} width={520}>
          <form className="stack" onSubmit={onCreate}>
            <div className="grid">
              <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
              <label>GitHub repo
                {repos.data && repos.data.repos.length > 0 ? (
                  <Select value={repo} onChange={setRepo} ariaLabel="GitHub repo"
                    options={[{ value: '', label: 'None' }, ...repos.data.repos.map((r) => ({ value: r.full_name, label: r.full_name }))]} />
                ) : (
                  <input placeholder="owner/name (optional)" value={repo} onChange={(e) => setRepo(e.target.value)} />
                )}
              </label>
              <label>Check every (minutes)<input type="number" min={1} max={60} value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} /></label>
              <label>Down after no heartbeat (minutes)<input type="number" min={1} max={1440} value={downAfter} onChange={(e) => setDownAfter(Number(e.target.value))} /></label>
            </div>
            <div className="grid">
              <label><span className="lbl">Live URL <em>optional</em></span>
                <input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://api.example.com" inputMode="url" />
              </label>
              <label><span className="lbl">Health path <em>optional</em></span>
                <input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/" disabled={!liveUrl.trim()} />
              </label>
            </div>
            <p className="muted small" style={{ margin: 0 }}>With a live URL, Urchin pings it and uses it to verify fixes.</p>
            <div className="row">
              <button className="btn primary" disabled={create.busy || !name.trim()}>{create.busy ? 'Creating…' : 'Create project'}</button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              {create.error && <span className="error">{create.error}</span>}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
