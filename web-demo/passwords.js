// Browser stand-in for server/auth/passwords.js (static demo build only): PBKDF2-SHA256 via WebCrypto.
// The demo's accounts live in the visitor's own browser, so this protects nothing across users; it keeps
// the same async interface as the server's scrypt implementation.
const ITER = 100_000;
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

export async function verifyPassword(password, stored) {
  if (!stored?.startsWith('pbkdf2$')) return false;
  const [, iter, salt, hash] = stored.split('$');
  const got = await derive(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  return got.length === want.length && got.every((b, i) => b === want[i]);
}

export async function burnTime(password) {
  await derive(password, new Uint8Array(16), ITER);
  return false;
}
