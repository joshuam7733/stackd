// End-to-end tests against a real server and a real (temporary) SQLite database.
// Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client, mockOidc, until, sleep } from './helpers.js';

const PORT = 5291;
const OIDC_PORT = 5292;
const dir = mkdtempSync(join(tmpdir(), 'stackd-test-'));
const DB = `sqlite:${join(dir, 'test.db')}`;
const BASE = `http://127.0.0.1:${PORT}`;

Object.assign(process.env, {
  NODE_ENV: 'test', PORT: String(PORT), HOST: '127.0.0.1', PUBLIC_URL: BASE, DATABASE_URL: DB,
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_ISSUER: `http://127.0.0.1:${OIDC_PORT}`,
  SIM_COUNTDOWN_MS: '400', SIM_MATCH_MS: '1500', WORLD_TICK_MS: '200',
});

let app;
let oidc;
let startApp;
const boot = async () => (app = await startApp({ port: PORT, host: '127.0.0.1', databaseUrl: DB, quiet: true, rateLimits: false, worldTickMs: 200 }));

before(async () => {
  oidc = await mockOidc({ port: OIDC_PORT, clientId: 'test-client', clientSecret: 'test-secret', account: { sub: 'google-user-42', email: 'ada.gamer@gmail.test', name: 'Ada Gamer' } });
  ({ startApp } = await import('../app.js'));
  await boot();
});

after(async () => {
  await app?.close();
  await oidc?.close();
  rmSync(dir, { recursive: true, force: true });
});

const admin = async () => {
  const a = client(BASE);
  await a('auth.login', { login: 'admin@stackd.demo', password: 'demo1234' });
  return a;
};

async function newPlayer(name) {
  const p = client(BASE);
  await p('auth.signup', { email: `${name}@test.dev`, username: name, password: 'correct horse battery', dob: '1999-05-05', country: 'UG' });
  await p('account.onboard', { games: ['codm', 'efootball'], platforms: ['mobile'], avatarColor: '#3DDC97', inGameIds: { codm: `${name}-ign` } });
  return p;
}

test('Test 1: sign up → onboarding → profile → refresh → logout → login → restart: data persists', async () => {
  const p = client(BASE);
  const out = await p('auth.signup', { email: 'kato@test.dev', username: 'kato_1', password: 'correct horse battery', dob: '2000-02-02', country: 'UG', name: 'Kato' });
  assert.equal(out.token, undefined, 'session token never reaches the browser');
  assert.match(p.cookie(), /^stackd_sid=/);
  assert.equal(out.user.wallet.available, 100000, 'new accounts get UGX 100,000 DEMO');
  assert.equal(out.user.onboarded, false);

  await p('account.onboard', { games: ['codm', 'pubgm'], platforms: ['mobile'], avatarColor: '#FF6A3D', inGameIds: { codm: 'KATO-1' } });
  const me = await p('auth.me'); // a "refresh" is just a new request with the same cookie
  assert.equal(me.onboarded, true);
  assert.deepEqual(me.games, ['codm', 'pubgm']);
  assert.equal(me.inGameIds.codm, 'KATO-1');

  await p('auth.logout');
  assert.equal(await p('auth.me'), null, 'logged out');
  await p('wallet.summary', {}, { expect: 'UNAUTHENTICATED' });

  await p('auth.login', { login: 'kato@test.dev', password: 'wrong password!' }, { expect: 'UNAUTHENTICATED' });

  // Restart the whole server: everything must come back from SQLite.
  await app.close();
  await sleep(250); // let the HTTP client notice its pooled keep-alive sockets were closed
  await boot();
  const again = client(BASE);
  const back = await again('auth.login', { login: 'KATO_1', password: 'correct horse battery' });
  assert.equal(back.user.username, 'kato_1');
  assert.deepEqual(back.user.games, ['codm', 'pubgm']);
  assert.equal(back.user.avatar.color, '#FF6A3D');
  assert.equal(back.user.wallet.available, 100000);
  const row = app.sql.get('SELECT password_hash, selected_games, region FROM users WHERE username = ?', ['kato_1']);
  assert.match(row.password_hash, /^scrypt\$/, 'passwords are stored as scrypt hashes');
  assert.equal(row.region, 'east_africa');
});

