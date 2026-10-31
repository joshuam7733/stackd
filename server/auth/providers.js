// Sign-in provider registry. Email + password is built in (server/auth/passwords.js). External providers
// implement the same two-step OAuth/OpenID Connect contract so more can be added without touching the
// rest of the app:
//
//   provider.start({ redirectUri })                 → { url, state, codeVerifier, nonce }
//   provider.finish(currentUrl, { state, codeVerifier, nonce }) → { providerUserId, email, emailVerified, name, picture }
//
// Google is implemented with `openid-client` (OpenID Certified): discovery, PKCE (S256), state and nonce
// checks, and ID-token validation are all handled by the library. Apple and other OIDC providers follow the
// same shape (see README → "Adding a sign-in provider"). Phone-number sign-in needs an SMS provider and is
// listed as coming soon.
import * as oidc from 'openid-client';
import { config } from '../config.js';

function oidcProvider({ id, name, issuer, clientId, clientSecret, scope = 'openid email profile', insecure = false }) {
  let discovered = null;
  const discover = async () => {
    discovered ??= oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, insecure ? { execute: [oidc.allowInsecureRequests] } : undefined).catch((e) => {
      discovered = null;
      throw e;
    });
    return discovered;
  };
  return {
    id,
    name,
    enabled: true,
    async start({ redirectUri }) {
      const cfg = await discover();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(cfg, {
        redirect_uri: redirectUri, scope, state, nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier), code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return { url: url.href, state, codeVerifier, nonce };
    },
    async finish(currentUrl, saved) {
      const cfg = await discover();
      const tokens = await oidc.authorizationCodeGrant(cfg, currentUrl, {
        pkceCodeVerifier: saved.codeVerifier, expectedState: saved.state, expectedNonce: saved.nonce, idTokenExpected: true,
      });
      const c = tokens.claims();
      if (!c?.sub) throw new Error('The provider did not return an account id.');
      return { providerUserId: String(c.sub), email: c.email ? String(c.email).toLowerCase() : null, emailVerified: c.email_verified === true || c.email_verified === 'true', name: c.name || c.given_name || null, picture: c.picture || null };
    },
  };
}

const registry = new Map();

if (config.google.enabled) {
  registry.set('google', oidcProvider({
    id: 'google', name: 'Google', issuer: config.google.issuer, clientId: config.google.clientId, clientSecret: config.google.clientSecret,
    insecure: config.env === 'test' && config.google.issuer.startsWith('http://'),
  }));
}

export const getProvider = (id) => registry.get(id) || null;

/** Public description for the sign-in screens. */
export function providerStatus() {
  return {
    password: { enabled: true },
    google: { enabled: registry.has('google'), name: 'Google' },
    apple: { enabled: false, name: 'Apple', comingSoon: true },
    phone: { enabled: false, name: 'Phone number', comingSoon: true },
  };
}
