// Matchmaking. Candidates are filtered on hard constraints (game, mode, platform, availability, status)
// and ranked on soft ones (rating gap, ping by region, recency of play together to deter collusion).
import { countryOf } from '../models.js';

// Rough round-trip estimates between regions, in ms.
const PING = {
  east_africa: { east_africa: 38, west_africa: 140, southern_africa: 90, europe: 150, north_america: 230 },
  west_africa: { east_africa: 140, west_africa: 40, southern_africa: 150, europe: 110, north_america: 180 },
  southern_africa: { east_africa: 90, west_africa: 150, southern_africa: 30, europe: 170, north_america: 240 },
  europe: { east_africa: 150, west_africa: 110, southern_africa: 170, europe: 25, north_america: 90 },
  north_america: { east_africa: 230, west_africa: 180, southern_africa: 240, europe: 90, north_america: 30 },
};

export const DEFAULT_WEIGHTS = { rating: 1, ping: 0.6, availability: 1, maxRatingGap: 350, maxPing: 160 };

export function estimatePing(a, b) {
  const ra = countryOf(a.country).region;
  const rb = countryOf(b.country).region;
  return PING[ra]?.[rb] ?? 200;
}

export function findOpponents(users, me, q, weights = DEFAULT_WEIGHTS, recentOpponents = []) {
  const myScore = me.gameScores?.[q.gameId]?.score ?? me.stackScore;
  return users
    .filter((u) => u.id !== me.id && u.role === 'player' && u.status === 'active')
    .filter((u) => !q.gameId || u.games.includes(q.gameId))
    .filter((u) => !q.platform || u.platforms.includes(q.platform))
    .map((u) => {
      const score = u.gameScores?.[q.gameId]?.score ?? u.stackScore;
      const gap = Math.abs(score - myScore);
      const ping = estimatePing(me, u);
      const repeat = recentOpponents.filter((id) => id === u.id).length;
      let quality = 100;
      quality -= (gap / weights.maxRatingGap) * 45 * weights.rating;
      quality -= Math.max(0, ping - 40) / (weights.maxPing - 40) * 30 * weights.ping;
      quality -= u.online ? 0 : 15 * weights.availability;
      quality -= repeat * 8;
      return { user: u, score, gap, ping, quality: Math.round(Math.max(0, Math.min(100, quality))) };
    })
    .filter((c) => c.gap <= weights.maxRatingGap * 1.5)
    .sort((a, b) => b.quality - a.quality);
}
