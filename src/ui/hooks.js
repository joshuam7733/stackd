import { useState, useEffect, useRef, useCallback, useContext, createContext } from '../lib/preact.js';
import { rpc, newKey, subscribe, setToken } from '../client/api.js';

// ---- live data bus: server commits → throttled "version" ticks -------------------------------
let version = 0;
const vListeners = new Set();
let pending = false;
subscribe(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    version++;
    vListeners.forEach((f) => f(version));
  }, 700);
});

export function useVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    vListeners.add(setV);
    return () => vListeners.delete(setV);
  }, []);
  return v;
}

// ---- toasts ---------------------------------------------------------------------------------
let toasts = [];
const tListeners = new Set();
function pushToast(kind, title, body) {
  const t = { id: Math.random().toString(36).slice(2), kind, title, body };
  toasts = [...toasts.slice(-2), t];
  tListeners.forEach((f) => f(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    tListeners.forEach((f) => f(toasts));
  }, kind === 'err' ? 6000 : 3800);
}
export const toast = {
  ok: (title, body) => pushToast('ok', title, body),
  err: (title, body) => pushToast('err', title, body),
  info: (title, body) => pushToast('info', title, body),
};
export function useToasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    tListeners.add(setList);
    return () => tListeners.delete(setList);
  }, []);
  return list;
}

// ---- data fetching --------------------------------------------------------------------------

/** useRpc(method, params) → { data, error, loading, reload }. Refetches silently when server data changes. */
export function useRpc(method, params = {}, { live = true, skip = false } = {}) {
  const key = JSON.stringify([method, params]);
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const reqId = useRef(0);
  const v = useVersion();
  const first = useRef(true);

  const load = useCallback((silent) => {
    if (skip) return;
    const id = ++reqId.current;
    if (!silent) setState((s) => ({ data: s.key === key ? s.data : null, error: null, loading: true, key }));
    rpc(method, params, { fast: silent })
      .then((data) => id === reqId.current && setState({ data, error: null, loading: false, key }))
      .catch((error) => {
        if (id !== reqId.current) return;
        if (silent) return; // keep showing the last good data
        setState({ data: null, error, loading: false, key });
      });
  }, [key, skip]);

  useEffect(() => {
    first.current = true;
    load(false);
  }, [key, skip]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (live && !skip) load(true);
  }, [v]);

  return { ...state, reload: () => load(false), refresh: () => load(true) };
}

/** useAction(method) → { run, pending, error }. One idempotency key per attempt; double taps are ignored. */
export function useAction(method, { success, onSuccess, quiet = false } = {}) {
  const keyRef = useRef(newKey());
  const busy = useRef(false);
  const [pendingState, setPending] = useState(false);
  const [error, setError] = useState(null);
  const run = async (params) => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const out = await rpc(method, params, { idempotencyKey: keyRef.current });
      keyRef.current = newKey();
      if (success) toast.ok(typeof success === 'function' ? success(out) : success);
      onSuccess?.(out);
      return out;
    } catch (e) {
      setError(e);
      if (!quiet) toast.err(e.code === 'VALIDATION' ? 'Check that and try again' : e.code === 'COMPLIANCE_BLOCKED' ? 'Not available on your account' : "That didn't go through", e.message);
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { run, pending: pendingState, error, reset: () => setError(null) };
}

// ---- session --------------------------------------------------------------------------------
export const SessionCtx = createContext({ user: null, ready: false });
export const useSession = () => useContext(SessionCtx);

export function useSessionState() {
  const [state, setState] = useState({ user: null, ready: false });
  const v = useVersion();
  const load = useCallback(() => rpc('auth.me', {}, { fast: true }).then((user) => setState({ user, ready: true })).catch(() => setState({ user: null, ready: true })), []);
  useEffect(() => {
    load();
  }, [v]);
  return {
    ...state,
    refresh: load,
    signIn(token, user) {
      setToken(token);
      setState({ user, ready: true });
    },
    async signOut() {
      try {
        await rpc('auth.logout');
      } catch {
        /* already gone */
      }
      setToken(null);
      setState({ user: null, ready: true });
    },
  };
}

// ---- misc -----------------------------------------------------------------------------------
export function useMedia(query) {
  const [m, setM] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return m;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMeta() {
  return useRpc('meta.get', {}, { live: false });
}
