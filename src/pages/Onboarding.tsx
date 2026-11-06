import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Select from '../components/Select';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { API_URL, api, type AgentSettings, type GithubStatus, type Org, type Project, type ProviderId } from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { CardSkeleton, Skeleton } from '../components/Skeleton';
import ConnectPanel from '../components/Connect';
import GithubPermissions from '../components/GithubPermissions';
import { GITHUB_MESSAGES, ORG_KEY, RETURN_KEY, TRACKS, type TrackId } from '../constants';

/**
 * Guided setup, rendered inside the dashboard (header + sidebar stay put).
 * Urchin asks one question at a time; answered or skipped questions collapse into a quiet transcript.
 * No steps, numbers or progress bar: the current question is the first one that isn't answered or skipped.
 *
 * Anything skipped (or optional) shows up as a track in the sidebar, which opens this page focused on that
 * single question via ?track=<id>.
 */
// Only the essentials are asked in the main flow. AI provider and Telegram are optional extras (see <Extras />).
type StepId = 'code' | 'service';
const ORDER: StepId[] = ['code', 'service'];

const QUESTION: Record<StepId, string> = {
  code: 'Where does your code live?',
  service: 'Which service should I keep an eye on?',
};

const BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
const PROVIDER_LABEL = { anthropic: 'Claude', gemini: 'Gemini', groq: 'Groq' } as const;

