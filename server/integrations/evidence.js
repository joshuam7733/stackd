// Evidence adapter: results come from the players themselves (stat report + screenshot / clip / VOD link)
// and are checked by the verification engine, with a referee for anything it can't confirm. This is how
// head-to-heads, bet-on-yourself challenges, tournament matches and missions are settled.
//
// In DEMO MODE there is no real screenshot to read, so the "evidence" a player attaches comes from the
// simulator (`demoPlay`) and every verdict is flagged `simulated: true`. In production the same contract
// is backed by OCR / VOD review / referees.
import { verifyReport } from '../domain/engines/verification.js';
import { simStats, simH2H, skillOf } from '../domain/sim.js';

export const evidence = {
  id: 'evidence',
  name: 'Player reports + evidence review',
  configured: true,
  automatic: false,

  authenticatePlayer(user, game) {
    const id = user.inGameIds?.[game.id] || null;
    return { linked: !!id, inGameId: id, method: 'profile' };
  },

  /** Demo stand-in for "what the evidence will show": generated once per match, never sent to clients. */
  createMatch(match, { game, mode, players, skills }) {
    match.integration = 'evidence';
    if (players.length === 2 && skills) {
      const sim = simH2H(game, mode.id, skills[0], skills[1]);
      match.truth = { [players[0]]: sim.a, [players[1]]: sim.b, winner: sim.winner === 'a' ? players[0] : players[1], score: sim.score };
    } else {
      match.truth = Object.fromEntries(players.map((p, i) => [p, simStats(game, mode.id, skills?.[i] ?? 0.5)]));
    }
    return match.truth;
  },

  getMatch(match) {
    return { phase: match.status, reports: Object.keys(match.reports || {}).length };
  },

  getResult(match) {
    return match.outcome || null;
  },

  verifyResult(match, { game, report, truth, demo }) {
    const v = verifyReport(game, match, report, truth);
    return demo ? { ...v, simulated: true } : v;
  },

  getPlayerStats(user, game) {
    return { source: 'stackd', gameId: game.id, skill: skillOf(user, game.id), ...(user.gameScores?.[game.id] || {}) };
  },
};
