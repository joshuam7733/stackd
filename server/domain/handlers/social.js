import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import { createTeam } from '../models.js';
import { registerTournament, unregisterTournament, startTournament, openTournamentMatch } from '../services/tournaments.js';
import { tourView, lite, gameMini, pubUser, matchView } from './views.js';
import { notify } from '../notify.js';

// ---- tournaments ------------------------------------------------------------------------------

const getTour = (db, id) => {
  const t = db.tournaments.find((x) => x.id === id);
  if (!t) throw E.notFound('Tournament');
  return t;
};

define('tournaments.list', {
  auth: false,
  schema: s.obj({ status: s.opt(s.oneOf(['registration', 'live', 'completed'])), gameId: s.opt(s.str({ max: 40 })), format: s.opt(s.str({ max: 30 })), mine: s.opt(s.bool()) }),
  handler({ db, user }, p) {
    return db.tournaments
      .filter((t) => t.status !== 'cancelled' || user?.role === 'admin')
      .filter((t) => !p.status || t.status === p.status)
      .filter((t) => !p.gameId || t.gameId === p.gameId)
      .filter((t) => !p.format || t.format === p.format)
      .filter((t) => !p.mine || (user && t.entrants.some((e) => e.members.includes(user.id))))
      .sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || a.startsAt - b.startsAt)
      .map((t) => tourView(db, t, user));
  },
});

define('tournaments.get', {
  auth: false,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    return tourView(db, getTour(db, p.id), user, true);
  },
});

define('tournaments.register', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ id: s.str({ max: 60 }), teamId: s.opt(s.str({ max: 60 })) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    registerTournament(db, user, getTour(db, p.id), p.teamId);
    return tourView(db, getTour(db, p.id), user, true);
  },
});

define('tournaments.unregister', {
  write: true, rate: 'financial',
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    unregisterTournament(db, user, getTour(db, p.id));
    return tourView(db, getTour(db, p.id), user, true);
  },
});

// DEMO: start now instead of waiting for the scheduled time.
define('tournaments.startNow', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const t = getTour(db, p.id);
    if (!db.config.demoMode && user.role !== 'admin') throw E.forbidden();
    if (user.role !== 'admin' && !t.entrants.some((e) => e.members.includes(user.id))) throw E.forbidden('Register first.');
    startTournament(db, t);
    return tourView(db, t, user, true);
  },
});

define('tournaments.playMatch', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const m = openTournamentMatch(db, user, getTour(db, p.id));
    return matchView(db, m, user);
  },
});

// ---- teams ------------------------------------------------------------------------------------

function teamView(db, t, me) {
  const members = t.members.map((m) => ({ ...lite(db, m.userId), role: m.role, joinedAt: m.joinedAt }));
  return {
    id: t.id, name: t.name, tag: t.tag, color: t.color, bio: t.bio, open: t.open, country: t.country,
    captainId: t.captainId, members, games: t.games.map((g) => gameMini(db.games.find((x) => x.id === g))).filter(Boolean),
    rating: t.rating, stats: { ...t.stats, winRate: t.stats.matches ? Math.round((t.stats.wins / t.stats.matches) * 100) : 0 },
    recent: t.recent, createdAt: t.createdAt,
    ranking: db.teams.filter((x) => x.rating > t.rating).length + 1,
    invites: me && t.captainId === me.id ? t.invites.map((i) => ({ ...i, user: lite(db, i.userId) })) : [],
    isMember: !!me && t.members.some((m) => m.userId === me.id),
    isCaptain: !!me && t.captainId === me.id,
    invited: !!me && t.invites.some((i) => i.userId === me.id),
  };
}

const getTeam = (db, id) => {
  const t = db.teams.find((x) => x.id === id);
  if (!t) throw E.notFound('Team');
  return t;
};
const captainOnly = (t, user) => {
  if (t.captainId !== user.id) throw E.forbidden('Only the captain can do that.');
};

define('teams.list', {
  schema: s.obj({ q: s.opt(s.str({ max: 40 })), gameId: s.opt(s.str({ max: 40 })), mine: s.opt(s.bool()) }),
  handler({ db, user }, p) {
    const q = (p.q || '').toLowerCase();
    return db.teams
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q))
      .filter((t) => !p.gameId || t.games.includes(p.gameId))
      .filter((t) => !p.mine || t.members.some((m) => m.userId === user.id))
      .sort((a, b) => b.rating - a.rating)
      .map((t) => teamView(db, t, user));
  },
});

