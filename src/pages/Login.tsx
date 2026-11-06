import { useState } from 'react';
import { useAuth } from '../auth';
import { LogoMark } from '../components/Logo';

function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Turn Firebase error codes into something a person can act on. */
function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Try again when you’re ready.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists using a different sign-in method.';
    case 'auth/unauthorized-domain':
      return 'This domain isn’t authorized for sign-in yet. Add it under Firebase → Authentication → Settings.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return (err as Error)?.message || 'Something went wrong signing in.';
  }
}

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <main className="auth-card">
        <span className="auth-mark"><LogoMark size={44} /></span>
        <h1>Log in to Urchin</h1>
        <p className="muted">AI incident response for your backend.</p>

        <button className="auth-github" onClick={onSignIn} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <GithubMark />}
          <span>{busy ? 'Waiting for GitHub…' : 'Continue with GitHub'}</span>
        </button>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <p className="auth-fine">
          GitHub is used only to identify you. Access to your repositories is granted separately, per repository,
          when you connect the Urchin GitHub App.
        </p>
      </main>
    </div>
  );
}
