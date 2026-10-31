import { define } from '../router.js';
import { s } from '../validate.js';
import { E } from '../errors.js';
import {
  createChallenge, createH2H, acceptH2H, joinPool, leaveCompetition, startPool, report, rematch, openDispute, gameOf,
} from '../services/competitions.js';
import { reportTournament } from '../services/tournaments.js';
import { findOpponents } from '../engines/matchmaking.js';
import { challengeMultiplier } from '../engines/prize.js';
import { compView, compDetail, matchView, lite, gameMini } from './views.js';
import { notify, audit } from '../notify.js';
import { uid } from '../util.js';

const getComp = (db, id) => {
  const c = db.competitions.find((x) => x.id === id);
  if (!c) throw E.notFound('Competition');
  return c;
};
const getMatch = (db, id) => {
  const m = db.matches.find((x) => x.id === id);
  if (!m) throw E.notFound('Match');
  return m;
};

define('competitions.list', {
  schema: s.obj({
    kind: s.opt(s.oneOf(['challenge', 'h2h', 'pool'])),
    gameId: s.opt(s.str({ max: 40 })),
    platform: s.opt(s.str({ max: 20 })),
    status: s.opt(s.oneOf(['open', 'live', 'settled', 'active'])),
    mine: s.opt(s.bool()),
    maxEntry: s.opt(s.int({ min: 0 })),
  }),
  handler({ db, user }, p) {
    let list = db.competitions.filter((c) => c.status !== 'draft' && (p.mine ? c.participants.some((x) => x.userId === user.id) : c.visibility === 'public' || c.h2h?.opponentId === user.id || c.createdBy === user.id));
    if (p.kind) list = list.filter((c) => c.kind === p.kind);
    if (p.gameId) list = list.filter((c) => c.gameId === p.gameId);
    if (p.platform) list = list.filter((c) => c.platform === p.platform);
    if (p.maxEntry != null) list = list.filter((c) => c.entry <= p.maxEntry);
    if (p.status === 'active') list = list.filter((c) => !['settled', 'cancelled'].includes(c.status));
    else if (p.status === 'live') list = list.filter((c) => ['starting', 'live'].includes(c.status));
    else if (p.status) list = list.filter((c) => c.status === p.status);
    return list.sort((a, b) => (p.mine ? b.createdAt - a.createdAt : a.startsAt - b.startsAt)).slice(0, 60).map((c) => compView(db, c, user));
  },
});

define('competitions.get', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const c = getComp(db, p.id);
    const isParticipant = c.participants.some((x) => x.userId === user.id);
    if ((c.kind === 'challenge' || c.status === 'draft') && !isParticipant && user.role !== 'admin') throw E.notFound('Competition');
    return compDetail(db, c, user);
  },
});

define('challenges.templates', {
  schema: s.obj({ gameId: s.opt(s.str({ max: 40 })) }),
  handler({ db, user }, p) {
    return db.challengeTemplates
      .filter((t) => !p.gameId || t.gameId === p.gameId)
      .filter((t) => db.games.find((g) => g.id === t.gameId)?.status === 'active')
      .map((t) => {
        const g = db.games.find((x) => x.id === t.gameId);
        return { ...t, game: gameMini(g), mode: g.modes.find((m) => m.id === t.modeId)?.name, multiplier: challengeMultiplier(t, user.gameScores[t.gameId]?.score ?? user.stackScore, db.config.challengeMargin) };
      });
  },
});

define('challenges.create', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ templateId: s.str({ max: 80 }), entry: s.int({ min: 0, max: 1_000_000_000_000 }), platform: s.oneOf(['mobile', 'pc', 'playstation', 'xbox']) }),
  audit: (p, out) => out?.competitionId,
  handler({ db, user }, p) {
    return createChallenge(db, user, p);
  },
});

define('h2h.create', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({
    gameId: s.str({ max: 40 }), modeId: s.str({ max: 40 }), platform: s.oneOf(['mobile', 'pc', 'playstation', 'xbox']),
    entry: s.int({ min: 0, max: 1_000_000_000_000 }), type: s.oneOf(['open', 'direct', 'friend', 'private', 'skill']),
    opponentId: s.opt(s.str({ max: 60 })), bestOf: s.opt(s.oneOf([1, 3, 5])), note: s.opt(s.str({ max: 80 })),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    return compView(db, createH2H(db, user, p), user);
  },
});

define('matchmaking.preview', {
  schema: s.obj({ gameId: s.str({ max: 40 }), platform: s.opt(s.str({ max: 20 })) }),
  handler({ db, user }, p) {
    return findOpponents(db.users, user, p, db.config.matchmaking).slice(0, 6).map((c) => ({ user: lite(db, c.user.id), score: c.score, gap: c.gap, ping: c.ping, quality: c.quality }));
  },
});

