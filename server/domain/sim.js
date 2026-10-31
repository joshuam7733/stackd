// Match simulation for DEMO MODE. Generates plausible stat lines from a player's skill so the whole
// journey can be played without launching a real game. Never used to decide real-money outcomes.
import { live, clamp } from './util.js';

export function skillOf(user, gameId) {
  const s = user.gameScores?.[gameId]?.score ?? user.stackScore ?? 1000;
  return clamp((s - 700) / 1300, 0.02, 0.98);
}

export function modeOf(game, modeId) {
  return game.modes.find((m) => m.id === modeId) || game.modes[0];
}

export function metricKeys(game, modeId) {
  return modeOf(game, modeId).metrics.map((m) => m.key);
}

function placeFor(field, skill, r) {
  const x = Math.pow(r.next(), 1 + skill * 2.2);
  return clamp(Math.ceil(x * field), 1, field);
}

/** Solo stat line for challenges and BR pools. */
export function simStats(game, modeId, skill, r = live) {
  const mode = modeOf(game, modeId);
  const keys = mode.metrics.map((m) => m.key);
  const s = {};
  const placementMetric = mode.metrics.find((m) => m.key === 'placement');
  if (placementMetric) s.placement = placeFor(placementMetric.max, skill, r);
  const placeFactor = s.placement ? 1 - (s.placement - 1) / placementMetric.max : 0.5;

  if (keys.includes('kills')) {
    const max = mode.metrics.find((m) => m.key === 'kills').max;
    const mean = (1 + skill * (max > 30 ? 12 : 8)) * (0.5 + placeFactor);
    s.kills = clamp(Math.round(r.gauss(mean, mean * 0.45)), 0, Math.round(max * 0.6));
  }
  if (keys.includes('headshots')) s.headshots = Math.round((s.kills || 0) * (0.15 + r.next() * 0.35));
  if (keys.includes('survival')) s.survival = clamp(Math.round(4 + placeFactor * 26 + r.gauss(0, 3)), 1, 34);
  if (keys.includes('damage')) s.damage = clamp(Math.round((s.kills || 1) * 230 + r.gauss(350, 200)), 50, 5500);
  if (keys.includes('deaths')) s.deaths = clamp(Math.round(r.gauss(8 - skill * 4, 2)), 0, 20);

  const won = r.chance(0.25 + skill * 0.45);
  if (keys.includes('won')) s.won = won ? 1 : 0;
  if (keys.includes('kda')) s.kda = Math.round(clamp(r.gauss(2 + skill * 5 + (won ? 1 : -0.5), 1.6), 0.2, 20) * 10) / 10;
  if (keys.includes('mvp')) s.mvp = won && r.chance(0.25 + skill * 0.4) ? 1 : 0;
  if (keys.includes('goals')) {
    s.goals = clamp(Math.round(r.gauss(1.5 + skill * 2.5, 1.2)), 0, 9);
    s.conceded = clamp(Math.round(r.gauss(2.6 - skill * 1.6, 1.1)), 0, 9);
    if (keys.includes('won')) s.won = s.goals > s.conceded ? 1 : 0;
  }
  if (keys.includes('crowns')) s.crowns = won ? (r.chance(0.3 + skill * 0.2) ? 3 : r.int(1, 2)) : r.int(0, 1);
  if (keys.includes('rounds')) {
    s.rounds = won ? 3 : r.int(0, 2);
    s.roundsLost = won ? r.int(0, 2) : 3;
  }
  if (keys.includes('balls')) s.balls = won ? r.int(3, 7) : r.int(1, 6);
  return s;
}

export function meets(stats, tpl) {
  const v = stats[tpl.metric];
  if (v == null) return false;
  if (tpl.op === 'gte') return v >= tpl.target;
  if (tpl.op === 'lte') return v <= tpl.target;
  return v === tpl.target;
}

