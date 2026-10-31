// Typography / layout QA for STACKD. Run in the browser console on the running app:
//   const qa = await import('/tools/qa-typography.js'); await qa.runAll();          // player screens
//   await qa.runAll(qa.ADMIN_ROUTES);                                                 // admin screens (log in as admin)
// Reports text that spills out of its card/pill/button, siblings that overlap, and horizontal page overflow.

export const PLAYER_ROUTES = [
  '/', '/app', '/app/play', '/app/games', '/app/games/codm', '/app/games/codm?tab=leaders', '/app/challenges', '/app/h2h',
  '/app/tournaments', '/app/tournaments?tab=completed', '/app/arcade', '/app/arcade/quickdraw', '/app/teams', '/app/teams/tm_nile',
  '/app/missions', '/app/missions/msn_fizz_hunt', '/app/leaderboards', '/app/players', '/app/predictions', '/app/profile',
  '/app/u/NileViper', '/app/wallet', '/app/notifications', '/app/settings', '/app/settings?tab=play', '/app/fairplay',
  '/app/support', '/app/bigstack', '/app/search?q=nile',
];
export const ADMIN_ROUTES = ['/admin', '/admin/users', '/admin/users/usr_demo', '/admin/games', '/admin/competitions', '/admin/tournaments', '/admin/markets', '/admin/wallet', '/admin/sponsors', '/admin/bigstack', '/admin/compliance', '/admin/support', '/admin/fraud', '/admin/audit', '/sponsor'];

// Boxes text is expected to stay inside.
const CONTAINERS = [
  '.badge', '.chip', '.wallet-chip', '.demo-pill', '.btn', '.icon-btn', '.amount-picker button', '.seg button', '.tab',
  '.stat', '.kpi', '.id-stats > div', '.bs-clock > div', '.pod', '.roster-item', '.ach', '.slip', '.file-pill',
  '.stake-box', '.mk-opt', '.opt-tile', '.mode-tile', '.live-tile', '.comp-card', '.card', '.panel', '.bs-hero-card', '.bs-banner',
  '.result-hero', '.sheet', '.li', '.home-hero', '.game-hero', '.comp-hero', '.team-hero', '.id-card', '.toast', '.notice',
].join(',');
// Rows whose children must never overlap each other.
const ROWS = '.row, .stats, .kpis, .cc-prize, .cc-foot, .id-stats, .bs-clock, .podium, .h2h-row, .who, .li, .stake-box, .bs-banner, .kv';
const SCROLLERS = '.rail, .chips, .tabs, .seg, .table-wrap, .bracket, .ticker, .backdrop, .amount-picker';

const textRect = (el) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect();
};
const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const visible = (el) => {
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
};
const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent || '').trim().slice(0, 28)}"`;

export function check() {
  const issues = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push({ type: 'page-overflow', detail: `${document.documentElement.scrollWidth}px > ${vw}px` });

  for (const el of document.querySelectorAll('#app *')) {
    if (!ownText(el) || !visible(el) || el.closest('svg, [aria-hidden="true"], .sr-only')) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis') continue; // deliberate truncation
    const t = textRect(el);
    if (!t.width) continue;
    const box = el.closest(CONTAINERS);
    const scroller = el.closest(SCROLLERS);
    // Text inside a horizontal scroller (tables, chip rows) is meant to extend past the card and scroll.
    if (box && !(scroller && box.contains(scroller))) {
      const b = box.getBoundingClientRect();
      const bs = getComputedStyle(box);
      const padL = parseFloat(bs.borderLeftWidth) || 0;
      const padR = parseFloat(bs.borderRightWidth) || 0;
      if (t.right > b.right - padR + 1.5 || t.left < b.left + padL - 1.5)
        issues.push({ type: 'spills-container', el: label(el), box: label(box), by: Math.round(Math.max(t.right - b.right, b.left - t.left)) });
    }
    if (!el.closest(SCROLLERS) && (t.right > vw + 1 || t.left < -1)) issues.push({ type: 'offscreen', el: label(el), right: Math.round(t.right) });
  }

  for (const row of document.querySelectorAll(ROWS)) {
    if (!visible(row) || row.closest(SCROLLERS)) continue;
    const kids = [...row.children].filter((k) => visible(k) && getComputedStyle(k).position !== 'absolute');
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) issues.push({ type: 'overlap', a: label(kids[i]), b: label(kids[j]), area: Math.round(w * h) });
      }
  }
  return issues;
}

export async function runAll(routes = PLAYER_ROUTES, wait = 1600) {
  const report = {};
  for (const r of routes) {
    location.hash = r;
    await new Promise((res) => setTimeout(res, wait));
    const found = check();
    if (found.length) report[r] = found;
  }
  return { width: innerWidth, total: Object.values(report).reduce((a, x) => a + x.length, 0), report };
}
