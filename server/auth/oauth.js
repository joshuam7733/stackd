// OAuth / OpenID Connect sign-in flow (Google today). Two HTTP endpoints:
//   GET /auth/:provider/start     → stores state + PKCE verifier + nonce, redirects to the provider
//   GET /auth/:provider/callback  → validates, finds or creates the STACKD account, opens a session
// All account writes go through the same transactional path as the API.
import { getProvider } from './providers.js';
import { config } from '../config.js';
import { transact } from '../domain/router.js';
import { createUser } from '../domain/models.js';
import { openSession, welcome, uniqueUsername } from '../domain/handlers/auth.js';
import { audit } from '../domain/notify.js';

const STATE_TTL = 10 * 60_000;
const COLORS = ['#5468FF', '#3DDC97', '#FF6A3D', '#FFB547', '#59A8FF', '#C77DFF'];
const safeNext = (n) => (typeof n === 'string' && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(n) && !n.startsWith('//') ? n : null);

export async function startOAuth(providerId, next) {
  const provider = getProvider(providerId);
  if (!provider) return { redirect: `/#/login?error=${providerId}_unavailable` };
  const out = await provider.start({ redirectUri: config.google.redirectUri });
  await transact((db) => {
    const now = Date.now();
    for (const [k, v] of Object.entries(db.oauthStates)) if (now - v.createdAt > STATE_TTL) delete db.oauthStates[k];
    db.oauthStates[out.state] = { provider: providerId, codeVerifier: out.codeVerifier, nonce: out.nonce, next: safeNext(next), createdAt: now };
  });
  return { redirect: out.url };
}

export async function finishOAuth(providerId, currentUrl, meta) {
  const provider = getProvider(providerId);
  if (!provider) return { redirect: `/#/login?error=${providerId}_unavailable` };
  const state = currentUrl.searchParams.get('state');
  if (currentUrl.searchParams.get('error')) return { redirect: '/#/login?error=oauth_cancelled' };

  // Consume the state first (single use), then talk to the provider outside the write lock.
  const saved = await transact((db) => {
    const s = state && db.oauthStates[state];
    if (state) delete db.oauthStates[state];
    return s && s.provider === providerId && Date.now() - s.createdAt < STATE_TTL ? s : null;
  });
  if (!saved) return { redirect: '/#/login?error=oauth_expired' };

  let profile;
  try {
    profile = await provider.finish(currentUrl, { state, codeVerifier: saved.codeVerifier, nonce: saved.nonce });
  } catch (e) {
    console.warn(`[auth] ${providerId} callback rejected:`, e.message);
    return { redirect: '/#/login?error=oauth_failed' };
  }
  if (!profile.email) return { redirect: '/#/login?error=oauth_no_email' };

  const result = await transact((db) => {
    const now = Date.now();
    let ident = db.identities.find((i) => i.provider === providerId && i.providerUserId === profile.providerUserId);
    let user = ident ? db.users.find((u) => u.id === ident.userId) : null;
    let isNew = false;
    if (!user) {
      // Link to an existing STACKD account only when the provider vouches for the email address.
      user = profile.emailVerified ? db.users.find((u) => !u.isBot && u.email.toLowerCase() === profile.email) : null;
      if (!user) {
        if (db.users.some((u) => u.email.toLowerCase() === profile.email)) return { error: 'oauth_email_in_use' };
        user = createUser({
          username: uniqueUsername(db, (profile.name || profile.email.split('@')[0]).replace(/\s+/g, '')),
          name: profile.name || null, email: profile.email, dob: null,
          avatar: { color: COLORS[Math.floor(Math.random() * COLORS.length)], url: profile.picture || null },
          profileComplete: false, onboarded: false, online: true,
        });
        db.users.push(user);
        welcome(db, user);
        isNew = true;
      }
      ident = { provider: providerId, providerUserId: profile.providerUserId, userId: user.id, email: profile.email, emailVerified: profile.emailVerified, createdAt: now, lastUsedAt: now };
      db.identities.push(ident);
    }
    ident.lastUsedAt = now;
    audit(db, user.id, isNew ? 'auth.signup_oauth' : 'auth.login_oauth', user.id, { provider: providerId }, meta.ip);
    return { token: openSession(db, user, meta, providerId), onboarded: user.onboarded && user.profileComplete, role: user.role };
  });
  if (result.error) return { redirect: `/#/login?error=${result.error}` };
  const dest = !result.onboarded ? '/onboarding' : saved.next || (result.role === 'admin' ? '/admin' : '/app');
  return { redirect: `/#${dest}`, token: result.token };
}
