// Registers every RPC handler and exposes the model upgrade applied after loading from the database.
import { MEDIA, MEDIA_REV } from './seed/catalog.js';
import './handlers/auth.js';
import './handlers/catalog.js';
import './handlers/compete.js';
import './handlers/social.js';
import './handlers/wallet.js';
import './handlers/admin.js';
import './handlers/bigstack.js';

export { dispatch, transact, serialized, listMethods } from './router.js';
export { tick } from './world.js';
export { getDb, subscribe, getVersion } from './db.js';

/**
 * Non-destructive upgrades for a model loaded from the database: collections added after the first
 * deploy, catalog artwork (never overwriting artwork an admin customised).
 */
export function upgradeModel(db) {
  for (const k of ['identities', 'scoreEvents', 'teams', 'competitions', 'matches', 'tournaments', 'ledger', 'notifications', 'revenue', 'feed', 'audit', 'fraud', 'drops', 'disputes', 'reports', 'tickets', 'markets', 'positions', 'stakingRuns', 'stakes', 'arcade', 'arcadeRuns', 'sponsors', 'campaigns', 'missions', 'challengeTemplates', 'achievementDefs', 'games', 'users'])
    db[k] ||= [];
  for (const k of ['sessions', 'idempotency', 'oauthStates', 'jurisdictions']) db[k] ||= {};
  // Starter wallets are demo funding, not bonuses (older seeds didn't flag them).
  for (const t of db.ledger) if (t.type === 'bonus' && !t.meta?.demo && /^Demo (starter|wallet)/.test(t.description || '')) t.meta = { ...(t.meta || {}), demo: true };
  for (const g of db.games) {
    if (MEDIA[g.id] && (!g.media || (!g.media.custom && (g.media.rev || 0) < MEDIA_REV))) g.media = { ...MEDIA[g.id], rev: MEDIA_REV };
    g.integration ||= 'simulation';
  }
  return db;
}
