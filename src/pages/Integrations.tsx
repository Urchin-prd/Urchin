import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api, type AgentSettings, type Org, type ProviderId } from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { useConfirm } from '../components/Confirm';
import Modal from '../components/Modal';
import { RailwayCard } from '../components/Railway';
import { TelegramLogo } from '../components/Logos';
import { PageSkeleton, Skeleton } from '../components/Skeleton';

const BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
const PROVIDERS = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'groq', label: 'Groq' },
  { id: 'serv', label: 'SERV Reasoning' },
] as const;

function useOrgSettings(pollMs?: number) {
  const { orgId = '' } = useParams();
  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const settings = useLoad(() => api<{ agent_settings: AgentSettings }>(`/orgs/${orgId}/agent-settings`), [orgId], pollMs);
  const isOwner = orgs.data?.organizations.find((o) => o.id === orgId)?.role === 'owner';
  return { orgId, isOwner, settings, s: settings.data?.agent_settings, loading: orgs.loading || settings.loading, error: orgs.error ?? settings.error };
}

// ---------------- AI provider ----------------

const KEY_NAME = { anthropic: 'ANTHROPIC_API_KEY', groq: 'GROQ_API_KEY', serv: 'OPENSERV_API_KEY' } as const;
const KEY_LINK = {
  anthropic: { label: 'Get a Claude key', href: 'https://console.anthropic.com/settings/keys' },
  groq: { label: 'Get a free Groq key', href: 'https://console.groq.com/keys' },
  serv: { label: 'Get an OpenServ key', href: 'https://console.openserv.ai' },
} as const;
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', groq: 'chosen automatically', serv: 'gpt-5.4-mini' } as const;
/** Shown as an example when a typed model name looks wrong. */
const MODEL_EXAMPLE = { anthropic: 'claude-sonnet-5-5', groq: 'llama-3.3-70b-versatile', serv: 'gpt-5.4-mini' } as const;
const MODEL_PATTERN = { anthropic: /^claude-[\w.-]+$/i, groq: /^[\w./:-]+$/, serv: /^[\w./:-]+$/ } as const;

export function AiProviderPage() {
  const { orgId, isOwner, settings, s, loading, error } = useOrgSettings();
  const [modal, setModal] = useState(false);
  const confirm = useConfirm();
  const rm = useAction();

  if (loading) return <PageSkeleton />;
  if (error) return <p className="error">{error}</p>;

  const configured = !!s?.has_api_key && !!s.ai_provider;

  async function remove() {
    const ok = await confirm({
      title: 'Remove this key?',
      description: 'Urchin will stop writing plain-English diagnoses until you add a provider key again. Incidents are still detected.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await rm.run(() => api(`/orgs/${orgId}/agent-settings/ai`, { method: 'DELETE' }));
    settings.reload();
  }

  return (
    <>
      <div className="row spread">
        <h1>AI provider</h1>
        {configured ? <span className="badge up">Connected</span> : <span className="badge unknown">Not set up</span>}
      </div>
      <p className="muted">Urchin uses your own API key to diagnose incidents in plain English.</p>

      <div className="card vars">
        <div className="row spread" style={{ marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0 }}>Provider keys</h2>
            <p className="muted small" style={{ margin: '2px 0 0' }}>Stored encrypted. The value is never shown again after you save it.</p>
          </div>
          {isOwner && <button className="btn primary" onClick={() => setModal(true)}>{configured ? 'Add' : 'Add key'}</button>}
        </div>

        {configured ? (
          <div className="var-table" role="table" aria-label="Provider keys">
            <div className="var-row var-headrow" role="row">
              <span>Name</span><span>Value</span><span>Model</span><span>Updated</span><span />
            </div>
            <div className="var-row" role="row">
              <code className="var-name">{KEY_NAME[s!.ai_provider!]}</code>
              {s!.ai_provider === 'serv' && s!.serv_available
                ? <span className="small">Included with Urchin</span>
                : <span className="var-mask" aria-label="Hidden value">••••••••••••••••</span>}
              <span className="small">{s!.ai_model ?? DEFAULT_MODEL[s!.ai_provider!]}</span>
              <span className="muted small">{fmt(s!.updated_at)}</span>
              {isOwner ? (
                <span className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                  <button className="btn small-btn" onClick={() => setModal(true)}>Edit</button>
                  <button className="btn small-btn danger" onClick={remove} disabled={rm.busy}>Remove</button>
                </span>
              ) : <span />}
            </div>
          </div>
        ) : (
          <p className="var-empty muted">No key yet. Pick SERV Reasoning, or add a Claude or Groq key, to turn on diagnoses.</p>
        )}
        {rm.error && <p className="error small">{rm.error}</p>}
        {!isOwner && <p className="muted small">Only owners can change this.</p>}
      </div>

      {modal && (
        <ProviderModal
          orgId={orgId}
          current={s}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); settings.reload(); }}
        />
      )}
    </>
  );
}

