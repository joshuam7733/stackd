// Tournament structures as a match graph. Each slot is either a seeded entrant or a reference to the
// winner/loser of an earlier match, so single and double elimination share one resolver.
// Round robin / league / ladder / swiss use a standings table; battle royale uses points per game.

export const FORMATS = {
  single_elim: 'Single elimination',
  double_elim: 'Double elimination',
  round_robin: 'Round robin',
  swiss: 'Swiss',
  league: 'League',
  ladder: 'Ladder',
  battle_royale: 'Battle royale (points)',
};

const BR_POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

function seedOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

let mid = 0;
const mk = (round, label, side, a, b) => ({ id: `bm${++mid}_${round}`, round, label, side, a, b, winner: null, loser: null, score: null, matchId: null });

export function build(format, entrants) {
  mid = 0;
  const ids = entrants.map((e) => e.id);
  if (format === 'single_elim') return singleElim(ids);
  if (format === 'double_elim') return doubleElim(ids);
  if (format === 'battle_royale') return battleRoyale(ids);
  if (format === 'swiss') return swiss(ids);
  return roundRobin(ids, format);
}

function pow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function firstRound(ids, side, prefix) {
  const size = pow2(ids.length);
  const order = seedOrder(size);
  const matches = [];
  for (let i = 0; i < size; i += 2) {
    const a = ids[order[i] - 1] ?? null;
    const b = ids[order[i + 1] - 1] ?? null;
    matches.push(mk(1, `${prefix}1`, side, { entrantId: a }, { entrantId: b }));
  }
  return matches;
}

function singleElim(ids) {
  const matches = [];
  let round = firstRound(ids, 'W', 'R');
  matches.push(...round);
  let r = 1;
  while (round.length > 1) {
    r++;
    const next = [];
    for (let i = 0; i < round.length; i += 2)
      next.push(mk(r, `R${r}`, 'W', { from: { match: round[i].id, take: 'winner' } }, { from: { match: round[i + 1].id, take: 'winner' } }));
    matches.push(...next);
    round = next;
  }
  const total = r;
  matches.forEach((m) => (m.label = roundName(m.round, total)));
  const b = { format: 'single_elim', matches, finalId: round[0].id };
  autoByes(b);
  return b;
}

function doubleElim(ids) {
  const matches = [];
  const wb = [firstRound(ids, 'W', 'WB')];
  matches.push(...wb[0]);
  let r = 1;
  while (wb[wb.length - 1].length > 1) {
    r++;
    const prev = wb[wb.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2)
      next.push(mk(r, `Winners R${r}`, 'W', { from: { match: prev[i].id, take: 'winner' } }, { from: { match: prev[i + 1].id, take: 'winner' } }));
    wb.push(next);
    matches.push(...next);
  }
  wb.forEach((round, i) => round.forEach((m) => (m.label = i === wb.length - 1 ? 'Winners final' : `Winners R${i + 1}`)));

  // Losers bracket: LB1 pairs WB1 losers; then alternate major (drop-ins from WB) and minor rounds.
  let lr = 1;
  let lb = [];
  for (let i = 0; i < wb[0].length; i += 2)
    lb.push(mk(100 + lr, `Losers R${lr}`, 'L', { from: { match: wb[0][i].id, take: 'loser' } }, { from: { match: wb[0][i + 1].id, take: 'loser' } }));
  matches.push(...lb);
  for (let j = 1; j < wb.length; j++) {
    lr++;
    const drop = wb[j];
    const major = lb.map((m, i) => mk(100 + lr, `Losers R${lr}`, 'L', { from: { match: m.id, take: 'winner' } }, { from: { match: drop[drop.length - 1 - i].id, take: 'loser' } }));
    matches.push(...major);
    lb = major;
    if (j < wb.length - 1) {
      lr++;
      const minor = [];
      for (let i = 0; i < lb.length; i += 2)
        minor.push(mk(100 + lr, `Losers R${lr}`, 'L', { from: { match: lb[i].id, take: 'winner' } }, { from: { match: lb[i + 1].id, take: 'winner' } }));
      matches.push(...minor);
      lb = minor;
    }
  }
  lb[0].label = 'Losers final';
  const gf = mk(200, 'Grand final', 'GF', { from: { match: wb[wb.length - 1][0].id, take: 'winner' } }, { from: { match: lb[0].id, take: 'winner' } });
  matches.push(gf);
  const b = { format: 'double_elim', matches, finalId: gf.id };
  autoByes(b);
  return b;
}

function roundName(r, total) {
  const left = total - r;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinals';
  if (left === 2) return 'Quarterfinals';
  return `Round ${r}`;
}

function roundRobin(ids, format) {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const matches = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) matches.push(mk(r + 1, `Round ${r + 1}`, 'RR', { entrantId: a }, { entrantId: b }));
    }
    list.splice(1, 0, list.pop());
  }
  return { format, matches, table: true };
}

function swiss(ids) {
  const rounds = Math.max(3, Math.ceil(Math.log2(ids.length)));
  const shuffled = [...ids];
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2)
    if (shuffled[i + 1]) matches.push(mk(1, 'Round 1', 'SW', { entrantId: shuffled[i] }, { entrantId: shuffled[i + 1] }));
  return { format: 'swiss', matches, table: true, rounds, currentRound: 1, entrants: ids };
}

