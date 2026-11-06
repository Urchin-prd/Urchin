import type { GithubStatus } from '../api';

const REQUIRED = [
  { key: 'contents', label: 'Contents', access: 'Read & write', why: 'Read your code and commits, and commit the fix to a new branch.' },
  { key: 'pull_requests', label: 'Pull requests', access: 'Read & write', why: 'Open the fix as a pull request, merge it, and revert it if it fails.' },
  { key: 'deployments', label: 'Deployments', access: 'Read-only', why: 'See when a fix is live. Railway and similar hosts report this to GitHub.' },
  { key: 'metadata', label: 'Metadata', access: 'Read-only', why: 'List your repositories. GitHub always grants this.' },
] as const;

/**
 * The GitHub App permissions Urchin relies on, and why. When GitHub is connected, shows what the installation
 * was actually granted, and where the owner can approve anything that is missing.
 */
export default function GithubPermissions({ status }: { status?: GithubStatus | null }) {
  const missing = status?.connected && Array.isArray(status.missing) ? status.missing : null; // null = not checked
  const missingKeys = new Set((missing ?? []).map((m) => m.key));
  const checked = missing !== null;

  return (
    <details className="perms" open={!!missing?.length}>
      <summary>
        What Urchin asks GitHub for
        {missing?.length ? <span className="badge down" style={{ marginLeft: 8 }}>{missing.length} missing</span> : null}
        {checked && !missing?.length ? <span className="badge up" style={{ marginLeft: 8 }}>all granted</span> : null}
      </summary>

      {!!missing?.length && (
        <div className="perms-warn" role="alert">
          <b>GitHub hasn’t granted everything Urchin needs.</b> Fixes can’t work fully until it does.
          {missing.map((m) => (
            <div key={m.key} className="small">{m.label}: needs <b>{m.need === 'write' ? 'Read & write' : 'Read-only'}</b>, currently <b>{m.have === 'none' ? 'no access' : m.have}</b>.</div>
          ))}
          <div className="small" style={{ marginTop: 6 }}>
            The owner of the GitHub account must approve the update.{' '}
            {status?.manage_url
              ? <a href={status.manage_url} target="_blank" rel="noreferrer">Review the installation on GitHub ↗</a>
              : 'Open GitHub → Settings → Applications → Installed GitHub Apps → Urchin → Review request.'}
          </div>
        </div>
      )}

      <ul className="perms-list">
        {REQUIRED.map((p) => (
          <li key={p.key}>
            <span className="perms-mark" aria-hidden="true">{checked ? (missingKeys.has(p.key) ? '✗' : '✓') : '•'}</span>
            <div>
              <b>{p.label}</b> <span className="muted small">· {p.access}</span>
              <div className="muted small">{p.why}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        Urchin never changes <code>.env</code> files, config, <code>package.json</code>, lockfiles or CI files, and nothing else is needed.
        Extra permissions such as Issues, Packages or Commit statuses can stay off.
      </p>
    </details>
  );
}
