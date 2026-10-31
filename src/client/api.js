// Client transport: the browser's only door to the STACKD server. Every call is a POST to /api/rpc/<method>
// with a JSON body. The session lives in an HttpOnly cookie the browser sends automatically; the client
// never sees or stores the token. Live updates arrive over Server-Sent Events (/api/events).

export class RpcError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Kept for compatibility with existing callers: sessions are cookie-based now, so there is nothing to store.
export function getToken() {
  return null;
}
export function setToken() {}

/** rpc(method, params, { idempotencyKey }) */
export async function rpc(method, params = {}, opts = {}) {
  let res;
  try {
    res = await fetch(`/api/rpc/${method}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Stackd-Client': 'web', 'Idempotency-Key': opts.idempotencyKey || crypto.randomUUID() },
      body: JSON.stringify(params ?? {}),
    });
  } catch {
    throw new RpcError('NETWORK', "Can't reach STACKD. Check your connection and try again.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (body?.ok) return body.data;
  const e = body?.error;
  if (!e) console.error(`[rpc] ${method} failed with HTTP ${res.status}`);
  throw new RpcError(e?.code || 'INTERNAL', e?.message || 'Something broke on our side. Try again in a moment.', e?.details);
}

export const newKey = () => crypto.randomUUID();

// ---- live updates ---------------------------------------------------------------------------------
const listeners = new Set();
let source = null;
function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  source.onmessage = (ev) => {
    let v = 0;
    try {
      v = JSON.parse(ev.data).v;
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(v));
  };
  // EventSource reconnects on its own (server sends `retry`); on reconnect, refresh once to catch up.
  source.onopen = () => listeners.forEach((fn) => fn(0));
}

export function subscribe(fn) {
  listeners.add(fn);
  connect();
  return () => listeners.delete(fn);
}