test('Test 2: Google sign-in → profile created → logout → sign in again → profile restored', async () => {
  const g = client(BASE);
  const providers = await g('auth.providers');
  assert.equal(providers.google.enabled, true);

  const signIn = async () => {
    const start = await g.get('/auth/google/start?next=/app/wallet');
    assert.equal(start.status, 302);
    const authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.origin, `http://127.0.0.1:${OIDC_PORT}`);
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    const consent = await fetch(authorize, { redirect: 'manual' });
    const callback = new URL(consent.headers.get('location'));
    const done = await g.get(callback.pathname + callback.search);
    assert.equal(done.status, 302);
    return done.headers.get('location');
  };

  assert.equal(await signIn(), '/#/onboarding', 'new Google accounts go to onboarding');
  let me = await g('auth.me');
  assert.equal(me.email, 'ada.gamer@gmail.test');
  assert.equal(me.profileComplete, false);
  assert.deepEqual(me.authProviders, ['google']);
  assert.equal(me.wallet.available, 100000);
  await g('account.onboard', { games: ['freefire'], platforms: ['mobile'] }, { expect: 'VALIDATION' });
  await g('account.onboard', { games: ['freefire'], platforms: ['mobile'], username: 'ada_g', dob: '2001-01-01', country: 'KE' });

  await g('auth.logout');
  assert.equal(await g('auth.me'), null);
  assert.equal(await signIn(), '/#/app/wallet', 'returning users skip onboarding and land where they started');
  me = await g('auth.me');
  assert.equal(me.username, 'ada_g');
  assert.equal(me.country, 'KE');
  assert.deepEqual(me.games, ['freefire']);
  assert.equal(app.sql.get("SELECT COUNT(*) AS n FROM auth_identities WHERE provider = 'google'").n, 1);

  // A forged / replayed callback is rejected.
  const replay = await g.get('/auth/google/callback?code=nope&state=forged');
  assert.equal(replay.headers.get('location'), '/#/login?error=oauth_expired');
});

test('Test 3 + 7: admin creates (draft) → configures fee → publishes; player joins; entry recorded; wallet debited; capacity and duplicates enforced', async () => {
  const a = await admin();
  const p1 = await newPlayer('joiner_1');
  const p2 = await newPlayer('joiner_2');
  await p1('admin.compCreate', { title: 'Nope', gameId: 'codm', modeId: 'br_solo', platform: 'mobile', entry: 5000, minPlayers: 2, maxPlayers: 2, startsInMin: 30, prize: { model: 'winner_takes_all', feePct: 20 }, featured: false, realMoney: false }, { expect: 'FORBIDDEN' });

  const draft = await a('admin.compCreate', { title: 'Duel Drop', gameId: 'codm', modeId: 'br_solo', platform: 'mobile', entry: 5000, minPlayers: 2, maxPlayers: 2, startsInMin: 30, prize: { model: 'winner_takes_all', feePct: 20 }, featured: false, realMoney: false, publish: false });
  assert.equal(draft.status, 'draft');
  await p1('competitions.get', { id: draft.id }, { expect: 'NOT_FOUND' });
  await a('admin.compUpdate', { id: draft.id, prize: { model: 'winner_takes_all', feePct: 25 } });
  await a('admin.compAction', { id: draft.id, action: 'publish' });

  await p1('competitions.join', { id: draft.id });
  await p1('competitions.join', { id: draft.id }, { expect: 'CONFLICT' }); // can't join the same competition twice
  const w1 = await p1('wallet.summary');
  assert.equal(w1.balances.available, 95000);
  assert.equal(w1.recent[0].type, 'entry');
  assert.equal(w1.recent[0].amount, -5000);
  await a('admin.compUpdate', { id: draft.id, entry: 1000 }, { expect: 'STATE' }); // money terms lock once someone paid

  await p2('competitions.join', { id: draft.id });
  const p3 = await newPlayer('joiner_3');
  const full = await p3('competitions.join', { id: draft.id }, { expect: 'STATE' });
  assert.match(full.message, /full|no longer/i);

  const row = app.sql.get("SELECT status, platform_fee_pct, players FROM competitions WHERE id = ?", [draft.id]);
  assert.deepEqual({ ...row }, { status: 'FULL', platform_fee_pct: 25, players: 2 });
  assert.equal(app.sql.get("SELECT COUNT(*) AS n FROM transactions WHERE reference = ? AND type = 'COMPETITION_ENTRY'", [draft.id]).n, 2);
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM competition_entries WHERE competition_id = ?', [draft.id]).n, 2);
});