define('competitions.join', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ id: s.str({ max: 60 }), teamId: s.opt(s.str({ max: 60 })), code: s.opt(s.str({ max: 12 })) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const c = getComp(db, p.id);
    if (c.status !== 'open') throw E.state(c.status === 'full' ? 'This lobby is full.' : 'This competition is no longer taking entries.');
    if (c.visibility === 'private' && c.code && p.code?.toUpperCase() !== c.code && c.h2h?.opponentId !== user.id) throw E.forbidden('This one is private. Enter the invite code to join.');
    if (c.kind === 'h2h') {
      const m = acceptH2H(db, user, c);
      return { competitionId: c.id, matchId: m.id };
    }
    if (c.kind === 'pool') {
      joinPool(db, user, c, p.teamId);
      return { competitionId: c.id };
    }
    throw E.state("Challenges can't be joined by other players.");
  },
});

define('h2h.decline', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const c = getComp(db, p.id);
    if (c.kind !== 'h2h' || c.h2h.opponentId !== user.id || c.status !== 'open') throw E.state('Nothing to decline.');
    c.h2h.opponentId = null;
    c.h2h.type = 'open';
    c.h2h.declinedBy = user.id;
    notify(db, c.h2h.challengerId, { type: 'challenge', title: `${user.username} passed on your challenge`, body: "It's now open to anyone.", link: `/app/compete/${c.id}` });
    return compView(db, c, user);
  },
});

define('competitions.leave', {
  write: true, rate: 'financial',
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    leaveCompetition(db, user, getComp(db, p.id));
    return { ok: true };
  },
});

// DEMO: skip the wait — fill the lobby with bots and lock it now.
define('competitions.startNow', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const c = getComp(db, p.id);
    if (!db.config.demoMode && user.role !== 'admin') throw E.forbidden();
    if (c.kind !== 'pool') throw E.state('Only pools can be started early.');
    if (!c.participants.some((x) => x.userId === user.id) && user.role !== 'admin') throw E.forbidden('Join first.');
    const m = startPool(db, c, { fillTo: c.maxPlayers });
    return { matchId: m.id };
  },
});

define('competitions.rematch', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const c = getComp(db, p.id);
    if (!c.participants.some((x) => x.userId === user.id)) throw E.forbidden();
    return rematch(db, user, c);
  },
});

define('matches.get', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const m = getMatch(db, p.id);
    if (!m.players.includes(user.id) && !['admin', 'referee'].includes(user.role)) {
      const comp = db.competitions.find((c) => c.id === m.refId);
      if (!comp || comp.visibility !== 'public') throw E.notFound('Match');
    }
    return matchView(db, m, user);
  },
});

define('matches.mine', {
  schema: s.obj({ status: s.opt(s.oneOf(['active', 'settled'])) }),
  handler({ db, user }, p) {
    return db.matches
      .filter((m) => m.players.includes(user.id))
      .filter((m) => !p.status || (p.status === 'settled' ? ['settled', 'cancelled'].includes(m.status) : !['settled', 'cancelled'].includes(m.status)))
      .sort((a, b) => (b.settledAt || b.createdAt) - (a.settledAt || a.createdAt))
      .slice(0, 30)
      .map((m) => matchView(db, m, user));
  },
});

define('matches.start', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const m = getMatch(db, p.id);
    if (!m.players.includes(user.id)) throw E.forbidden();
    if (m.status === 'ready') {
      m.status = 'live';
      m.startedAt = Date.now();
      m.timeline.push({ at: Date.now(), text: `${user.username} started the match` });
    }
    return matchView(db, m, user);
  },
});

// DEMO: play the match out in the simulator and reveal what the evidence will show.
define('matches.simulate', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const m = getMatch(db, p.id);
    if (!db.config.demoMode) throw E.forbidden();
    if (!m.players.includes(user.id)) throw E.forbidden();
    if (!m.truth?.[user.id]) throw E.state('Nothing to simulate for this match.');
    if (m.status === 'ready') {
      m.status = 'live';
      m.startedAt = Date.now();
    }
    m.revealed = { ...(m.revealed || {}), [user.id]: true };
    m.timeline.push({ at: Date.now(), text: 'Match played (simulated)' });
    const game = gameOf(db, m.gameId);
    return {
      stats: m.truth[user.id],
      evidence: { type: 'screenshot', name: `${game.slug}-results-${Date.now().toString(36)}.png`, demo: true, size: 1_240_000 },
    };
  },
});

