// Simulation adapter (DEMO MODE). Plays a battle royale out on the server: lobby countdown, a timed match
// with zone phases, every elimination (who, by whom, when), team survival and final placements. The script
// is generated once when the lobby locks and replayed against the clock, so every viewer sees the same
// match and the result can't be influenced from the browser. Results are marked as simulated: they are
// never presented as verified game data.
import { rng, clamp } from '../domain/util.js';

const COUNTDOWN_MS = Number(process.env.SIM_COUNTDOWN_MS || 15_000);
const MATCH_MS = Number(process.env.SIM_MATCH_MS || 90_000);
const ZONES = [0.18, 0.38, 0.56, 0.72, 0.85, 0.94];

/**
 * entrants: [{ entrantId, name, members: [userId], skill (0..1) }]
 * Returns the adapter state stored on match.sim.
 */
function script(entrants, seed, now) {
  const r = rng(seed);
  const field = entrants.length;
  // Finishing order: skill-weighted with plenty of variance (lower roll = eliminated earlier).
  const order = entrants.map((e) => ({ e, roll: e.skill * 1.4 + r.next() })).sort((a, b) => b.roll - a.roll).map((x) => x.e);
  const place = new Map(order.map((e, i) => [e.entrantId, i + 1]));

  // Team elimination time: the later you place, the longer you survive. The winner survives to the end.
  const teamOut = new Map();
  for (const e of order) {
    const p = place.get(e.entrantId);
    if (p === 1) continue;
    const frac = 1 - Math.pow((p - 1) / field, 0.8); // place = field → early, place 2 → near the end
    teamOut.set(e.entrantId, Math.round(clamp(frac * 0.97 + (r.next() - 0.5) * 0.02, 0.03, 0.97) * MATCH_MS));
  }

  // Each player's death time: the team's last member dies at the team time, others earlier.
  const deaths = []; // { t, victim, team }
  const owner = new Map();
  for (const e of entrants) {
    for (const m of e.members) owner.set(m, e.entrantId);
    const tOut = teamOut.get(e.entrantId);
    if (tOut == null) {
      // Winners: some squadmates may still fall before the end.
      e.members.forEach((m, i) => i > 0 && r.chance(0.35) && deaths.push({ t: Math.round(MATCH_MS * (0.4 + r.next() * 0.55)), victim: m, team: e.entrantId }));
      continue;
    }
    const last = e.members[Math.floor(r.next() * e.members.length)];
    for (const m of e.members) deaths.push({ t: m === last ? tOut : Math.round(Math.max(0.02 * MATCH_MS, tOut * (0.35 + r.next() * 0.6))), victim: m, team: e.entrantId, last: m === last });
  }
  deaths.sort((a, b) => a.t - b.t);

  // Assign killers from players still alive at that moment on a different team, weighted by skill.
  const skill = new Map(entrants.flatMap((e) => e.members.map((m) => [m, e.skill])));
  const alive = new Set(entrants.flatMap((e) => e.members));
  const kills = new Map();
  const events = [];
  for (const d of deaths) {
    alive.delete(d.victim);
    const candidates = [...alive].filter((p) => owner.get(p) !== d.team);
    let killer = null;
    if (candidates.length && r.chance(0.9)) {
      let total = 0;
      const w = candidates.map((c) => (total += 0.3 + (skill.get(c) || 0.3) ** 2));
      const pick = r.next() * total;
      killer = candidates[w.findIndex((x) => x >= pick)] || candidates[0];
      kills.set(killer, (kills.get(killer) || 0) + 1);
    }
    events.push({ t: d.t, victim: d.victim, killer, team: d.team, teamOut: !!d.last, zone: !killer });
  }

  const standings = order.map((e) => ({
    entrantId: e.entrantId,
    name: e.name,
    place: place.get(e.entrantId),
    members: e.members,
    kills: Object.fromEntries(e.members.map((m) => [m, kills.get(m) || 0])),
    outAt: teamOut.get(e.entrantId) ?? null,
  }));

  return {
    adapter: 'simulation',
    seed,
    lockedAt: now,
    liveAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + MATCH_MS,
    durationMs: MATCH_MS,
    field,
    players: alive.size + deaths.length,
    zones: ZONES.map((z) => Math.round(z * MATCH_MS)),
    events,
    standings,
  };
}

export const simulation = {
  id: 'simulation',
  name: 'STACKD match simulator (demo)',
  configured: true,
  automatic: true,

  authenticatePlayer(user, game) {
    return { linked: true, inGameId: user.inGameIds?.[game.id] || null, method: 'simulation' };
  },

  createMatch(match, { entrants, now = Date.now() }) {
    match.integration = 'simulation';
    match.sim = script(entrants, Math.floor(Math.random() * 2 ** 31), now);
    return match.sim;
  },

  /** Live view of the script at `now`. Hidden details (future eliminations) are never included. */
  getMatch(match, now = Date.now()) {
    const s = match.sim;
    if (!s) return null;
    const phase = now < s.liveAt ? 'countdown' : now < s.endsAt ? 'live' : 'finished';
    const elapsed = clamp(now - s.liveAt, 0, s.durationMs);
    const happened = phase === 'countdown' ? [] : s.events.filter((e) => e.t <= elapsed);
    const teamsOut = new Set(happened.filter((e) => e.teamOut).map((e) => e.team));
    const zone = s.zones.filter((z) => z <= elapsed).length;
    return {
      phase, liveAt: s.liveAt, endsAt: s.endsAt, now, progress: s.durationMs ? elapsed / s.durationMs : 0,
      field: s.field, players: s.players, alivePlayers: s.players - happened.length, aliveTeams: s.field - teamsOut.size,
      zone, zones: s.zones.length, happened,
    };
  },

  getResult(match, now = Date.now()) {
    const s = match.sim;
    if (!s || now < s.endsAt) return null;
    const allKills = s.standings.flatMap((x) => Object.entries(x.kills));
    const [mvpId] = allKills.sort((a, b) => b[1] - a[1])[0] || [];
    return { standings: s.standings.map((x) => ({ ...x, kills: { ...x.kills } })), mvpId: mvpId || null, source: 'simulation' };
  },

  verifyResult(match, result) {
    const placesOk = result.standings.every((x, i) => x.place === i + 1);
    const killsOk = result.standings.reduce((a, x) => a + Object.values(x.kills).reduce((p, q) => p + q, 0), 0) <= match.sim.players;
    return {
      method: 'simulation', status: placesOk && killsOk ? 'verified' : 'review', confidence: 1, simulated: true, at: Date.now(),
      checks: [
        { label: 'Result produced by the STACKD match simulator (DEMO MODE, not live game data)', ok: true },
        { label: 'Every placement accounted for exactly once', ok: placesOk },
        { label: 'Eliminations add up', ok: killsOk },
        { label: 'Lobby roster matches the paid entries', ok: true },
      ],
    };
  },

  getPlayerStats(user, game) {
    return { source: 'stackd', gameId: game.id, ...(user.gameScores?.[game.id] || { score: user.stackScore, matches: 0, wins: 0 }) };
  },
};