test('Test 4: 100-player Battle Royale — 1,000,000 gross, 20% fee, 800,000 prize, 200,000 per winning squad member', async () => {
  const a = await admin();
  const p = await newPlayer('br_hero');
  const c = await a('admin.compCreate', { title: 'BR Test 100', gameId: 'codm', modeId: 'br_squad', platform: 'mobile', entry: 10000, minPlayers: 100, maxPlayers: 100, startsInMin: 60, prize: { model: 'winner_takes_all', feePct: 20, teamSplit: 'equal' }, featured: false, realMoney: false });
  assert.equal(c.projected.gross, 1_000_000);
  assert.equal(c.projected.fee, 200_000);
  assert.equal(c.projected.net, 800_000);
  assert.equal(c.projected.allocations[0].perPlayer, 200_000);

  await p('competitions.join', { id: c.id });
  await a('admin.compAction', { id: c.id, action: 'fill_all' });
  await a('admin.compAction', { id: c.id, action: 'start' });
  const detail = await p('competitions.get', { id: c.id });
  assert.equal(detail.players, 100);
  assert.ok(['starting', 'live'].includes(detail.status));
  const live = await until(async () => {
    const m = await p('matches.get', { id: detail.matchId });
    return m.live?.phase === 'live' && m.live.feed.length > 0 ? m : null;
  }, { what: 'live eliminations' });
  assert.equal(live.live.simulated, true);
  assert.equal(live.canReport, false, 'integration-driven matches are not self-reported');

  const done = await until(async () => {
    const m = await p('matches.get', { id: detail.matchId });
    return m.status === 'settled' ? m : null;
  }, { what: 'settlement' });
  assert.equal(done.verification.status, 'verified');
  assert.equal(done.verification.simulated, true);

  const sum = (type) => app.sql.get('SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS n FROM transactions WHERE reference = ? AND type = ?', [c.id, type]);
  assert.deepEqual({ ...sum('COMPETITION_ENTRY') }, { s: -1_000_000, n: 100 });
  assert.deepEqual({ ...sum('PRIZE_WIN') }, { s: 800_000, n: 4 });
  const winners = app.sql.all("SELECT winnings, placement FROM competition_entries WHERE competition_id = ? AND result = 'won'", [c.id]);
  assert.deepEqual(winners.map((w) => w.winnings), [200_000, 200_000, 200_000, 200_000]);
  assert.ok(winners.every((w) => w.placement === 1));
  assert.equal(app.sql.get('SELECT SUM(amount) AS s FROM platform_revenue WHERE reference = ?', [c.id]).s, 200_000);
  assert.equal(app.sql.get('SELECT verification_status AS v FROM matches WHERE competition_id = ?', [c.id]).v, 'VERIFIED');
  assert.equal(app.sql.get("SELECT status FROM competitions WHERE id = ?", [c.id]).status, 'COMPLETED');

  const me = await p('auth.me');
  assert.equal(me.stats.matches, 1);
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM score_events WHERE user_id = ? AND match_id = ?', [me.id, detail.matchId]).n, 1);
  const notes = await p('notifications.list');
  assert.ok(notes.some((n) => /Lobby locked/.test(n.title)));
  assert.ok(notes.some((n) => /is live/.test(n.title)));
  assert.ok(notes.some((n) => /You won|You lost/.test(n.title)));
  const board = await p('leaderboards.get', { scope: 'global', metric: 'competitions' });
  assert.ok(board.me, 'player appears on the leaderboard');
  // The wallets table always equals the ledger.
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM ledger_integrity WHERE wallet_balance <> ledger_balance').n, 0);
});

