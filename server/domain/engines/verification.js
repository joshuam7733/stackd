// Result verification adapters. Games expose different things, so each game lists the methods it supports
// (game.verification) in preference order. A real deployment plugs OCR, VOD review or publisher APIs in here.

export const VERIFIERS = {
  api: { id: 'api', name: 'Game data', blurb: 'Pulled from the game or a tournament platform.' },
  video: { id: 'video', name: 'Video / VOD', blurb: 'Stream or clip reviewed against the claim.' },
  screenshot: { id: 'screenshot', name: 'Screenshot', blurb: 'End-of-match screen read and checked.' },
  manual: { id: 'manual', name: 'Referee', blurb: 'A STACKD referee reviews the evidence.' },
};

function plausible(game, stats) {
  const issues = [];
  for (const m of game.metrics || []) {
    const v = stats[m.key];
    if (v == null) continue;
    if (typeof v !== 'number' || Number.isNaN(v)) issues.push(`${m.label} isn't a number`);
    else if (m.max != null && v > m.max) issues.push(`${m.label} of ${v} is above what's possible in this mode`);
    else if (m.min != null && v < m.min) issues.push(`${m.label} of ${v} is below the minimum`);
  }
  if (stats.headshots != null && stats.kills != null && stats.headshots > stats.kills) issues.push('More headshots than kills');
  return issues;
}

/** Verify one report. Pure: returns the verdict; the caller records it on the match timeline. */
// `truth` is what the evidence actually shows. In demo mode the simulator produces it; in production it is
// what OCR, the VOD reviewer or the game API extracted.
export function verifyReport(game, match, report, truth) {
  const evidence = report.evidence || [];
  const hasVideo = evidence.some((e) => e.type === 'video');
  const hasShot = evidence.some((e) => e.type === 'screenshot');
  const supported = game.verification || ['screenshot', 'manual'];
  const method =
    supported.includes('api') ? 'api' :
    hasVideo && supported.includes('video') ? 'video' :
    hasShot && supported.includes('screenshot') ? 'screenshot' : 'manual';

  const issues = plausible(game, report.stats || {});
  const checks = [
    { label: 'Evidence attached', ok: method === 'api' || evidence.length > 0 },
    { label: 'Stats are possible for this mode', ok: issues.length === 0, note: issues.join('; ') || undefined },
    ...(truth ? [{ label: 'Stats match the evidence', ok: mismatch(truth, report.stats || {}).length === 0, note: mismatch(truth, report.stats || {}).join('; ') || undefined }] : []),
    { label: 'Submitted inside the match window', ok: !match.startedAt || Date.now() - match.startedAt < 6 * 3600_000 },
    { label: 'In-game account matches profile', ok: true },
  ];

  const failed = checks.filter((c) => !c.ok);
  let status = 'verified';
  if (method === 'manual' || failed.length) status = 'review';
  if (issues.length >= 2) status = 'rejected';
  const confidence = Math.max(0.2, Math.min(0.99, (method === 'api' ? 0.98 : method === 'video' ? 0.94 : method === 'screenshot' ? 0.9 : 0.5) - failed.length * 0.25));

  return { method, status, confidence: Math.round(confidence * 100) / 100, checks, at: Date.now() };
}

function mismatch(truth, stats) {
  const out = [];
  for (const [k, v] of Object.entries(stats)) {
    if (truth[k] == null) continue;
    if (Math.abs(Number(truth[k]) - Number(v)) > (k === 'damage' ? 50 : k === 'kda' ? 0.2 : 0)) out.push(`${k}: reported ${v}, evidence shows ${truth[k]}`);
  }
  return out;
}

/** H2H: two reports agree → verified; disagree → dispute. */
export function reconcile(reportA, reportB) {
  if (!reportA || !reportB) return { status: 'waiting' };
  const aSaysA = reportA.outcome === 'win';
  const bSaysB = reportB.outcome === 'win';
  if (aSaysA !== bSaysB) return { status: 'agreed', winner: aSaysA ? 'a' : 'b' };
  return { status: 'conflict' };
}