define('teams.get', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    return teamView(db, getTeam(db, p.id), user);
  },
});

define('teams.create', {
  write: true,
  schema: s.obj({
    name: s.str({ min: 3, max: 24, pattern: "^[A-Za-z0-9 ._'-]+$", patternMessage: 'Team names use letters, numbers and spaces.' }),
    tag: s.str({ min: 2, max: 5, pattern: '^[A-Za-z0-9]+$', patternMessage: 'Tags are 2–5 letters or numbers.' }),
    color: s.str({ pattern: '^#[0-9A-Fa-f]{6}$' }),
    games: s.arr(s.str({ max: 40 }), { min: 1, max: 6 }),
    bio: s.opt(s.str({ max: 120 })),
    open: s.bool(),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    if (db.teams.some((t) => t.name.toLowerCase() === p.name.toLowerCase())) throw E.conflict('That team name is taken.');
    if (db.teams.some((t) => t.tag.toLowerCase() === p.tag.toLowerCase())) throw E.conflict('That tag is taken.');
    if (db.teams.filter((t) => t.captainId === user.id).length >= 3) throw E.state('You can captain up to 3 teams.');
    const t = createTeam({ ...p, tag: p.tag.toUpperCase(), captainId: user.id, country: user.country, rating: user.stackScore, members: [{ userId: user.id, role: 'captain', joinedAt: Date.now() }] });
    db.teams.push(t);
    return teamView(db, t, user);
  },
});

define('teams.update', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), bio: s.opt(s.str({ max: 120 })), color: s.opt(s.str({ pattern: '^#[0-9A-Fa-f]{6}$' })), open: s.opt(s.bool()), games: s.opt(s.arr(s.str({ max: 40 }), { min: 1, max: 6 })) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    captainOnly(t, user);
    for (const k of ['bio', 'color', 'open', 'games']) if (p[k] !== undefined) t[k] = p[k];
    return teamView(db, t, user);
  },
});

define('teams.invite', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), userId: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    captainOnly(t, user);
    const target = db.users.find((u) => u.id === p.userId && u.role === 'player');
    if (!target) throw E.notFound('Player');
    if (t.members.some((m) => m.userId === target.id)) throw E.conflict(`${target.username} is already on the team.`);
    if (t.invites.some((i) => i.userId === target.id)) throw E.conflict(`${target.username} already has an invite.`);
    if (t.members.length >= 8) throw E.state('Teams max out at 8 players.');
    t.invites.push({ userId: target.id, by: user.id, at: Date.now() });
    notify(db, target.id, { type: 'team', title: `${t.name} invited you`, body: `${user.username} wants you on the squad.`, link: `/app/teams/${t.id}` });
    return teamView(db, t, user);
  },
});

define('teams.respond', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), accept: s.bool() }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    const inv = t.invites.find((i) => i.userId === user.id);
    if (!inv) throw E.state('That invite expired.');
    t.invites = t.invites.filter((i) => i !== inv);
    if (p.accept) {
      if (t.members.length >= 8) throw E.state('That team is full now.');
      t.members.push({ userId: user.id, role: 'member', joinedAt: Date.now() });
      notify(db, t.captainId, { type: 'team', title: `${user.username} joined ${t.name}`, link: `/app/teams/${t.id}` });
    }
    return teamView(db, t, user);
  },
});

define('teams.join', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    if (t.members.some((m) => m.userId === user.id)) throw E.conflict("You're already on this team.");
    if (!t.open && !t.invites.some((i) => i.userId === user.id)) throw E.forbidden('This team is invite-only. Ask the captain for an invite.');
    if (t.members.length >= 8) throw E.state('This team is full.');
    t.invites = t.invites.filter((i) => i.userId !== user.id);
    t.members.push({ userId: user.id, role: 'member', joinedAt: Date.now() });
    notify(db, t.captainId, { type: 'team', title: `${user.username} joined ${t.name}`, link: `/app/teams/${t.id}` });
    return teamView(db, t, user);
  },
});

define('teams.leave', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    if (!t.members.some((m) => m.userId === user.id)) throw E.state("You're not on this team.");
    if (t.captainId === user.id && t.members.length > 1) throw E.state('Hand the captaincy to someone first.');
    t.members = t.members.filter((m) => m.userId !== user.id);
    if (!t.members.length) db.teams = db.teams.filter((x) => x !== t);
    return { ok: true };
  },
});