test('Test 5: 1v1 single-elimination tournament — register → bracket → match → result → progression → winner', async () => {
  const a = await admin();
  const p = await newPlayer('cup_runner');
  const t = await a('admin.tourCreate', { name: 'Test Cup', gameId: 'efootball', modeId: 'h2h', platform: 'mobile', format: 'single_elim', maxEntrants: 4, entry: 5000, startsInMin: 60, prize: { model: 'placement', feePct: 10, placements: [70, 30] }, guaranteed: 0, featured: false, rules: [] });
  await p('tournaments.register', { id: t.id });
  await p('tournaments.register', { id: t.id }, { expect: 'CONFLICT' });
  assert.equal((await p('wallet.summary')).balances.available, 95000);
  await a('admin.tourAction', { id: t.id, action: 'start' });
  let view = await p('tournaments.get', { id: t.id });
  assert.equal(view.status, 'live');
  assert.equal(view.entrants, 4, 'empty slots filled by demo players who paid their own entries');
  assert.equal(app.sql.get("SELECT COUNT(*) AS n FROM transactions WHERE reference = ? AND type = 'COMPETITION_ENTRY'", [t.id]).n, 4);

  let rounds = 0;
  while (view.status === 'live' && view.myNext && rounds < 4) {
    const m = await p('tournaments.playMatch', { id: t.id });
    const sim = await p('matches.simulate', { id: m.id });
    const out = await p('matches.report', { id: m.id, stats: sim.stats, evidence: [sim.evidence] });
    assert.equal(out.status, 'settled');
    rounds++;
    view = await p('tournaments.get', { id: t.id });
  }
  assert.ok(rounds >= 1);
  view = await until(async () => {
    const v = await p('tournaments.get', { id: t.id });
    return v.status === 'completed' ? v : null;
  }, { what: 'tournament completion' });
  assert.ok(view.champion?.name);
  const prizes = app.sql.get("SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS n FROM transactions WHERE reference = ? AND type = 'PRIZE_WIN'", [t.id]);
  assert.equal(prizes.s, 18000); // 4 × 5,000 = 20,000 gross, 10% fee → 18,000 (70/30 split)
  assert.equal(app.sql.get('SELECT status FROM tournaments WHERE id = ?', [t.id]).status, 'completed');
});

test('Test 6: team — create → invite → accept → enter a team competition', async () => {
  const cap = await newPlayer('captain_x');
  const mate = await newPlayer('mate_y');
  const mateMe = await mate('auth.me');
  const team = await cap('teams.create', { name: 'Test Squad', tag: 'TSQ', color: '#59A8FF', games: ['codm'], open: false });
  await cap('teams.invite', { id: team.id, userId: mateMe.id });
  assert.ok((await mate('notifications.list')).some((n) => /invited you/.test(n.title)));
  await mate('teams.respond', { id: team.id, accept: true });
  const t = await cap('teams.get', { id: team.id });
  assert.equal(t.members.length, 2);
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?', [team.id]).n, 2);

  const a = await admin();
  const c = await a('admin.compCreate', { title: 'Squad Night Test', gameId: 'codm', modeId: 'br_squad', platform: 'mobile', entry: 2000, minPlayers: 8, maxPlayers: 40, startsInMin: 60, prize: { model: 'team', feePct: 20, placements: [70, 30], teamSplit: 'equal' }, featured: false, realMoney: false });
  await cap('competitions.join', { id: c.id, teamId: team.id });
  const d = await cap('competitions.get', { id: c.id });
  assert.equal(d.mySquad.name, 'Test Squad');
  assert.equal(d.mySquad.members.length, 4);
  assert.equal((await cap('wallet.summary')).balances.available, 100000 - 2 * 2000, 'captain pays for STACKD teammates’ seats');
  assert.equal((await mate('wallet.summary')).balances.available, 100000);
  assert.ok((await mate('notifications.list')).some((n) => /entered Test Squad/.test(n.title)));
  await mate('competitions.leave', { id: c.id }, { expect: 'STATE' });
  await cap('competitions.leave', { id: c.id });
  assert.equal((await cap('wallet.summary')).balances.available, 100000, 'full refund when the squad withdraws');
});

