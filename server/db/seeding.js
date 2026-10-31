// Builds the demo world (server/domain/seed) and prepares it for the database: real password hashes for
// the demo accounts, empty collections for tables the seed doesn't fill.
import { seed } from '../domain/seed/index.js';
import { upgradeModel } from '../domain/index.js';
import { hashPassword } from '../auth/passwords.js';

export const DEMO_PASSWORD = 'demo1234';

export async function buildSeed() {
  const db = upgradeModel(seed());
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const u of db.users) {
    if (u.demoPassword) u.passwordHash = hash; // same hash for the three demo logins; each is still a salted scrypt hash
    delete u.demoPassword;
    delete u.salt;
  }
  return db;
}