define('teams.setCaptain', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), userId: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    captainOnly(t, user);
    const m = t.members.find((x) => x.userId === p.userId);
    if (!m) throw E.notFound('Member');
    t.members.forEach((x) => (x.role = x.userId === p.userId ? 'captain' : 'member'));
    t.captainId = p.userId;
    notify(db, p.userId, { type: 'team', title: `You're captain of ${t.name}`, link: `/app/teams/${t.id}` });
    return teamView(db, t, user);
  },
});

define('teams.removeMember', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), userId: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const t = getTeam(db, p.id);
    captainOnly(t, user);
    if (p.userId === user.id) throw E.invalid('Leave the team instead.');
    t.members = t.members.filter((x) => x.userId !== p.userId);
    return teamView(db, t, user);
  },
});

// ---- social graph -----------------------------------------------------------------------------

const target = (db, id) => {
  const u = db.users.find((x) => x.id === id && x.role === 'player');
  if (!u) throw E.notFound('Player');
  return u;
};

define('social.follow', {
  write: true,
  schema: s.obj({ userId: s.str({ max: 60 }), follow: s.bool() }),
  handler({ db, user }, p) {
    const u = target(db, p.userId);
    if (u.id === user.id) throw E.invalid("You can't follow yourself.");
    user.following = user.following.filter((x) => x !== u.id);
    if (p.follow) user.following.push(u.id);
    return { following: p.follow };
  },
});

define('social.friendRequest', {
  write: true,
  schema: s.obj({ userId: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const u = target(db, p.userId);
    if (u.id === user.id) throw E.invalid("You can't add yourself.");
    if (user.friends.includes(u.id)) throw E.conflict("You're already friends.");
    if (user.friendRequests.includes(u.id)) {
      user.friendRequests = user.friendRequests.filter((x) => x !== u.id);
      user.friends.push(u.id);
      u.friends.push(user.id);
      notify(db, u.id, { type: 'friend', title: `${user.username} accepted your friend request`, link: `/app/u/${user.username}` });
      return { status: 'friends' };
    }
    if (!u.friendRequests.includes(user.id)) u.friendRequests.push(user.id);
    notify(db, u.id, { type: 'friend', title: `${user.username} sent a friend request`, link: `/app/u/${user.username}` });
    return { status: 'requested' };
  },
});

define('social.respondFriend', {
  write: true,
  schema: s.obj({ userId: s.str({ max: 60 }), accept: s.bool() }),
  handler({ db, user }, p) {
    const u = target(db, p.userId);
    if (!user.friendRequests.includes(u.id)) throw E.state('That request is gone.');
    user.friendRequests = user.friendRequests.filter((x) => x !== u.id);
    if (p.accept) {
      if (!user.friends.includes(u.id)) user.friends.push(u.id);
      if (!u.friends.includes(user.id)) u.friends.push(user.id);
    }
    return { status: p.accept ? 'friends' : 'declined' };
  },
});

define('social.unfriend', {
  write: true,
  schema: s.obj({ userId: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const u = target(db, p.userId);
    user.friends = user.friends.filter((x) => x !== u.id);
    u.friends = u.friends.filter((x) => x !== user.id);
    return { ok: true };
  },
});

define('social.friends', {
  handler({ db, user }) {
    return {
      friends: user.friends.map((id) => lite(db, id)),
      requests: user.friendRequests.map((id) => lite(db, id)),
      following: user.following.map((id) => lite(db, id)),
      suggested: db.users.filter((u) => u.role === 'player' && u.id !== user.id && !user.friends.includes(u.id) && u.games.some((g) => user.games.includes(g))).sort((a, b) => Math.abs(a.stackScore - user.stackScore) - Math.abs(b.stackScore - user.stackScore)).slice(0, 6).map((u) => lite(db, u.id)),
    };
  },
});

define('players.list', {
  schema: s.obj({ q: s.opt(s.str({ max: 40 })), gameId: s.opt(s.str({ max: 40 })) }),
  handler({ db, user }, p) {
    const q = (p.q || '').toLowerCase();
    return db.users
      .filter((u) => u.role === 'player' && u.id !== user.id)
      .filter((u) => !q || u.username.toLowerCase().includes(q))
      .filter((u) => !p.gameId || u.games.includes(p.gameId))
      .sort((a, b) => b.online - a.online || b.stackScore - a.stackScore)
      .slice(0, 30)
      .map((u) => pubUser(db, u));
  },
});
