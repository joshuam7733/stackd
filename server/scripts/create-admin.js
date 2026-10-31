// `npm run admin:create -- --email you@example.com --password "long password" [--username ops_you]`
// Creates an admin account, or promotes an existing account to admin. Stop the server first
// (the running server keeps its own copy of the data and would overwrite this change).
import { config } from '../config.js';
import { openDatabase, migrate, isSeeded } from '../db/sqlite.js';
import { createStore } from '../db/store.js';
import { upgradeModel } from '../domain/index.js';
import { createUser } from '../domain/models.js';
import { hashPassword } from '../auth/passwords.js';
import { audit } from '../domain/notify.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const email = arg('email')?.toLowerCase();
const password = arg('password');
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run admin:create -- --email you@example.com --password "at least 12 characters" [--username name]');
  process.exit(1);
}
const sql = openDatabase(config.databaseUrl);
migrate(sql);
if (!isSeeded(sql)) {
  console.error('The database is empty. Run `npm run db:seed` (or start the server once) first.');
  process.exit(1);
}
const store = createStore(sql);
const db = upgradeModel(store.load());
let user = db.users.find((u) => u.email.toLowerCase() === email);
if (user) {
  user.role = 'admin';
  if (password) user.passwordHash = await hashPassword(password);
  console.log(`[admin] promoted ${user.username} <${email}> to admin`);
} else {
  if (!password || password.length < 12) {
    console.error('New admin accounts need --password with at least 12 characters.');
    process.exit(1);
  }
  const username = arg('username') || `ops_${email.split('@')[0].replace(/[^A-Za-z0-9_.]/g, '').slice(0, 11)}`;
  user = createUser({ username, email, role: 'admin', onboarded: true, passwordHash: await hashPassword(password), kyc: { status: 'verified', level: 3 } });
  db.users.push(user);
  console.log(`[admin] created admin ${username} <${email}>`);
}
audit(db, 'cli', 'admin.create', user.id);
store.save(db);
sql.close();
