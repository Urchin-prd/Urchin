import { useState, type FormEvent, type ReactNode } from 'react';
import { API_URL, api, type AgentSettings, type FixMode, type Project } from '../api';
import { useAction, useLoad } from '../hooks';
import { ProviderModal } from './Integrations';
import { RailwayLink } from '../components/Railway';
import Modal from '../components/Modal';

const PROVIDER_NAME = { anthropic: 'Claude', groq: 'Groq', serv: 'SERV Reasoning' } as const;

/**
 * Project settings: the AI key and the fix mode sit at the top as cards; the service's own settings and key follow.
 * Telegram and GitHub live under Integrations.
 */
export default function ProjectSettings({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [aiModal, setAiModal] = useState(false);
  // Poll while a Telegram link code is outstanding, so the card flips to "linked" by itself.
  const settings = useLoad(() => api<{ agent_settings: AgentSettings }>(`/orgs/${project.org_id}/agent-settings`), [project.org_id]);
  const s = settings.data?.agent_settings;
  const mode = useAction();

  async function setMode(fix_mode: FixMode) {
    if (fix_mode === project.fix_mode) return;
    const res = await mode.run(() => api(`/projects/${project.id}`, { method: 'PATCH', body: { fix_mode } }));
    if (res) onSaved();
  }

  const noRepo = !project.github_repo;
  return (
    <>
      <div className="setup-grid">
        <StepCard title="AI key" done={!!s?.has_api_key} doneText={s?.ai_provider ? `${PROVIDER_NAME[s.ai_provider]} connected` : 'Connected'}>
          <p className="muted small">Urchin uses your own key to diagnose incidents and write fixes.</p>
          <button className="btn" onClick={() => setAiModal(true)}>{s?.has_api_key ? 'Change key' : 'Add key'}</button>
        </StepCard>

        <StepCard title="Fix mode" done doneText={project.fix_mode === 'auto' ? 'Fixes automatically' : 'Asks first'}>
          <div className="seg" role="radiogroup" aria-label="Fix mode">
            {([['ask', 'Ask first'], ['auto', 'Automatic']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={project.fix_mode === id} className={project.fix_mode === id ? 'on' : ''} onClick={() => setMode(id)} disabled={mode.busy}>{label}</button>
            ))}
          </div>
          <p className="muted small">
            {project.fix_mode === 'auto'
              ? `Urchin opens a pull request, merges it straight away, watches for ${project.verify_minutes} minutes, and rolls it back if the error returns.`
              : 'Urchin opens a pull request and asks you in Telegram (Yes / No) before merging anything.'}
          </p>
          {noRepo && <p className="muted small">Fixes need a GitHub repository. Add one below.</p>}
          <p className="muted small">Needs the GitHub App to have Contents and Pull requests write access, and Deployments read. The GitHub card on your organization page shows what is granted.</p>
          {mode.error && <p className="error small">{mode.error}</p>}
        </StepCard>
      </div>

      {aiModal && (
        <ProviderModal
          orgId={project.org_id}
          current={s}
          onClose={() => setAiModal(false)}
          onSaved={() => { setAiModal(false); settings.reload(); }}
        />
      )}

      <ServiceForm project={project} onSaved={onSaved} />
      <RailwayLink project={project} onSaved={onSaved} />
      <ChecksCard project={project} onSaved={onSaved} />
      <KeyCard project={project} />
    </>
  );
}

function StepCard({ title, done, doneText, children }: { title: string; done: boolean; doneText: string; children: ReactNode }) {
  return (
    <div className="card step-card">
      <div className="row spread" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {done ? <span className="step-done"><span className="ob-check">✓</span>{doneText}</span> : <span className="muted small">Not set up</span>}
      </div>
      <div className="stack">{children}</div>
    </div>
  );
}

/** Summary of the service's own settings; the form opens in a modal. */
function ServiceForm({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="setting">
        <div className="setting-main">
          <div className="setting-title"><h2>Service</h2></div>
          <span className="setting-sum"><b>{project.name}</b>{project.github_repo ? <> · {project.github_repo}</> : ' · no repository'}</span>
          <span className="setting-sum">
            {project.live_url ? <>{project.live_url.replace(/^https?:\/\//, '')} · </> : 'No live URL · '}
            checked every {project.check_interval_minutes} min · down after {project.down_after_minutes} min · fixes verified for {project.verify_minutes} min
          </span>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>Edit</button>
      </div>
      {open && <ServiceModal project={project} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />}
    </div>
  );
}

function ServiceModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [repo, setRepo] = useState(project.github_repo ?? '');
  const [liveUrl, setLiveUrl] = useState(project.live_url ?? '');
  const [healthPath, setHealthPath] = useState(project.health_path);
  const [interval, setIntervalMin] = useState(project.check_interval_minutes);
  const [downAfter, setDownAfter] = useState(project.down_after_minutes);
  const [verifyFor, setVerifyFor] = useState(project.verify_minutes);
  const act = useAction();

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await act.run(() =>
      api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          name, github_repo: repo.trim() || null, live_url: liveUrl.trim() || null,
          health_path: healthPath.trim() || '/', check_interval_minutes: interval, down_after_minutes: downAfter, verify_minutes: verifyFor,
        },
      }),
    );
    if (res) onSaved();
  }

  return (
    <Modal title="Service settings" onClose={onClose} width={560}>
      <form className="stack" onSubmit={save}>
        <div className="grid">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
          <label>GitHub repository<input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" /></label>
        </div>
        <div className="grid">
          <label><span className="lbl">Live URL <em>optional</em></span>
            <input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://api.example.com" inputMode="url" />
          </label>
          <label><span className="lbl">Health path <em>optional</em></span>
            <input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/" disabled={!liveUrl.trim()} />
          </label>
        </div>
        <div className="grid grid-3">
          <label>Check every (min)<input type="number" min={1} max={60} value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} /></label>
          <label>Down after (min)<input type="number" min={1} max={1440} value={downAfter} onChange={(e) => setDownAfter(Number(e.target.value))} /></label>
          <label>Verify fixes (min)<input type="number" min={1} max={60} value={verifyFor} onChange={(e) => setVerifyFor(Number(e.target.value))} /></label>
        </div>
        <p className="hint">Down after = silence from heartbeats. Verify = how long a deployed fix is watched.</p>
        {act.error && <p className="error small" style={{ margin: 0 }}>{act.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={act.busy || !name.trim()}>{act.busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function KeyCard({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card stack">
      <h2>Project key</h2>
      <p className="muted small">Your service sends this as the <code>x-urchin-key</code> header. Treat it like a password. The setup code is on the Connect page.</p>
      <div className="row">
        <code style={{ wordBreak: 'break-all' }}>{project.project_key}</code>
        <button className="btn small-btn" onClick={() => navigator.clipboard.writeText(project.project_key).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Reports go to <code>{API_URL}</code></p>
    </div>
  );
}

interface SmokeResult { checked: number; skipped: number; failures: { route: string; status: number | null; detail: string }[]; at: number; note?: string }

/** Looks for bugs that nothing has triggered yet. */
function ChecksCard({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const toggle = useAction();
  const smoke = useAction();
  const saved = (() => { try { return project.last_smoke_result ? (JSON.parse(project.last_smoke_result) as SmokeResult) : null; } catch { return null; } })();
  const [result, setResult] = useState<SmokeResult | null>(saved);

  async function set(field: 'review_pushes' | 'smoke_checks', value: boolean) {
    const res = await toggle.run(() => api(`/projects/${project.id}`, { method: 'PATCH', body: { [field]: value } }));
    if (res) onSaved();
  }
  async function runNow() {
    const res = await smoke.run(() => api<{ result: SmokeResult }>(`/projects/${project.id}/smoke-check`, { method: 'POST' }));
    if (res) { setResult(res.result); onSaved(); }
  }

  const mins = result ? Math.max(1, Math.round((Date.now() - result.at) / 60_000)) : 0;
  return (
    <div className="card stack">
      <h2>Bug checks</h2>
      <div className="opt-list">
        <label className="opt-row">
          <input type="checkbox" checked={project.review_pushes === 1} disabled={toggle.busy} onChange={(e) => set('review_pushes', e.target.checked)} />
          <span className="opt-text"><b>Review every push</b><span>Warns you in Telegram about risky changes.</span></span>
        </label>
        <label className="opt-row">
          <input type="checkbox" checked={project.smoke_checks === 1} disabled={toggle.busy} onChange={(e) => set('smoke_checks', e.target.checked)} />
          <span className="opt-text"><b>Smoke-check</b><span>Calls safe GET routes after deploys and daily. Needs a live URL.</span></span>
        </label>
      </div>

      <div className="check-actions">
        <button className="btn" onClick={runNow} disabled={smoke.busy || !project.live_url}>{smoke.busy ? 'Checking…' : 'Run smoke check'}</button>
        {!project.live_url && <span className="muted small">Set a live URL first.</span>}
        {result && !result.note && (
          <span className="small muted">
            {mins} min ago · {result.checked} checked ·{' '}
            <b style={{ color: result.failures.length ? 'var(--down)' : 'var(--up)' }}>{result.failures.length ? `${result.failures.length} failed` : 'all healthy'}</b>
          </span>
        )}
      </div>
      {result?.note && <p className="muted small" style={{ margin: 0 }}>{result.note}</p>}
      {result?.failures.map((f) => (
        <p key={f.route} className="error small check-fail">{f.route}: {f.status ? `HTTP ${f.status}` : 'no response'}</p>
      ))}
      {(toggle.error || smoke.error) && <p className="error small">{toggle.error ?? smoke.error}</p>}
    </div>
  );
}