define('matches.report', {
  write: true, rate: 'financial', idempotent: true,
  schema: s.obj({
    id: s.str({ max: 60 }),
    stats: s.record(),
    evidence: s.arr(s.obj({ type: s.oneOf(['screenshot', 'video', 'link']), name: s.str({ max: 200 }), demo: s.opt(s.bool()), size: s.opt(s.int({ min: 0 })) }), { max: 5 }),
  }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const m = getMatch(db, p.id);
    if (!m.players.includes(user.id)) throw E.forbidden("You're not in this match.");
    if (m.reports[user.id]) throw E.conflict('You already reported this match.');
    const evidence = p.evidence.map((e) => (e.type === 'link' ? { ...e, type: 'video' } : e));
    if (m.kind === 'tournament') {
      if (!['live', 'ready'].includes(m.status)) throw E.state('Results are closed for this match.');
      const game = gameOf(db, m.gameId);
      const allowed = game.modes.find((x) => x.id === m.modeId).metrics.map((x) => x.key);
      const clean = Object.fromEntries(Object.entries(p.stats).filter(([k, v]) => allowed.includes(k) && v !== '').map(([k, v]) => [k, Number(v)]));
      const out = reportTournament(db, user, m, clean, evidence);
      return { ...out, match: matchView(db, m, user) };
    }
    const out = report(db, user, m, p.stats, evidence);
    return { ...out, match: matchView(db, m, user) };
  },
});

define('disputes.create', {
  write: true,
  schema: s.obj({
    matchId: s.str({ max: 60 }), reason: s.oneOf(['wrong_result', 'cheating', 'disconnect', 'no_show', 'other']),
    details: s.str({ min: 10, max: 600 }), evidence: s.arr(s.obj({ type: s.oneOf(['screenshot', 'video', 'link']), name: s.str({ max: 200 }) }), { max: 5 }),
  }),
  audit: (p, out) => out?.id,
  handler({ db, user }, p) {
    const m = getMatch(db, p.matchId);
    if (!m.players.includes(user.id)) throw E.forbidden();
    if (m.status === 'settled' && Date.now() - m.settledAt > 24 * 3600_000) throw E.state('Disputes must be raised within 24 hours of the result.');
    const comp = db.competitions.find((c) => c.id === m.refId);
    const wasSettled = m.status === 'settled';
    const d = openDispute(db, m, comp, user.id, p);
    if (wasSettled) {
      // Post-settlement disputes freeze nothing retroactively; a referee can reverse via ledger entries.
      m.status = 'settled';
      if (comp) comp.status = 'settled';
      d.postSettlement = true;
    }
    return { id: d.id };
  },
});

define('disputes.mine', {
  handler({ db, user }) {
    return db.disputes
      .filter((d) => d.raisedBy === user.id || d.against === user.id || db.matches.find((m) => m.id === d.matchId)?.players.includes(user.id))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({ ...d, match: db.matches.find((m) => m.id === d.matchId) ? matchView(db, db.matches.find((m) => m.id === d.matchId), user) : null }));
  },
});

define('disputes.get', {
  schema: s.obj({ id: s.str({ max: 60 }) }),
  handler({ db, user }, p) {
    const d = db.disputes.find((x) => x.id === p.id);
    if (!d) throw E.notFound('Dispute');
    const m = db.matches.find((x) => x.id === d.matchId);
    if (!['admin', 'referee'].includes(user.role) && !m?.players.includes(user.id)) throw E.notFound('Dispute');
    return { ...d, raisedByUser: lite(db, d.raisedBy), againstUser: d.against ? lite(db, d.against) : null, match: m ? matchView(db, m, user) : null };
  },
});

define('disputes.appeal', {
  write: true,
  schema: s.obj({ id: s.str({ max: 60 }), reason: s.str({ min: 10, max: 600 }) }),
  audit: (p) => p.id,
  handler({ db, user }, p) {
    const d = db.disputes.find((x) => x.id === p.id);
    if (!d) throw E.notFound('Dispute');
    if (!['resolved', 'rejected'].includes(d.status)) throw E.state('You can appeal once a decision is made.');
    if (d.appeal) throw E.conflict('You already appealed this decision.');
    const m = db.matches.find((x) => x.id === d.matchId);
    if (!m?.players.includes(user.id)) throw E.forbidden();
    d.appeal = { by: user.id, reason: p.reason, at: Date.now(), status: 'pending' };
    d.status = 'appealed';
    d.history.push({ at: Date.now(), text: 'Appeal filed. A senior referee will take a second look.' });
    return { ok: true };
  },
});

define('reports.create', {
  write: true,
  schema: s.obj({ userId: s.str({ max: 60 }), reason: s.oneOf(['cheating', 'smurfing', 'collusion', 'abuse', 'other']), details: s.str({ min: 10, max: 600 }), matchId: s.opt(s.str({ max: 60 })) }),
  audit: (p) => p.userId,
  handler({ db, user }, p) {
    if (p.userId === user.id) throw E.invalid("You can't report yourself.");
    if (!db.users.some((u) => u.id === p.userId)) throw E.notFound('Player');
    db.reports.push({ id: uid('rpt'), by: user.id, ...p, status: 'open', at: Date.now() });
    return { ok: true };
  },
});