function battleRoyale(ids) {
  const games = 3;
  const matches = [];
  for (let g = 1; g <= games; g++) matches.push({ id: `bm_br${g}`, round: g, label: `Game ${g}`, side: 'BR', entrants: ids, placements: null, matchId: null, winner: null });
  return { format: 'battle_royale', matches, table: true, points: BR_POINTS };
}

// ---- resolution ----------------------------------------------------------------

export function slotEntrant(bracket, slot) {
  if (!slot) return null;
  if ('entrantId' in slot) return slot.entrantId;
  const src = bracket.matches.find((m) => m.id === slot.from.match);
  return src ? src[slot.from.take] : null;
}

export function participants(bracket, m) {
  if (m.side === 'BR') return m.entrants;
  return [slotEntrant(bracket, m.a), slotEntrant(bracket, m.b)];
}

function slotSettled(bracket, slot) {
  if ('entrantId' in slot) return true;
  const src = bracket.matches.find((m) => m.id === slot.from.match);
  return !!src && (!!src.winner || !!src.void);
}

export function isReady(bracket, m) {
  if (m.winner || m.void) return false;
  if (m.side === 'BR') {
    const prev = bracket.matches.find((x) => x.side === 'BR' && x.round === m.round - 1);
    return !prev || !!prev.placements;
  }
  if (!slotSettled(bracket, m.a) || !slotSettled(bracket, m.b)) return false;
  const [a, b] = participants(bracket, m);
  return !!a && !!b;
}

/** Advance matches where one side is a bye (null entrant). */
function autoByes(bracket) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of bracket.matches) {
      if (m.winner || m.side === 'BR') continue;
      if (!slotSettled(bracket, m.a) || !slotSettled(bracket, m.b)) continue;
      const [a, b] = participants(bracket, m);
      if ((a && !b) || (!a && b)) {
        m.winner = a || b;
        m.loser = null;
        m.score = 'bye';
        changed = true;
      } else if (!a && !b && !m.void) {
        m.score = 'void';
        m.void = true;
        changed = true;
      }
    }
  }
}

export function resolveMatch(bracket, bmId, winnerId, score) {
  const m = bracket.matches.find((x) => x.id === bmId);
  if (!m) return;
  const [a, b] = participants(bracket, m);
  m.winner = winnerId;
  m.loser = winnerId === a ? b : a;
  m.score = score || null;
  autoByes(bracket);
  if (bracket.format === 'swiss') maybeNextSwissRound(bracket);
}

export function resolveBrGame(bracket, bmId, placements) {
  const m = bracket.matches.find((x) => x.id === bmId);
  m.placements = placements; // [{ entrantId, place, kills }]
  m.winner = placements.find((p) => p.place === 1)?.entrantId || null;
}

export function standings(bracket) {
  const rows = {};
  const row = (id) => (rows[id] ||= { entrantId: id, played: 0, wins: 0, losses: 0, points: 0, kills: 0 });
  if (bracket.format === 'battle_royale') {
    for (const m of bracket.matches) {
      m.entrants.forEach(row);
      for (const p of m.placements || []) {
        const r = row(p.entrantId);
        r.played++;
        r.kills += p.kills || 0;
        r.points += (bracket.points[p.place - 1] || 0) + (p.kills || 0);
        if (p.place === 1) r.wins++;
      }
    }
  } else {
    for (const m of bracket.matches) {
      const [a, b] = participants(bracket, m);
      if (a) row(a);
      if (b) row(b);
      if (!m.winner || !m.loser) continue;
      row(m.winner).wins++;
      row(m.winner).points += 3;
      row(m.winner).played++;
      row(m.loser).losses++;
      row(m.loser).played++;
    }
  }
  return Object.values(rows).sort((x, y) => y.points - x.points || y.wins - x.wins || y.kills - x.kills);
}

function maybeNextSwissRound(bracket) {
  const cur = bracket.matches.filter((m) => m.round === bracket.currentRound);
  if (cur.some((m) => !m.winner) || bracket.currentRound >= bracket.rounds) return;
  const table = standings(bracket);
  const played = new Set(bracket.matches.map((m) => [m.a.entrantId, m.b.entrantId].sort().join('|')));
  const pool = table.map((r) => r.entrantId);
  bracket.currentRound++;
  while (pool.length > 1) {
    const a = pool.shift();
    let idx = pool.findIndex((b) => !played.has([a, b].sort().join('|')));
    if (idx < 0) idx = 0;
    const b = pool.splice(idx, 1)[0];
    bracket.matches.push(mk(bracket.currentRound, `Round ${bracket.currentRound}`, 'SW', { entrantId: a }, { entrantId: b }));
  }
}

export function isComplete(bracket) {
  if (bracket.format === 'battle_royale') return bracket.matches.every((m) => m.placements);
  if (bracket.format === 'swiss') return bracket.currentRound >= bracket.rounds && bracket.matches.every((m) => m.winner);
  if (bracket.finalId) return !!bracket.matches.find((m) => m.id === bracket.finalId)?.winner;
  return bracket.matches.every((m) => m.winner);
}

/** Final placements: [entrantId by place]. */
export function finalOrder(bracket) {
  if (bracket.table) return standings(bracket).map((r) => r.entrantId);
  const final = bracket.matches.find((m) => m.id === bracket.finalId);
  const order = [final.winner, final.loser];
  // third place: losers of semis (single elim) or losers final loser (double)
  const rest = [...bracket.matches]
    .filter((m) => m.loser && !order.includes(m.loser))
    .sort((a, b) => b.round - a.round)
    .map((m) => m.loser);
  return [...order, ...rest].filter(Boolean);
}
