// Server configuration from environment variables (see .env.example). A local `.env` file is loaded if present.
import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative paths (.env, the SQLite file) resolve against the project root, wherever the server is started from.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(ROOT, '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

function rootRelative(url) {
  const m = /^sqlite:(\/\/)?(.+)$/.exec(url);
  if (!m || m[2] === ':memory:' || isAbsolute(m[2])) return url;
  return `sqlite:${resolve(ROOT, m[2])}`;
}

const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const port = Number(process.env.PORT || 5173);

export const config = {
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port,
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  databaseUrl: rootRelative(process.env.DATABASE_URL || 'sqlite:./data/stackd.db'),
  cookieSecure: bool(process.env.COOKIE_SECURE, (process.env.PUBLIC_URL || '').startsWith('https://')),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  demoMode: bool(process.env.DEMO_MODE, true),
  demoLogins: bool(process.env.DEMO_LOGINS, true),
  worldClock: bool(process.env.WORLD_CLOCK, true),
  worldTickMs: Number(process.env.WORLD_TICK_MS || 2500),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Override only for automated tests against a local OpenID provider.
    issuer: process.env.GOOGLE_ISSUER || 'https://accounts.google.com',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },
};

config.google.enabled = !!(config.google.clientId && config.google.clientSecret);
config.google.redirectUri ||= `${config.publicUrl}/auth/google/callback`;
process.env.DEMO_LOGINS = config.demoLogins ? 'true' : 'false';
