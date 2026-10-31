import { randomBytes } from 'node:crypto';
import { define, hashToken } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { createUser, COUNTRIES } from '../models.js';
import { age, DAY, HOUR } from '../util.js';
import { post } from '../ledger.js';
import { notify, audit } from '../notify.js';
import { selfUser } from './views.js';
import { resetDb } from '../db.js';
import { seed } from '../seed/index.js';
import { hashPassword, verifyPassword, burnTime } from '../../auth/passwords.js';
import { money } from '../fmt.js';

export const SESSION_TTL = 30 * DAY;
const DEMO_ACCOUNTS = { player: 'usr_demo', admin: 'usr_admin', sponsor: 'usr_sponsor' };
const COLORS = ['#5468FF', '#3DDC97', '#FF6A3D', '#FFB547', '#59A8FF', '#C77DFF'];
const COUNTRY_CODES = COUNTRIES.map((c) => c.code);

/** Create a server-side session. The raw token goes to the browser as an HttpOnly cookie; only its hash is stored. */
export function openSession(db, user, meta = {}, provider = 'password') {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  for (const [h, sess] of Object.entries(db.sessions)) if (sess.expiresAt < now) delete db.sessions[h];
  db.sessions[hashToken(token)] = {
    userId: user.id, createdAt: now, expiresAt: now + SESSION_TTL, lastSeenAt: now,
    ip: meta.ip || null, userAgent: (meta.userAgent || '').slice(0, 200) || null, provider,
  };
  user.lastSeen = now;
  user.online = true;
  return token;
}

/** Starter demo wallet + welcome notifications for a brand-new account. */
export function welcome(db, user) {
  const starter = db.config.starterStack;
  post(db, { userId: user.id, type: 'bonus', amount: starter, description: 'Demo starter wallet (not real money)', meta: { demo: true } });
  if (db.config.starterBonus > 0) post(db, { userId: user.id, type: 'bonus', amount: db.config.starterBonus, bucket: 'bonus', description: 'Welcome bonus credit (demo)' });
  const total = starter + (db.config.starterBonus || 0);
  notify(db, user.id, { type: 'system', title: 'Welcome to STACKD', body: `Your demo wallet is loaded with ${money(total)} DEMO. Play for the bag.`, link: '/app/wallet' });
}

export function uniqueUsername(db, base) {
  const clean = (base || 'player').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 12) || 'player';
  const taken = (n) => db.users.some((u) => u.username.toLowerCase() === n.toLowerCase());
  let name = clean.length >= 3 ? clean : `${clean}_gg`;
  for (let i = 0; taken(name); i++) name = `${clean.slice(0, 11)}${Math.floor(Math.random() * 9000 + 1000)}`;
  return name;
}

