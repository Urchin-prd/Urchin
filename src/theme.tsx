import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMediaQuery } from './hooks';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'urchin.theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

/** Dark is the default. "light" forces light; "system" lets the stylesheet follow the OS. */
function apply(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === 'dark') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', pref);
}

interface Theme { pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void }
const Ctx = createContext<Theme>({ pref: 'dark', resolved: 'dark', setPref: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(read);
  const systemLight = useMediaQuery('(prefers-color-scheme: light)');

  useEffect(() => { apply(pref); }, [pref]);

  const value = useMemo<Theme>(() => ({
    pref,
    resolved: pref === 'system' ? (systemLight ? 'light' : 'dark') : pref,
    setPref: (p) => {
      setPrefState(p);
      try { if (p === 'dark') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* storage unavailable */ }
    },
  }), [pref, systemLight]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
