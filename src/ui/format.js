// Display formatting. Currency is UGX for the prototype; swap via the jurisdiction later.

export const CUR = 'UGX';

export function money(n, { sign = false, cur = true } = {}) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('en-US');
  const pre = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${pre}${cur ? CUR + ' ' : ''}${s}`;
}

export function short(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}K`;
  return v.toLocaleString('en-US');
}

export const num = (n) => (Number(n) || 0).toLocaleString('en-US');
export const pct = (n, d = 0) => `${(Number(n) || 0).toFixed(d)}%`;

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function ago(t) {
  const d = Date.now() - t;
  if (d < 45_000) return 'just now';
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  if (d < 7 * 86_400_000) return `${Math.round(d / 86_400_000)}d ago`;
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function until(t) {
  const d = t - Date.now();
  if (d <= 0) return 'now';
  const m = Math.round(d / 60_000);
  if (m < 1) return 'in <1m';
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return when(t);
}

export function when(t) {
  const d = new Date(t);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const tmr = new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return `Today ${time}`;
  if (tmr) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const initials = (name = '?') => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';

export const PLATFORM = { mobile: 'Mobile', pc: 'PC', playstation: 'PlayStation', xbox: 'Xbox' };
export const CATEGORY = { battle_royale: 'Battle royale', fps: 'Shooter', sports: 'Sports', moba: 'MOBA', racing: 'Racing', fighting: 'Fighting', arena: 'Arena', strategy: 'Strategy', casual: 'Casual' };
export const FORMAT = { single_elim: 'Single elimination', double_elim: 'Double elimination', round_robin: 'Round robin', swiss: 'Swiss', league: 'League', ladder: 'Ladder', battle_royale: 'Battle royale points' };
export const MODEL = { winner_takes_all: 'Winner takes pool', placement: 'Placement split', team: 'Team split', individual: 'Paid per elimination', hybrid: 'Placement + eliminations', custom: 'Custom split' };
export const KIND = { challenge: 'Challenge', h2h: 'Head-to-head', pool: 'Pool', tournament: 'Tournament' };
export const H2H_TYPE = { open: 'Open challenge', direct: 'Direct challenge', friend: 'Friend challenge', private: 'Private challenge', skill: 'Skill-matched' };
export const STATUS = {
  open: 'Open', full: 'Full', live: 'Live', verifying: 'In review', settled: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed',
  draft: 'Draft', starting: 'Starting',
  registration: 'Registration open', completed: 'Completed', ready: 'Ready', reporting: 'Waiting on opponent',
  pending: 'Pending', failed: 'Failed', reversed: 'Reversed', under_review: 'Under review', resolved: 'Resolved', rejected: 'Rejected', appealed: 'Appealed',
};
export const TX = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', entry: 'Entry', prize: 'Prize', reward: 'Reward', sponsor_reward: 'Sponsor reward',
  bonus: 'Demo credit', refund: 'Refund', fee: 'Fee', stake: 'Player backing', stake_return: 'Backing return', prediction: 'Prediction',
  prediction_payout: 'Prediction payout', reversal: 'Reversal',
};

export function opLabel(op, target, metric) {
  if (metric === 'won') return 'Win the match';
  if (op === 'gte') return `${target}+`;
  if (op === 'lte') return metric === 'placement' ? `Top ${target}` : `${target} or fewer`;
  return `${target}`;
}
