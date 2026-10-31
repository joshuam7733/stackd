// `node server/scripts/check-db.js` — integrity checks against the database:
//   * round trip: load → save writes nothing (every field survives the table mapping)
//   * wallets table == ledger for every user
//   * every settled pool reconciles: entries + sponsor money = prizes paid + platform revenue
import { config } from '../config.js';
import { openDatabase, migrate } from '../db/sqlite.js';
import { createStore } from '../db/store.js';
import { upgradeModel } from '../domain/index.js';

const sql = openDatabase(config.databaseUrl);
migrate(sql, { log: () => {} });
const store = createStore(sql);
const model = upgradeModel(store.load());
const writes = store.save(model);
const problems = [];
if (writes) problems.push(`round trip wrote ${writes} record(s): mapping is lossy`);

const drift = sql.all('SELECT user_id, wallet_balance, ledger_balance FROM ledger_integrity WHERE wallet_balance <> ledger_balance');
if (drift.length) problems.push(`${drift.length} wallet(s) disagree with the ledger, e.g. ${JSON.stringify(drift[0])}`);
const negative = sql.all('SELECT user_id, demo_balance FROM wallets WHERE demo_balance < 0');
if (negative.length) problems.push(`${negative.length} negative wallet(s)`);

for (const c of model.competitions.filter((x) => x.kind === 'pool' && x.status === 'settled')) {
  const m = model.matches.find((x) => x.id === c.matchId);
  const r = m?.outcome?.reconciliation;
  if (!r) continue;
  const entries = -sql.get("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE reference = ? AND type = 'COMPETITION_ENTRY'", [c.id]).s;
  const prizes = sql.get("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE reference = ? AND type = 'PRIZE_WIN'", [c.id]).s;
  if (entries !== r.entries) problems.push(`${c.title}: ledger entries ${entries} ≠ ${r.entries}`);
  if (prizes !== r.paidOut) problems.push(`${c.title}: ledger prizes ${prizes} ≠ ${r.paidOut}`);
  if (r.entries + r.sponsorFunded !== r.paidOut + r.platformRevenue) problems.push(`${c.title}: money in ≠ money out`);
}
const counts = Object.fromEntries(['users', 'wallets', 'transactions', 'competitions', 'competition_entries', 'matches', 'tournaments', 'tournament_entrants', 'teams', 'team_members', 'notifications', 'user_achievements', 'score_events', 'missions', 'mission_participants', 'sessions', 'audit_logs'].map((t) => [t, sql.get(`SELECT COUNT(*) AS n FROM ${t}`).n]));
console.log(counts);
console.log(problems.length ? `PROBLEMS:\n - ${problems.join('\n - ')}` : 'OK: round trip lossless, wallets match the ledger, settled pools reconcile.');
sql.close();
process.exit(problems.length ? 1 : 0);
