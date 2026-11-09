import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GithubAuthProvider, getAdditionalUserInfo, onAuthStateChanged, signInWithPopup, signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { clearLoadCache } from './hooks';
import { auth } from './firebase';
import { api } from './api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  async function signIn() {
    const result = await signInWithPopup(auth, new GithubAuthProvider());
    // The ID token doesn't carry the GitHub handle; send it once so the backend can store it.
    const username = getAdditionalUserInfo(result)?.username;
    if (username) await api('/me', { method: 'PUT', body: { github_username: username } }).catch(() => {});
  }

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut: () => { clearLoadCache(); return fbSignOut(auth); } }}>{children}</Ctx.Provider>
  );
}
