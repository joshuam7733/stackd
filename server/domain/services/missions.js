// Sponsored missions: rewards, and progress missions that advance from real competition results
// (e.g. "Play 3 matches and finish Top 10 once").
import { credit } from '../ledger.js';
import { notify } from '../notify.js';
import { evaluateAchievements } from '../engines/achievements.js';
import { uid } from '../util.js';
import { money } from '../fmt.js';

/** requirement metrics a progress mission can count */
export const PROGRESS_METRICS = {
  matches: { label: 'Play matches', from: () => 1 },
  wins: { label: 'Win matches', from: (r) => (r.won ? 1 : 0) },
  top10: { label: 'Finish top 10', from: (r) => (r.place && r.place <= 10 && r.field >= 10 ? 1 : 0) },
  top3: { label: 'Finish top 3', from: (r) => (r.place && r.place <= 3 ? 1 : 0) },
  kills: { label: 'Get eliminations', from: (r) => r.kills || 0 },
  prizes: { label: 'Cash a prize', from: (r) => (r.payout > 0 ? 1 : 0) },
};

export function grantReward(db, user, m) {
  const ref = { kind: 'mission', id: m.id, label: m.title };
  const sponsor = db.sponsors.find((s) => s.id === m.sponsorId) || { name: 'STACKD' };
  if (m.reward.type === 'cash' && m.reward.value) credit(db, user.id, 'sponsor_reward', m.reward.value, ref, `${sponsor.name} mission reward (demo)`);
  if (m.reward.type === 'credit' && m.reward.value) credit(db, user.id, 'sponsor_reward', m.reward.value, ref, `${sponsor.name} STACKD credit (demo)`, { bucket: 'bonus' });
  const drop = { id: uid('drp'), userId: user.id, missionId: m.id, sponsorId: m.sponsorId, label: m.reward.label, type: m.reward.type, code: `${sponsor.name.slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, at: Date.now(), status: 'ready' };
  db.drops.push(drop);
  m.stats.completions += 1;
  m.winners.push(user.id);
  const camp = db.campaigns.find((c) => c.id === m.campaignId);
  if (camp) camp.spent += m.reward.value || 2500;
  user.stats.missions += 1;
  evaluateAchievements(db.achievementDefs, user).forEach((a) => notify(db, user.id, { type: 'achievement', title: `Achievement unlocked: ${a.name}`, body: a.blurb, link: '/app/profile' }));
  notify(db, user.id, { type: 'mission', title: `Mission complete: ${m.reward.label}`, body: m.reward.value ? `${money(m.reward.value)} DEMO credited to your wallet.` : `${sponsor.name} drop added to your stack.`, link: `/app/missions/${m.id}` });
  return drop;
}

/**
 * Called after every settled result for a real player. result: { gameId, won, place, field, kills, payout }
 * Only missions the player has started count, and only results after they started.
 */
export function trackMissionProgress(db, user, result) {
  if (user.isBot) return;
  const now = Date.now();
  for (const m of db.missions) {
    if (m.type !== 'progress' || m.status !== 'live') continue;
    const pr = m.progress[user.id];
    if (!pr || pr.completedAt || pr.failed) continue;
    if (m.gameId && m.gameId !== result.gameId) continue;
    if (m.endsAt && now > m.endsAt) continue;
    pr.counts ||= {};
    let moved = false;
    for (const req of m.objective.requirements || []) {
      const inc = PROGRESS_METRICS[req.metric]?.from(result) || 0;
      if (inc > 0) {
        pr.counts[req.metric] = Math.min(req.target, (pr.counts[req.metric] || 0) + inc);
        moved = true;
      }
    }
    if (!moved) continue;
    pr.updatedAt = now;
    const done = (m.objective.requirements || []).every((req) => (pr.counts[req.metric] || 0) >= req.target);
    if (done && m.stats.completions < m.quantity) {
      pr.completedAt = now;
      pr.found = true;
      grantReward(db, user, m);
    } else {
      const left = (m.objective.requirements || []).filter((req) => (pr.counts[req.metric] || 0) < req.target).map((req) => `${req.target - (pr.counts[req.metric] || 0)} × ${PROGRESS_METRICS[req.metric].label.toLowerCase()}`);
      notify(db, user.id, { type: 'mission', title: `Mission progress: ${m.title}`, body: `To go: ${left.join(', ')}.`, link: `/app/missions/${m.id}` });
    }
  }
}
