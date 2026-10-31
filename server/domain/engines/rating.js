// STACK Score. Elo-family rating with difficulty, opponent strength, placement and streak inputs.
// The formula stays server-side; clients only ever see the score, rank and deltas.

export const DEFAULT_RANKS = [
  { id: 'bronze', name: 'Bronze', min: 0 },
  { id: 'silver', name: 'Silver', min: 1000 },
  { id: 'gold', name: 'Gold', min: 1150 },
  { id: 'platinum', name: 'Platinum', min: 1300 },
  { id: 'diamond', name: 'Diamond', min: 1450 },
  { id: 'elite', name: 'Elite', min: 1600 },
  { id: 'master', name: 'Master', min: 1800 },
];

export function rankFor(score, ranks = DEFAULT_RANKS) {
  const sorted = [...ranks].sort((a, b) => a.min - b.min);
  let cur = sorted[0];
  for (const r of sorted) if (score >= r.min) cur = r;
  const idx = sorted.indexOf(cur);
  const next = sorted[idx + 1] || null;
  const progress = next ? (score - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, tier: idx, next, progress: Math.max(0, Math.min(1, progress)) };
}

const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

function kFactor(user) {
  const n = user.stats?.matches || 0;
  if (n < 10) return 40; // provisional
  if (n < 50) return 28;
  return 20;
}

/** Head-to-head: returns deltas for both sides. */
export function h2hDelta(a, b, aWon, weight = 1) {
  const ea = expected(a.stackScore, b.stackScore);
  const da = Math.round(kFactor(a) * weight * ((aWon ? 1 : 0) - ea));
  const db = Math.round(kFactor(b) * weight * ((aWon ? 0 : 1) - (1 - ea)));
  return [da, db];
}

/** Placement events (battle royale, pools): compare actual percentile with expected percentile. */
export function placementDelta(user, place, field, avgOpp) {
  const actual = 1 - (place - 1) / Math.max(1, field - 1);
  const exp = expected(user.stackScore, avgOpp);
  return Math.round(kFactor(user) * 0.8 * (actual - exp));
}

/** Solo challenge: harder targets move the score more. Losing a hard challenge costs less. */
export function challengeDelta(user, won, multiplier) {
  const difficulty = Math.min(3, Math.max(1, multiplier / 2));
  return won ? Math.round(6 * difficulty) : -Math.round(8 / difficulty);
}

export function streakBonus(streak) {
  return streak >= 3 ? Math.min(10, streak) : 0;
}

/**
 * Consistency: players who keep winning across their last ten verified results earn a small extra on a
 * win; a long cold run trims a loss slightly less (it is already priced in by the Elo expectation).
 */
export function consistencyBonus(user, won) {
  const form = user.form || [];
  if (form.length < 5) return 0;
  const w = form.filter((x) => x === 'W').length / form.length;
  if (won) return w >= 0.7 ? 3 : w >= 0.5 ? 1 : 0;
  return w <= 0.2 ? 1 : 0;
}

/** Player level from verified activity (not money): matches, wins and titles earn XP. */
export function levelFor(user) {
  const s = user.stats || {};
  const xp = (s.matches || 0) * 10 + (s.wins || 0) * 20 + (s.tournamentWins || 0) * 200 + (s.top10 || 0) * 15;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Apply a delta to a user and their per-game score. Mutates. Pass `log` ({ db, matchId, reason }) to
 * append a score_events row so every rating change is explainable later.
 */
export function applyScore(user, gameId, delta, won, log) {
  user.stackScore = Math.max(0, user.stackScore + delta);
  user.peakScore = Math.max(user.peakScore || 0, user.stackScore);
  const g = (user.gameScores[gameId] ||= { score: 1000, matches: 0, wins: 0 });
  g.score = Math.max(0, g.score + delta);
  g.matches += 1;
  if (won) g.wins += 1;
  if (log?.db && !user.isBot) {
    (log.db.scoreEvents ||= []).push({
      id: `se_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      userId: user.id, matchId: log.matchId || null, gameId, delta, scoreAfter: user.stackScore, reason: log.reason || null, at: Date.now(),
    });
  }
}

/** Update streak/form/W-L. Mutates and returns the streak bonus applied. */
export function recordResult(user, won) {
  user.stats.matches += 1;
  if (won) {
    user.stats.wins += 1;
    user.stats.streak += 1;
    user.stats.bestStreak = Math.max(user.stats.bestStreak, user.stats.streak);
  } else {
    user.stats.losses += 1;
    user.stats.streak = 0;
  }
  user.form = [won ? 'W' : 'L', ...(user.form || [])].slice(0, 10);
  return won ? streakBonus(user.stats.streak) : 0;
}
