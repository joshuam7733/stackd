// Arcade rules shared by the client (to render the game) and the server (to score it from raw telemetry).
// The server never trusts a score from the client — only the input events.

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Quick Draw (reaction) ----------------------------------------------------------------------
export const REACTION_ROUNDS = 5;
export const EARLY_PENALTY = 500;

export function reactionDelays(seed) {
  const r = prng(seed);
  return Array.from({ length: REACTION_ROUNDS }, () => Math.round(1200 + r() * 2300));
}

/** taps: [{ round, t }] with t = ms since the round began. Lower score is better (average ms). */
export function scoreReaction(seed, taps) {
  const delays = reactionDelays(seed);
  const flags = [];
  const times = delays.map((d, i) => {
    const tap = taps.find((x) => x.round === i);
    if (!tap) return 1500;
    const rt = tap.t - d;
    if (rt < 0) return EARLY_PENALTY;
    if (rt < 90) flags.push(`round ${i + 1}: ${rt} ms`);
    return Math.min(1500, rt);
  });
  const score = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  return { score, rounds: times, suspicious: flags.length >= 2 ? `Inhuman reaction times (${flags.join(', ')})` : null };
}

// ---- Flick (aim) --------------------------------------------------------------------------------
export const AIM_TARGETS = 20;
export const AIM_LIMIT_MS = 30000;
export const AIM_RADIUS = 0.06; // in normalized arena units

export function aimTarget(seed, i) {
  const r = prng(seed * 31 + i * 7919);
  return { x: 0.08 + r() * 0.84, y: 0.1 + r() * 0.8 };
}

/** hits: [{ i, t, x, y }]. Higher is better. */
export function scoreAim(seed, hits) {
  let valid = 0;
  let last = 0;
  let minGap = Infinity;
  for (const h of hits) {
    if (h.i !== valid || h.t < last || h.t > AIM_LIMIT_MS) continue;
    const tg = aimTarget(seed, h.i);
    if (Math.hypot(h.x - tg.x, h.y - tg.y) > AIM_RADIUS * 1.15) continue;
    minGap = Math.min(minGap, h.t - last);
    last = h.t;
    valid++;
    if (valid >= AIM_TARGETS) break;
  }
  const speedBonus = valid >= AIM_TARGETS ? Math.max(0, Math.round((AIM_LIMIT_MS - last) / 20)) : 0;
  return {
    score: valid * 100 + speedBonus,
    hits: valid,
    time: last,
    suspicious: valid > 5 && minGap < 110 ? `Target-to-target time of ${minGap} ms` : null,
  };
}

// ---- Dead Stop (timing) -------------------------------------------------------------------------
export const TIMING_ROUNDS = 5;

export function needlePeriod(round) {
  return Math.max(520, 1500 - round * 230);
}

export function needlePos(seed, round, t) {
  const r = prng(seed + round * 101);
  const phase = r();
  const p = needlePeriod(round);
  const x = ((t / p + phase) % 1 + 1) % 1;
  return x < 0.5 ? x * 2 : 2 - x * 2; // triangle wave 0..1..0
}

/** stops: [{ round, t }]. Higher is better (max 500). */
export function scoreTiming(seed, stops) {
  const rounds = Array.from({ length: TIMING_ROUNDS }, (_, i) => {
    const s = stops.find((x) => x.round === i);
    if (!s) return 0;
    const pos = needlePos(seed, i, s.t);
    return Math.max(0, Math.round(100 - Math.abs(pos - 0.5) * 400));
  });
  const fast = stops.filter((s) => s.t < 120).length;
  return { score: rounds.reduce((a, b) => a + b, 0), rounds, suspicious: fast >= 3 ? 'Stops faster than the needle can be seen' : null };
}

export function scoreRun(kind, seed, telemetry) {
  if (kind === 'reaction') return scoreReaction(seed, telemetry.taps || []);
  if (kind === 'aim') return scoreAim(seed, telemetry.hits || []);
  if (kind === 'timing') return scoreTiming(seed, telemetry.stops || []);
  return { score: 0 };
}
