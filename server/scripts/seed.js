// `npm run db:seed`  — seed an empty database with the demo world.
// `npm run db:reset` — wipe all data and reseed (schema is kept).
import { config } from '../config.js';
import { openDatabase, migrate, isSeeded } from '../db/sqlite.js';
import { createStore, wipe } from '../db/store.js';
import { buildSeed } from '../db/seeding.js';

const reset = process.argv.includes('--reset');
const sql = openDatabase(config.databaseUrl);
migrate(sql);
if (isSeeded(sql) && !reset) {
  console.log(`[db] ${sql.path} already has data. Use \`npm run db:reset\` to wipe and reseed.`);
} else {
  if (reset) wipe(sql);
  const model = await buildSeed();
  const rows = createStore(sql).save(model, { full: true });
  const count = (t) => sql.get(`SELECT COUNT(*) AS n FROM ${t}`).n;
  console.log(`[db] seeded ${sql.path} (${rows} records): ${count('users')} users, ${count('games')} games, ${count('game_modes')} modes, ${count('competitions')} competitions, ${count('tournaments')} tournaments, ${count('teams')} teams, ${count('transactions')} transactions, ${count('missions')} missions`);
}
sql.close();