/** Head-to-head truth: returns per-side stats consistent with one winner. */
export function simH2H(game, modeId, skillA, skillB, r = live) {
  const mode = modeOf(game, modeId);
  const keys = mode.metrics.map((m) => m.key);
  const pA = 1 / (1 + Math.pow(10, ((skillB - skillA) * 1300) / 400));
  const aWins = r.next() < pA;
  const a = {}, b = {};
  if (keys.includes('goals')) {
    const w = r.int(1, 5), l = r.int(0, w - 1);
    Object.assign(a, aWins ? { goals: w, conceded: l } : { goals: l, conceded: w });
    Object.assign(b, { goals: a.conceded, conceded: a.goals });
  }
  if (keys.includes('rounds')) {
    const l = r.int(0, 2);
    Object.assign(a, aWins ? { rounds: 3, roundsLost: l } : { rounds: l, roundsLost: 3 });
    Object.assign(b, { rounds: a.roundsLost, roundsLost: a.rounds });
  }
  if (keys.includes('placement')) {
    a.placement = aWins ? 1 : 2;
    b.placement = aWins ? 2 : 1;
  }
  if (keys.includes('kills')) {
    a.kills = r.int(aWins ? 8 : 3, aWins ? 20 : 12);
    b.kills = r.int(aWins ? 3 : 8, aWins ? 12 : 20);
  }
  if (keys.includes('deaths')) {
    a.deaths = b.kills;
    b.deaths = a.kills;
  }
  if (keys.includes('won')) {
    a.won = aWins ? 1 : 0;
    b.won = aWins ? 0 : 1;
  }
  if (keys.includes('crowns')) {
    a.crowns = aWins ? r.int(1, 3) : r.int(0, 1);
    b.crowns = aWins ? Math.min(a.crowns - 1, r.int(0, 1)) : Math.max(a.crowns + 1, r.int(1, 3));
    b.crowns = Math.max(0, Math.min(3, b.crowns));
  }
  if (keys.includes('balls')) {
    a.balls = aWins ? 7 : r.int(1, 6);
    b.balls = aWins ? r.int(1, 6) : 7;
  }
  return { winner: aWins ? 'a' : 'b', a, b, score: scoreLine(a, b) };
}

export function scoreLine(a, b) {
  if (a.goals != null) return `${a.goals}–${b.goals}`;
  if (a.rounds != null) return `${a.rounds}–${b.rounds}`;
  if (a.crowns != null) return `${a.crowns}–${b.crowns}`;
  if (a.kills != null) return `${a.kills}–${b.kills}`;
  return a.won ? 'W–L' : 'L–W';
}

/** Who won, from one side's stats. */
export function statsSayWin(stats) {
  if (stats.won != null) return stats.won === 1;
  if (stats.goals != null && stats.conceded != null) return stats.goals > stats.conceded;
  if (stats.rounds != null && stats.roundsLost != null) return stats.rounds > stats.roundsLost;
  if (stats.placement != null) return stats.placement === 1;
  if (stats.kills != null && stats.deaths != null) return stats.kills > stats.deaths;
  return false;
}

/**
 * Battle royale field. entrants: [{ entrantId, members: [userId], skill }]. fixed: { entrantId: place } for
 * entrants whose placement is already known (the reporting player). Returns standings with kills per member.
 */
export function simField(entrants, fixed = {}, killsFixed = {}, r = live) {
  const field = entrants.length;
  const taken = new Set(Object.values(fixed));
  const free = entrants
    .filter((e) => !(e.entrantId in fixed))
    .map((e) => ({ e, roll: e.skill * 1.4 + r.next() }))
    .sort((x, y) => y.roll - x.roll);
  const places = [];
  for (let p = 1; p <= field; p++) if (!taken.has(p)) places.push(p);
  const standings = [];
  free.forEach((f, i) => standings.push({ entrantId: f.e.entrantId, members: f.e.members, place: places[i] }));
  for (const [id, place] of Object.entries(fixed)) {
    const e = entrants.find((x) => x.entrantId === id);
    standings.push({ entrantId: id, members: e.members, place });
  }
  for (const s of standings) {
    s.kills = {};
    const pf = 1 - (s.place - 1) / field;
    for (const m of s.members) {
      s.kills[m] = killsFixed[m] ?? Math.max(0, Math.round(r.gauss(1 + pf * 6, 1.5)));
    }
  }
  return standings.sort((a, b) => a.place - b.place);
}