export function ProviderModal({ orgId, current, onClose, onSaved }: {
  orgId: string; current?: AgentSettings; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!current?.has_api_key && !!current.ai_provider;
  const [provider, setProvider] = useState<ProviderId>(current?.ai_provider ?? 'serv');
  const [model, setModel] = useState(current?.ai_provider === provider ? (current?.ai_model ?? '') : '');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const save = useAction();

  // Switching providers needs a fresh key (the stored one belongs to the other provider).
  const keepsKey = editing && current?.ai_provider === provider;
  const modelBad = model.trim() !== '' && !MODEL_PATTERN[provider].test(model.trim());
  // SERV Reasoning is provided by Urchin itself when the platform key is set, so no key is asked for.
  const included = provider === 'serv' && !!current?.serv_available;
  const keyMissing = !included && !keepsKey && key.trim().length < 8;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await save.run(() =>
      api(`/orgs/${orgId}/agent-settings`, {
        method: 'PUT',
        body: { ai_provider: provider, ai_model: model.trim() || undefined, api_key: key.trim() || undefined },
      }),
    );
    if (res) onSaved();
  }

  return (
    <Modal
      title={editing ? 'Edit provider key' : 'Add provider key'}
      description="Urchin uses one provider at a time. Saving here replaces the current one."
      onClose={onClose}
    >
      <form className="stack" onSubmit={submit}>
        <div className="seg" role="radiogroup" aria-label="Provider">
          {PROVIDERS.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={provider === p.id} className={provider === p.id ? 'on' : ''}
              onClick={() => { setProvider(p.id); setModel(current?.ai_provider === p.id ? (current?.ai_model ?? '') : ''); }}>
              {p.label}
            </button>
          ))}
        </div>

        {included ? (
          <p className="muted small" style={{ margin: 0 }}>
            <b style={{ color: 'var(--text)' }}>Included with Urchin.</b> SERV Reasoning is ready to use. No key to paste.
          </p>
        ) : (
        <label>API key
          <span className="input-wrap">
            <input
              type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)}
              autoComplete="off" spellCheck={false}
              placeholder={keepsKey ? '•••••••••••••••• (saved. Leave blank to keep it)' : 'Paste your API key'}
            />
            <button type="button" className="input-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide key' : 'Show key'}>{show ? 'Hide' : 'Show'}</button>
          </span>
          <a className="small" href={KEY_LINK[provider].href} target="_blank" rel="noreferrer">{KEY_LINK[provider].label} ↗</a>
        </label>
        )}

        <label>Model (optional)
          <input value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" spellCheck={false} aria-invalid={modelBad}
            placeholder={`Default: ${DEFAULT_MODEL[provider]}`} />
          {modelBad && <span className="error small">Use a model ID such as {MODEL_EXAMPLE[provider]}, or leave this blank for the default.</span>}
        </label>

        {save.error && <p className="error small">{save.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy || modelBad || keyMissing}>{save.busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Integrations ----------------


export function IntegrationsPage() {
  const { orgId, isOwner } = useOrgSettings();
  return (
    <>
      <h1>Integrations</h1>
      <p className="muted">Connect Urchin to the tools it works with.</p>
      <div className="integ-grid">
        <TelegramCard />
        <RailwayCard orgId={orgId} isOwner={!!isOwner} />
      </div>
    </>
  );
}

/** Telegram: where incidents, approvals and results arrive. */
export function TelegramCard() {
  const [code, setCode] = useState<{ code: string; command: string; expires_at: number } | null>(null);
  const { orgId, isOwner, s, loading, error } = useOrgSettings(code ? 3000 : undefined);
  const [copied, setCopied] = useState(false);
  const link = useAction();

  useEffect(() => {
    if (s?.telegram_chat_id) setCode(null);
  }, [s?.telegram_chat_id]);

  async function makeCode() {
    const res = await link.run(() =>
      api<{ code: string; command: string; expires_at: number }>(`/orgs/${orgId}/telegram/link-code`, { method: 'POST' }),
    );
    if (res) setCode(res);
  }

  const linked = !!s?.telegram_chat_id;
  return (
    <div className="card stack integ-narrow">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          <TelegramLogo />
          <h2 style={{ margin: 0 }}>Telegram</h2>
        </div>
        {!loading && (linked ? <span className="badge up">Linked</span> : <span className="badge unknown">Not linked</span>)}
      </div>
      <p className="muted small" style={{ margin: 0 }}>Incident messages, approvals and fixes.</p>
      {linked && <p className="ok" style={{ margin: 0 }}>A chat is linked. Incident messages are sent there.</p>}
      {error && <p className="error small" style={{ margin: 0 }}>{error}</p>}
      {link.error && <p className="error small" style={{ margin: 0 }}>{link.error}</p>}
      {loading && <Skeleton w={110} h={32} r={6} />}
      {!loading && !isOwner && <p className="muted small" style={{ margin: 0 }}>Only owners can link a chat.</p>}
      {!loading && isOwner && !code && (
        <div><button className="btn" onClick={makeCode} disabled={link.busy}>{linked ? 'Link another chat' : 'Link Telegram'}</button></div>
      )}
      {code && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>Send this to the Urchin bot. Expires at {new Date(code.expires_at).toLocaleTimeString()}.</p>
          <pre style={{ margin: 0 }}>{code.command}</pre>
          <div className="row">
            {BOT && <a className="btn primary" href={`https://t.me/${BOT}?start=${code.code}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open in Telegram</a>}
            <button className="btn" onClick={() => navigator.clipboard.writeText(code.command).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn" onClick={() => setCode(null)}>Cancel</button>
          </div>
          <p className="ob-wait" style={{ margin: 0 }}><span className="pulse" /> Waiting for your message…</p>
        </div>
      )}
    </div>
  );
}