define('auth.signup', {
  auth: false, write: true, rate: 'auth',
  schema: s.obj({
    email: s.str({ max: 120, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', patternMessage: 'Enter a valid email address.' }),
    username: s.str({ min: 3, max: 16, pattern: '^[A-Za-z0-9_.]+$', patternMessage: 'Usernames use letters, numbers, dots and underscores.' }),
    password: s.str({ min: 8, max: 128, trim: false }),
    name: s.opt(s.str({ max: 60 })),
    dob: s.str({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', patternMessage: 'Enter your date of birth.' }),
    country: s.oneOf(COUNTRY_CODES),
  }),
  audit: (p, out) => out?.user?.id,
  async handler({ db, meta }, p) {
    const email = p.email.toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw E.conflict('An account with that email already exists. Log in instead.');
    if (db.users.some((u) => u.username.toLowerCase() === p.username.toLowerCase())) throw E.conflict('That username is taken. Try another.');
    const years = age(p.dob);
    if (years < 13) throw E.invalid('You need to be 13 or older to use STACKD.', { path: 'params.dob' });
    if (years > 100) throw E.invalid('Check your date of birth.', { path: 'params.dob' });
    if (!db.jurisdictions[p.country]?.enabled) throw E.blocked([{ code: 'JURISDICTION', message: "STACKD isn't live in your country yet. We'll email you when it is." }]);
    const user = createUser({
      username: p.username, name: p.name || p.username, email, dob: p.dob, country: p.country,
      passwordHash: await hashPassword(p.password),
      avatar: { color: COLORS[Math.floor(Math.random() * COLORS.length)] },
      online: true,
    });
    db.users.push(user);
    welcome(db, user);
    if (years < db.jurisdictions[p.country].minAge)
      notify(db, user.id, { type: 'system', title: 'Free play is open to you', body: `Paid entries unlock at ${db.jurisdictions[p.country].minAge}. Free competitions, missions and arcade practice are all yours.`, link: '/app/play' });
    return { token: openSession(db, user, meta), user: selfUser(db, user) };
  },
});

define('auth.login', {
  auth: false, write: true, rate: 'auth',
  schema: s.obj({ login: s.str({ min: 3, max: 120 }), password: s.str({ min: 1, max: 128, trim: false }) }),
  async handler({ db, meta }, p) {
    const key = p.login.toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === key || u.username.toLowerCase() === key);
    const fail = () => E.auth("That email and password don't match. Check both and try again.");
    if (!user || user.isBot || !user.passwordHash) {
      await burnTime(p.password);
      if (user && !user.isBot && !user.passwordHash) throw E.auth('This account signs in with Google. Use "Continue with Google".');
      throw fail();
    }
    if (!(await verifyPassword(p.password, user.passwordHash))) {
      audit(db, user.id, 'auth.login_failed', user.id, {}, meta.ip);
      throw fail();
    }
    audit(db, user.id, 'auth.login', user.id, {}, meta.ip);
    return { token: openSession(db, user, meta), user: selfUser(db, user) };
  },
});

define('auth.demo', {
  auth: false, write: true, rate: 'auth',
  schema: s.obj({ as: s.oneOf(['player', 'admin', 'sponsor']) }),
  handler({ db, meta }, p) {
    if (!db.config.demoMode || process.env.DEMO_LOGINS === 'false') throw E.forbidden('One-tap demo access is turned off on this server.');
    const user = db.users.find((u) => u.id === DEMO_ACCOUNTS[p.as]);
    if (!user) throw E.notFound('Demo account');
    audit(db, user.id, 'auth.demo_login', user.id, {}, meta.ip);
    return { token: openSession(db, user, meta, 'demo'), user: selfUser(db, user) };
  },
});

define('auth.logout', {
  write: true, allowSuspended: true,
  handler({ db, tokenHash, user }) {
    delete db.sessions[tokenHash];
    if (!Object.values(db.sessions).some((x) => x.userId === user.id)) user.online = false;
    return { ok: true };
  },
});

define('auth.me', {
  auth: false,
  handler({ db, user }) {
    return user ? selfUser(db, user) : null;
  },
});

define('account.onboard', {
  write: true,
  schema: s.obj({
    games: s.arr(s.str({ max: 40 }), { min: 1, max: 12 }),
    platforms: s.arr(s.oneOf(['mobile', 'pc', 'playstation', 'xbox']), { min: 1, max: 4 }),
    avatarColor: s.opt(s.str({ pattern: '^#[0-9A-Fa-f]{6}$' })),
    inGameIds: s.opt(s.record()),
    // Only for accounts created through Google, which arrive without these.
    username: s.opt(s.str({ min: 3, max: 16, pattern: '^[A-Za-z0-9_.]+$', patternMessage: 'Usernames use letters, numbers, dots and underscores.' })),
    dob: s.opt(s.str({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', patternMessage: 'Enter your date of birth.' })),
    country: s.opt(s.oneOf(COUNTRY_CODES)),
  }),
  handler({ db, user }, p) {
    if (!user.profileComplete) {
      if (!p.username || !p.dob || !p.country) throw E.invalid('Pick a username and add your date of birth and country.');
      if (db.users.some((u) => u !== user && u.username.toLowerCase() === p.username.toLowerCase())) throw E.conflict('That username is taken. Try another.', { path: 'params.username' });
      const years = age(p.dob);
      if (years < 13) throw E.invalid('You need to be 13 or older to use STACKD.', { path: 'params.dob' });
      if (years > 100) throw E.invalid('Check your date of birth.', { path: 'params.dob' });
      if (!db.jurisdictions[p.country]?.enabled) throw E.blocked([{ code: 'JURISDICTION', message: "STACKD isn't live in your country yet." }]);
      user.username = p.username;
      user.dob = p.dob;
      user.country = p.country;
      user.profileComplete = true;
    }
    const known = new Set(db.games.map((g) => g.id));
    user.games = p.games.filter((g) => known.has(g));
    user.platforms = p.platforms;
    if (p.avatarColor) user.avatar = { ...user.avatar, color: p.avatarColor };
    if (p.inGameIds) user.inGameIds = { ...user.inGameIds, ...cleanIds(p.inGameIds) };
    for (const g of user.games) user.gameScores[g] ||= { score: user.stackScore, matches: 0, wins: 0 };
    user.onboarded = true;
    return selfUser(db, user);
  },
});

const cleanIds = (ids) => Object.fromEntries(Object.entries(ids || {}).filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.trim().slice(0, 40)]));

define('account.update', {
  write: true,
  schema: s.obj({
    name: s.opt(s.str({ max: 60 })),
    bio: s.opt(s.str({ max: 120 })),
    avatarColor: s.opt(s.str({ pattern: '^#[0-9A-Fa-f]{6}$' })),
    games: s.opt(s.arr(s.str({ max: 40 }), { max: 12 })),
    platforms: s.opt(s.arr(s.oneOf(['mobile', 'pc', 'playstation', 'xbox']), { min: 1, max: 4 })),
    inGameIds: s.opt(s.record()),
  }),
  handler({ db, user }, p) {
    if (p.name != null) user.name = p.name || user.username;
    if (p.bio != null) user.bio = p.bio;
    if (p.avatarColor) user.avatar = { ...user.avatar, color: p.avatarColor };
    if (p.games) {
      user.games = p.games.filter((g) => db.games.some((x) => x.id === g));
      for (const g of user.games) user.gameScores[g] ||= { score: user.stackScore, matches: 0, wins: 0 };
    }
    if (p.platforms) user.platforms = p.platforms;
    if (p.inGameIds) user.inGameIds = { ...user.inGameIds, ...cleanIds(p.inGameIds) };
    return selfUser(db, user);
  },
});

// DEMO ONLY: lets testers see how jurisdiction rules change the product. In production the
// country comes from KYC + geolocation and cannot be changed by the player.
define('account.simulateCountry', {
  write: true,
  schema: s.obj({ country: s.oneOf(COUNTRY_CODES) }),
  audit: (p) => `country:${p.country}`,
  handler({ db, user }, p) {
    if (!db.config.demoMode) throw E.forbidden();
    user.country = p.country;
    return selfUser(db, user);
  },
});

define('account.kycSubmit', {
  write: true,
  schema: s.obj({ docType: s.oneOf(['national_id', 'passport', 'driving_permit']), docName: s.str({ max: 120 }), selfieName: s.str({ max: 120 }) }),
  audit: () => 'kyc',
  handler({ db, user }, p) {
    if (user.kyc.status === 'verified') throw E.state("You're already verified.");
    user.kyc = { status: 'pending', level: 1, submittedAt: Date.now(), docType: p.docType, docName: p.docName, selfieName: p.selfieName };
    notify(db, user.id, { type: 'kyc', title: 'Verification submitted', body: 'We usually confirm in a few minutes (about 20 seconds in the demo).', link: '/app/settings' });
    return selfUser(db, user);
  },
});

define('account.setLimits', {
  write: true,
  schema: s.obj({ dailyDeposit: s.opt(s.int({ min: 1000, max: 50_000_000 })), dailyEntry: s.opt(s.int({ min: 1000, max: 50_000_000 })) }),
  audit: () => 'limits',
  handler({ db, user }, p) {
    // Lowering a limit is instant. Raising (or removing) one waits 24 hours.
    const now = Date.now();
    const pending = {};
    for (const key of ['dailyDeposit', 'dailyEntry']) {
      const next = p[key] ?? null;
      const cur = user.limits[key];
      if (cur == null || (next != null && next <= cur)) user.limits[key] = next;
      else if (next !== cur) pending[key] = next;
    }
    user.limits.pending = Object.keys(pending).length ? { ...pending, effectiveAt: now + DAY } : null;
    return selfUser(db, user);
  },
});

define('account.coolOff', {
  write: true,
  schema: s.obj({ hours: s.oneOf([24, 72, 168]) }),
  audit: (p) => `cool_off:${p.hours}h`,
  handler({ db, user }, p) {
    user.coolOffUntil = Date.now() + p.hours * HOUR;
    return selfUser(db, user);
  },
});

define('account.selfExclude', {
  write: true,
  schema: s.obj({ months: s.oneOf([1, 3, 6, 12]) }),
  audit: (p) => `self_exclude:${p.months}m`,
  handler({ db, user }, p) {
    user.selfExcludedUntil = Date.now() + p.months * 30 * DAY;
    return selfUser(db, user);
  },
});

// Resets the shared demo world for everyone, so it is an admin action on a real server.
define('account.resetDemo', {
  write: true, allowSuspended: true, roles: ['admin'],
  audit: () => 'reset_demo_world',
  handler({ db }) {
    if (!db.config.demoMode) throw E.forbidden();
    setTimeout(() => resetDb(seed), 50);
    return { ok: true };
  },
});