test('Challenge → result → achievement unlocked → mission progress → notifications', async () => {
  const p = await newPlayer('grinder_z');
  const me0 = await p('auth.me');
  await p('missions.start', { id: 'msn_rapid_grind' });
  const tpl = (await p('challenges.templates', { gameId: 'codm' }))[0];
  const created = await p('challenges.create', { templateId: tpl.id, entry: 2000, platform: 'mobile' });
  const sim = await p('matches.simulate', { id: created.matchId });
  const out = await p('matches.report', { id: created.matchId, stats: sim.stats, evidence: [sim.evidence] });
  assert.ok(['settled', 'review'].includes(out.status));
  if (out.status === 'review') await until(async () => (await p('matches.get', { id: created.matchId })).status === 'settled', { what: 'referee review' });
  const settled = await p('matches.get', { id: created.matchId });
  const won = settled.mine.won;
  const w = await p('wallet.summary');
  assert.equal(w.balances.available, 100000 - 2000 + (won ? settled.competition.challenge.payout : 0));

  // "Run it back" is deterministic: taking a rematch unlocks the Run it back achievement.
  await p('competitions.rematch', { id: created.competitionId });
  const me = await p('auth.me');
  assert.ok(me.achievements.some((a) => a.id === 'run_it_back'));
  assert.equal(app.sql.get("SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ? AND achievement_id = 'run_it_back'", [me0.id]).n, 1);
  const notes = await p('notifications.list');
  assert.ok(notes.some((n) => n.title === 'Achievement unlocked: Run it back'));
  const mission = await p('missions.get', { id: 'msn_rapid_grind' });
  assert.equal(mission.progress.counts.matches, 1, 'verified results advance progress missions');
  assert.ok(notes.some((n) => /Mission progress/.test(n.title)));
  assert.equal(app.sql.get("SELECT status FROM mission_participants WHERE mission_id = 'msn_rapid_grind' AND user_id = ?", [me0.id]).status, 'in_progress');
});

test('Security: auth, roles, CSRF header and static file guard', async () => {
  const anon = client(BASE);
  await anon('home.get', {}, { expect: 'UNAUTHENTICATED' });
  const p = await newPlayer('sec_user');
  await p('admin.users', {}, { expect: 'FORBIDDEN' });
  await p('account.resetDemo', {}, { expect: 'FORBIDDEN' });
  const noHeader = await fetch(`${BASE}/api/rpc/auth.me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  for (const path of ['/server/app.js', '/server/domain/router.js', '/package.json', '/.env', '/data/test.db'])
    assert.equal((await fetch(BASE + path)).status, 404, `${path} must not be served`);
  assert.equal((await fetch(BASE + '/src/ui/app.js')).status, 200);
  const me = await p('auth.me');
  assert.equal(me.passwordHash, undefined);
  assert.equal(JSON.stringify(await p('players.get', { username: 'sec_user' })).includes('scrypt$'), false);
});

test('Atomicity: a write that fails halfway leaves no trace in memory or in the database', async () => {
  const { transact } = await import('../domain/router.js');
  const { getDb } = await import('../domain/db.js');
  const id = getDb().users.find((u) => u.username === 'nilewave').id;
  const before = getDb().users.find((u) => u.id === id).bio;
  await assert.rejects(transact((db) => {
    db.users.find((u) => u.id === id).bio = 'half-written';
    db.ledger.push({ id: 'tx_should_vanish', userId: id, type: 'bonus', amount: 1, bucket: 'cash', status: 'completed', ref: null, description: 'x', meta: {}, createdAt: Date.now(), updatedAt: Date.now() });
    throw new Error('boom');
  }), /boom/);
  assert.equal(getDb().users.find((u) => u.id === id).bio, before);
  assert.equal(getDb().ledger.some((t) => t.id === 'tx_should_vanish'), false);
  assert.equal(app.sql.get("SELECT COUNT(*) AS n FROM transactions WHERE id = 'tx_should_vanish'").n, 0);
});

test('Integrity: wallets equal the ledger and every settled pool reconciles', async () => {
  await sleep(300);
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM ledger_integrity WHERE wallet_balance <> ledger_balance').n, 0);
  assert.equal(app.sql.get('SELECT COUNT(*) AS n FROM wallets WHERE demo_balance < 0').n, 0);
});