const skipKey = (orgId: string) => `urchin.onboard.skipped.${orgId}`;
function loadSkipped(orgId: string): StepId[] {
  try {
    const v = JSON.parse(localStorage.getItem(skipKey(orgId)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveSkipped(orgId: string, v: StepId[]) {
  try {
    localStorage.setItem(skipKey(orgId), JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
/** Used by the org page: if the user skipped adding a service, don't force the guided flow on them again. */
export const hasSkippedService = (orgId: string) => loadSkipped(orgId).includes('service');

export default function Onboarding() {
  const { orgId = '' } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const gh = useLoad(() => api<GithubStatus>(`/orgs/${orgId}/github`), [orgId]);
  const projects = useLoad(() => api<{ projects: Project[] }>(`/orgs/${orgId}/projects`), [orgId]);
  const [pollSettings, setPollSettings] = useState(false);
  const settings = useLoad(
    () => api<{ agent_settings: AgentSettings }>(`/orgs/${orgId}/agent-settings`),
    [orgId],
    pollSettings ? 3000 : undefined,
  );
  const [skipped, setSkipped] = useState<StepId[]>(() => loadSkipped(orgId));
  const [ready, setReady] = useState(false);

  const org = orgs.data?.organizations.find((o) => o.id === orgId);
  const isOwner = org?.role === 'owner';
  const s = settings.data?.agent_settings;
  const project = projects.data?.projects[0];
  const track = TRACKS.find((t) => t.id === params.get('track'));

  const done: Record<TrackId, boolean> = {
    code: !!gh.data?.connected,
    service: !!projects.data?.projects.length,
    brain: !!s?.has_api_key,
    alerts: !!s?.telegram_chat_id,
  };
  const current = track ? null : (ORDER.find((id) => !done[id] && !skipped.includes(id)) ?? null);
  const past = ORDER.slice(0, current ? ORDER.indexOf(current) : ORDER.length);

  // A beat of "thinking" before each new question, so it feels like a conversation.
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, [current, track?.id]);

  useEffect(() => {
    if (s?.telegram_chat_id) setPollSettings(false);
  }, [s?.telegram_chat_id]);

  function skip(id: StepId) {
    const next = [...skipped, id];
    setSkipped(next);
    saveSkipped(orgId, next);
  }

  const loading = orgs.loading || gh.loading || projects.loading || settings.loading;
  if (loading) return <Shell><Skeleton w="70%" h={32} r={8} style={{ marginBottom: 20 }} /><CardSkeleton rows={2} /></Shell>;
  if (!org) return <Shell><p className="error">{orgs.error ?? 'Organization not found.'}</p></Shell>;

  const answer = (id: TrackId): string => {
    if (!done[id]) return 'Later';
    if (id === 'code') return gh.data?.github?.account_login ? `Connected to ${gh.data.github.account_login}` : 'Connected';
    if (id === 'service') return `Watching ${project?.name ?? 'your service'}`;
    if (id === 'brain') return `${s?.ai_provider ? PROVIDER_LABEL[s.ai_provider] : 'AI'}, key saved`;
    return 'Telegram linked';
  };

  const backToDashboard = () => nav(`/orgs/${orgId}`);

  // ---- Focused mode: one question, opened from a sidebar track ----
  if (track) {
    return (
      <Shell>
        <section className="ob-current" key={track.id}>
          <h1 className="ob-prompt">{track.question}</h1>
          {done[track.id] ? (
            <div className="stack">
              <p className="ob-a"><span className="ob-check">✓</span>{answer(track.id)}</p>
              <Link to={`/orgs/${orgId}`} className="btn">Back to dashboard</Link>
            </div>
          ) : !ready ? (
            <span className="think" aria-label="Urchin is typing"><i /><i /><i /></span>
          ) : (
            <div className="ob-card rise">
              {track.id === 'code' && <CodeStep orgId={orgId} isOwner={isOwner} urlStatus={params.get('github')} onSkip={backToDashboard} />}
              {track.id === 'service' && <ServiceStep orgId={orgId} githubConnected={done.code} onDone={projects.reload} onSkip={backToDashboard} />}
              {track.id === 'brain' && <BrainStep orgId={orgId} isOwner={isOwner} onDone={settings.reload} onSkip={backToDashboard} />}
              {track.id === 'alerts' && <AlertsStep orgId={orgId} isOwner={isOwner} onCode={() => setPollSettings(true)} onSkip={backToDashboard} />}
            </div>
          )}
        </section>
      </Shell>
    );
  }

  // ---- Guided conversation ----
  return (
    <Shell>
      {past.map((id) => (
        <div className="ob-exchange" key={id}>
          <p className="ob-q">{QUESTION[id]}</p>
          <p className={`ob-a ${done[id] ? '' : 'later'}`}>{done[id] && <span className="ob-check">✓</span>}{answer(id)}</p>
        </div>
      ))}

      {current && (
        <section className="ob-current" key={current}>
          <h1 className="ob-prompt">
            {current === 'code' && past.length === 0 && <span className="ob-hello">Hi, I’m Urchin. I’ll watch your backend and explain what breaks.<br /></span>}
            {QUESTION[current]}
          </h1>
          {!ready ? (
            <span className="think" aria-label="Urchin is typing"><i /><i /><i /></span>
          ) : (
            <div className="ob-card rise">
              {current === 'code' && <CodeStep orgId={orgId} isOwner={isOwner} urlStatus={params.get('github')} onSkip={() => skip('code')} />}
              {current === 'service' && <ServiceStep orgId={orgId} githubConnected={done.code} onDone={projects.reload} onSkip={() => skip('service')} />}
            </div>
          )}
        </section>
      )}

      {!current && (
        <>
          <Finale orgId={orgId} project={project} />
          <Extras orgId={orgId} isOwner={isOwner} settings={s} onChanged={settings.reload} onLinkStart={() => setPollSettings(true)} />
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="ob-thread">{children}</div>;
}

function SkipLink({ onSkip, label = 'Not now' }: { onSkip: () => void; label?: string }) {
  return <button type="button" className="ob-skip" onClick={onSkip}>{label}</button>;
}

// ---------------- Questions ----------------

function CodeStep({ orgId, isOwner, urlStatus, onSkip }: { orgId: string; isOwner: boolean; urlStatus: string | null; onSkip: () => void }) {
  const act = useAction();
  const msg = urlStatus && urlStatus !== 'connected' ? GITHUB_MESSAGES[urlStatus] : undefined;

  async function connect() {
    const res = await act.run(() => api<{ url: string }>(`/orgs/${orgId}/github/install-url`, { method: 'POST' }));
    if (!res) return;
    try {
      sessionStorage.setItem(ORG_KEY, orgId);
      // Come back to exactly where the user was (guided flow or a focused track), minus any old ?github= status.
      const here = new URL(window.location.href);
      here.searchParams.delete('github');
      sessionStorage.setItem(RETURN_KEY, here.pathname + here.search);
    } catch {
      /* storage unavailable */
    }
    window.location.href = res.url;
  }

  return (
    <div className="stack">
      <p className="muted">
        Install the Urchin GitHub App and pick the repositories I can read. I only read code to understand what changed
        when something breaks.
      </p>
      <GithubPermissions />
      {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
      <div className="row">
        {isOwner ? <button className="btn primary" onClick={connect} disabled={act.busy}>{act.busy ? 'Opening GitHub…' : 'Connect GitHub'}</button>
          : <span className="muted small">Only an owner can connect GitHub.</span>}
        <SkipLink onSkip={onSkip} />
      </div>
      {act.error && <p className="error">{act.error}</p>}
    </div>
  );
}

function ServiceStep({ orgId, githubConnected, onDone, onSkip }: { orgId: string; githubConnected: boolean; onDone: () => void; onSkip: () => void }) {
  const repos = useLoad(
    async () => (githubConnected ? api<{ repos: { full_name: string }[] }>(`/orgs/${orgId}/github/repos`) : { repos: [] }),
    [orgId, githubConnected],
  );
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [interval, setIntervalMin] = useState(1);
  const [downAfter, setDownAfter] = useState(3);
  const [liveUrl, setLiveUrl] = useState('');
  const [healthPath, setHealthPath] = useState('/');
  const [tune, setTune] = useState(false);
  const act = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await act.run(() =>
      api(`/orgs/${orgId}/projects`, {
        body: {
          name, github_repo: repo || undefined, check_interval_minutes: interval, down_after_minutes: downAfter,
          live_url: liveUrl.trim() || undefined, health_path: liveUrl.trim() ? healthPath.trim() || '/' : undefined,
        },
      }),
    );
    if (res) onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">Give it a name I’ll recognise in alerts. You’ll get a key to send me heartbeats and errors.</p>
      <div className="grid">
        <label>Service name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="payments-api" required maxLength={100} autoFocus /></label>
        <label>Repository
          {repos.data && repos.data.repos.length > 0 ? (
            <Select value={repo} onChange={setRepo} ariaLabel="Repository"
              options={[{ value: '', label: 'No repository' }, ...repos.data.repos.map((r) => ({ value: r.full_name, label: r.full_name }))]} />
          ) : (
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name (optional)" />
          )}
        </label>
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
      {tune && (
        <div className="grid">
          <label>Check every (minutes)<input type="number" min={1} max={60} value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} /></label>
          <label>Call it down after (minutes)<input type="number" min={1} max={1440} value={downAfter} onChange={(e) => setDownAfter(Number(e.target.value))} /></label>
        </div>
      )}
      <div className="row">
        <button className="btn primary" disabled={act.busy || !name.trim()}>Watch this service</button>
        <button type="button" className="ob-skip" onClick={() => setTune((t) => !t)}>{tune ? 'Hide timing' : 'Tune timing'}</button>
        <SkipLink onSkip={onSkip} />
      </div>
      {act.error && <p className="error">{act.error}</p>}
    </form>
  );
}

function BrainStep({ orgId, isOwner, onDone, onSkip }: { orgId: string; isOwner: boolean; onDone: () => void; onSkip: () => void }) {
  // onSkip closes the card (optional extra).
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const act = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await act.run(() => api(`/orgs/${orgId}/agent-settings`, { method: 'PUT', body: { ai_provider: provider, api_key: apiKey } }));
    if (res) { setApiKey(''); onDone(); }
  }

  if (!isOwner) {
    return <div className="row"><span className="muted small">Only an owner can set the AI key.</span><SkipLink onSkip={onSkip} label="Close" /></div>;
  }
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">I use your own API key, so your data stays on your account. It’s encrypted and never shown again.</p>
      <div className="seg" role="radiogroup" aria-label="AI provider">
        {(['anthropic', 'gemini', 'groq'] as const).map((p) => (
          <button type="button" key={p} role="radio" aria-checked={provider === p} className={provider === p ? 'on' : ''} onClick={() => setProvider(p)}>
            {PROVIDER_LABEL[p]}
          </button>
        ))}
      </div>
      <label>API key<input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your key" /></label>
      <div className="row">
        <button className="btn primary" disabled={act.busy || apiKey.trim().length < 8}>Save key</button>
        <SkipLink onSkip={onSkip} label="Cancel" />
      </div>
      {act.error && <p className="error">{act.error}</p>}
    </form>
  );
}

function AlertsStep({ orgId, isOwner, onCode, onSkip }: { orgId: string; isOwner: boolean; onCode: () => void; onSkip: () => void }) {
  const [code, setCode] = useState<{ code: string; command: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const act = useAction();

  async function make() {
    const res = await act.run(() => api<{ code: string; command: string }>(`/orgs/${orgId}/telegram/link-code`, { method: 'POST' }));
    if (res) { setCode(res); onCode(); }
  }

  if (!isOwner) {
    return <div className="row"><span className="muted small">Only an owner can link Telegram.</span><SkipLink onSkip={onSkip} label="Close" /></div>;
  }
  return (
    <div className="stack">
      {!code ? (
        <>
          <p className="muted">I’ll message you on Telegram with a plain-English diagnosis, and ask before I change anything.</p>
          <div className="row">
            <button className="btn primary" onClick={make} disabled={act.busy}>Get my link code</button>
            <SkipLink onSkip={onSkip} label="Cancel" />
          </div>
        </>
      ) : (
        <>
          <p className="muted">Send this to the Urchin bot on Telegram. I’ll notice as soon as it arrives.</p>
          <pre>{code.command}</pre>
          <div className="row">
            {BOT && <a className="btn primary" href={`https://t.me/${BOT}?start=${code.code}`} target="_blank" rel="noreferrer">Open in Telegram</a>}
            <button className="btn" onClick={() => navigator.clipboard.writeText(code.command).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy'}</button>
            <SkipLink onSkip={onSkip} label="Close" />
          </div>
          <p className="ob-wait"><span className="pulse" /> Waiting for your message…</p>
        </>
      )}
      {act.error && <p className="error">{act.error}</p>}
    </div>
  );
}

// ---------------- Finale ----------------

function Finale({ orgId, project }: { orgId: string; project?: Project }) {
  return (
    <section className="ob-current">
      <h1 className="ob-prompt">I’m on call.{project && <><br />Now connect {project.name}.</>}</h1>
      <div className="ob-card rise stack">
        {project ? (
          <ConnectPanel project={project} />
        ) : (
          <p className="muted">Add a service whenever you’re ready and I’ll start watching it.</p>
        )}
        <div className="row">
          <Link to={project ? `/projects/${project.id}` : `/orgs/${orgId}`} className="btn primary" style={{ textDecoration: "none" }}>Open dashboard</Link>
        </div>
      </div>
    </section>
  );
}

// ---------------- Optional extras ----------------

/** AI diagnosis and Telegram alerts are optional: offered after the essentials, never required. */
function Extras({
  orgId, isOwner, settings, onChanged, onLinkStart,
}: { orgId: string; isOwner: boolean; settings?: AgentSettings; onChanged: () => void; onLinkStart: () => void }) {
  const [open, setOpen] = useState<'brain' | 'alerts' | null>(null);
  const brainDone = !!settings?.has_api_key;
  const alertsDone = !!settings?.telegram_chat_id;

  // Close a card once its setup completes.
  useEffect(() => { if (brainDone && open === 'brain') setOpen(null); }, [brainDone, open]);
  useEffect(() => { if (alertsDone && open === 'alerts') setOpen(null); }, [alertsDone, open]);

  return (
    <section className="ob-extras">
      <p className="ob-optional">Optional — add these whenever you like</p>

      <div className="ob-extra">
        <div className="row spread">
          <div>
            <h3>Plain-English diagnoses</h3>
            <p className="muted small">Add your own AI key and I’ll explain what broke and why.</p>
          </div>
          {brainDone
            ? <span className="ob-done"><span className="ob-check">✓</span>{settings?.ai_provider ? PROVIDER_LABEL[settings.ai_provider] : 'AI'} ready</span>
            : <button className="btn" onClick={() => setOpen(open === 'brain' ? null : 'brain')}>{open === 'brain' ? 'Close' : 'Set up'}</button>}
        </div>
        {open === 'brain' && !brainDone && <div className="ob-extra-body"><BrainStep orgId={orgId} isOwner={isOwner} onDone={onChanged} onSkip={() => setOpen(null)} /></div>}
      </div>

      <div className="ob-extra">
        <div className="row spread">
          <div>
            <h3>Alerts on Telegram</h3>
            <p className="muted small">Get incidents in a chat, and approve or reject proposed fixes.</p>
          </div>
          {alertsDone
            ? <span className="ob-done"><span className="ob-check">✓</span>Telegram linked</span>
            : <button className="btn" onClick={() => setOpen(open === 'alerts' ? null : 'alerts')}>{open === 'alerts' ? 'Close' : 'Set up'}</button>}
        </div>
        {open === 'alerts' && !alertsDone && <div className="ob-extra-body"><AlertsStep orgId={orgId} isOwner={isOwner} onCode={onLinkStart} onSkip={() => setOpen(null)} /></div>}
      </div>
    </section>
  );
}
