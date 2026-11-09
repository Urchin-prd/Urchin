import { useCallback, useEffect, useRef, useState } from 'react';

// The last answer for each request, kept for the life of the tab. A page or sidebar section that is opened again
// shows it straight away and refreshes it quietly, so revisiting something never starts from a blank "loading".
const cache = new Map<string, unknown>();
export const clearLoadCache = () => cache.clear();

function autoKey(fn: () => unknown, deps: unknown[]): string | undefined {
  try { return `${fn.toString()}|${JSON.stringify(deps)}`; } catch { return undefined; }
}

/**
 * Load async data; `reload()` refetches without flashing the loading state.
 * The result is cached (by the request's code and `deps`, or by `cacheKey`; pass `false` to opt out) and shown
 * instantly on the next visit while it refreshes in the background. A fetch that resolves `undefined` means
 * "nothing to fetch right now" and leaves what is shown untouched.
 */
export function useLoad<T>(fn: () => Promise<T | undefined>, deps: unknown[], pollMs?: number, cacheKey?: string | false) {
  const key = cacheKey === false ? undefined : (cacheKey ?? autoKey(fn, deps));
  const hit = key !== undefined && cache.has(key);
  const [data, setData] = useState<T | null>(() => (hit ? (cache.get(key!) as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hit);
  const [tick, setTick] = useState(0);
  const lastKey = useRef(key);

  useEffect(() => {
    // Moving to a different request: show its cached answer at once, or nothing at all (never the previous one's).
    if (lastKey.current !== key) {
      lastKey.current = key;
      const cached = key !== undefined && cache.has(key);
      setData(cached ? (cache.get(key!) as T) : null);
      setLoading(!cached);
    }
    let alive = true;
    fn()
      .then((d) => {
        if (!alive || d === undefined) return;
        setData(d);
        setError(null);
        if (key !== undefined) cache.set(key, d);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: loading && data === null, reload };
}

/** Run an async action with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

/** Reactive CSS media query (e.g. useMediaQuery('(max-width: 860px)')). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const fmt =(ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : '—');
