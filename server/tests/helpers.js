// Test helpers: a cookie-aware API client and a minimal OpenID Connect provider standing in for Google.
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createHash, randomUUID } from 'node:crypto';

export function client(base) {
  let cookie = '';
  const api = async (method, params = {}, { key, expect } = {}) => {
    const res = await fetch(`${base}/api/rpc/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Stackd-Client': 'web', 'Idempotency-Key': key || randomUUID(), ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(params),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const body = await res.json();
    if (expect) {
      if (body.ok) throw new Error(`${method} should have failed with ${expect}`);
      if (body.error.code !== expect) throw new Error(`${method} failed with ${body.error.code} (${body.error.message}), expected ${expect}`);
      return body.error;
    }
    if (!body.ok) throw new Error(`${method} failed: ${body.error.code} ${body.error.message}`);
    return body.data;
  };
  api.get = async (path) => {
    const res = await fetch(`${base}${path}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  api.cookie = () => cookie;
  api.clear = () => (cookie = '');
  return api;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, { timeout = 20000, every = 150, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(every);
  }
}

/** A tiny OIDC provider: discovery, JWKS, authorize (auto-consent) and token endpoints. */
export async function mockOidc({ port, clientId, clientSecret, account }) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const issuer = `http://127.0.0.1:${port}`;
  const codes = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, issuer);
    const json = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (url.pathname === '/.well-known/openid-configuration')
      return json(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], code_challenge_methods_supported: ['S256'] });
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });
    if (url.pathname === '/authorize') {
      const q = url.searchParams;
      if (q.get('client_id') !== clientId) return json(400, { error: 'invalid_client' });
      const code = randomUUID();
      codes.set(code, { nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirect: q.get('redirect_uri') });
      res.writeHead(302, { Location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state'))}` });
      return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      for await (const c of req) raw += c;
      const form = new URLSearchParams(raw);
      const basic = req.headers.authorization?.startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':').map(decodeURIComponent) : null;
      const [id, secret] = basic || [form.get('client_id'), form.get('client_secret')];
      if (id !== clientId || secret !== clientSecret) return json(401, { error: 'invalid_client' });
      const entry = codes.get(form.get('code'));
      codes.delete(form.get('code'));
      if (!entry) return json(400, { error: 'invalid_grant' });
      const challenge = createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
      if (challenge !== entry.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE mismatch' });
      const idToken = await new SignJWT({ nonce: entry.nonce, email: account.email, email_verified: true, name: account.name, picture: null })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience(clientId).setSubject(account.sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return json(200, { access_token: randomUUID(), token_type: 'Bearer', expires_in: 300, id_token: idToken });
    }
    json(404, { error: 'not_found' });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { issuer, close: () => new Promise((r) => server.close(r)) };
}
