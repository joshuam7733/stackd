// Password hashing with scrypt (memory-hard KDF from Node's crypto module, OWASP-recommended parameters).
// Stored format: scrypt$N$r$p$saltB64$hashB64 — self-describing so parameters can be raised later.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

const derive = (password, salt, n, r, p, keylen) =>
  new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, keylen, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, n, r, p, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const key = await derive(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A real hash of a random password, compared against when the account doesn't exist so that response
// timing doesn't reveal which emails are registered.
let dummy = null;
export async function burnTime(password) {
  dummy ??= await hashPassword(randomBytes(12).toString('hex'));
  await verifyPassword(password, dummy);
  return false;
}
