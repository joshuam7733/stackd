// Achievement framework. Add a definition here (or in db.achievementDefs) — no UI changes needed.
// criteria: { stat, gte } compares a user.stats field; { score, gte } compares stackScore.

export const DEFAULT_ACHIEVEMENTS = [
  { id: 'first_w', name: 'First W', blurb: 'Win your first match.', criteria: { stat: 'wins', gte: 1 }, tier: 1, glyph: 'W' },
  { id: 'first_stack', name: 'First stack', blurb: 'Earn your first prize.', criteria: { stat: 'earnings', gte: 1 }, tier: 1, glyph: '$' },
  { id: 'wins_10', name: '10 wins', blurb: 'Win 10 matches.', criteria: { stat: 'wins', gte: 10 }, tier: 2, glyph: '10' },
  { id: 'matches_100', name: '100 matches', blurb: 'Play 100 matches.', criteria: { stat: 'matches', gte: 100 }, tier: 2, glyph: 'C' },
  { id: 'on_a_run', name: 'On a run', blurb: 'Win 3 in a row.', criteria: { stat: 'bestStreak', gte: 3 }, tier: 1, glyph: '3' },
  { id: 'streak_10', name: '10-win streak', blurb: 'Win 10 in a row.', criteria: { stat: 'bestStreak', gte: 10 }, tier: 3, glyph: '10' },
  { id: 'champ', name: 'Tournament champ', blurb: 'Win a tournament.', criteria: { stat: 'tournamentWins', gte: 1 }, tier: 3, glyph: 'T' },
  { id: 'team_champ', name: 'Team champ', blurb: 'Win a pool or tournament with your squad.', criteria: { stat: 'teamWins', gte: 1 }, tier: 2, glyph: 'S' },
  { id: 'mvp', name: 'MVP', blurb: 'Top the elimination count in a team pool.', criteria: { stat: 'mvps', gte: 1 }, tier: 2, glyph: 'M' },
  { id: 'top_10', name: 'Top 10', blurb: 'Finish top 10 in a battle royale pool.', criteria: { stat: 'top10', gte: 1 }, tier: 1, glyph: '10' },
  { id: 'run_it_back', name: 'Run it back', blurb: 'Take a rematch.', criteria: { stat: 'rematches', gte: 1 }, tier: 1, glyph: 'R' },
  { id: 'mission_1', name: 'Mission ready', blurb: 'Complete a sponsored mission.', criteria: { stat: 'missions', gte: 1 }, tier: 1, glyph: 'M' },
  { id: 'arcade_5', name: 'Arcade regular', blurb: 'Play 5 arcade runs.', criteria: { stat: 'arcadeRuns', gte: 5 }, tier: 1, glyph: 'A' },
  { id: 'gold', name: 'Gold standard', blurb: 'Reach Gold rank.', criteria: { score: true, gte: 1150 }, tier: 2, glyph: 'G' },
  { id: 'elite', name: 'STACKD Elite', blurb: 'Reach Elite rank.', criteria: { score: true, gte: 1600 }, tier: 3, glyph: 'E' },
];

export function evaluateAchievements(defs, user) {
  const have = new Set(user.achievements.map((a) => a.id));
  const unlocked = [];
  for (const d of defs) {
    if (have.has(d.id)) continue;
    const v = d.criteria.score ? user.stackScore : user.stats[d.criteria.stat] || 0;
    if (v >= d.criteria.gte) {
      user.achievements.push({ id: d.id, at: Date.now() });
      unlocked.push(d);
    }
  }
  return unlocked;
}
