// Auto-fit for big numbers. Balances, pools and scores can be any length (UGX 1,000,000,000 is valid), so any
// figure that would spill out of its card, pill or tile is scaled down until it fits (never below 55%).
// Runs on DOM changes and resizes, batched into one pass every ~30ms at most.

const FIT = '.big-num, .stat .v, .kpi .v, .id-v, .bs-pool, .bs-usd, .mult, .slip-amt, .tx-amt, .wallet-chip, .cc-prize .amt, .display';
const BOX = '.badge, .chip, .wallet-chip, .stat, .kpi, .id-stats > div, .bs-clock > div, .pod, .slip, .card, .panel, .comp-card, .live-tile, .bs-hero-card, .bs-banner, .result-hero, .sheet-body, .li, .stake-box, .home-hero, .game-hero-copy, .comp-hero-copy, .team-hero, .id-card, .container';
const MIN = 0.55;

function contentBox(box) {
  const r = box.getBoundingClientRect();
  const s = getComputedStyle(box);
  return { left: r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth), right: r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) };
}

function textBounds(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function fit(el) {
  if (!el.isConnected || !el.textContent.trim()) return;
  const box = el.closest(BOX); // may be the element itself (e.g. the wallet chip is its own pill)
  if (!box) return;
  // The intended size is whatever the component/CSS asked for. If the current size is one we applied, use the
  // remembered base; otherwise the component re-rendered with a new size, which becomes the new base.
  const current = parseFloat(getComputedStyle(el).fontSize);
  const applied = parseFloat(el.dataset.fitApplied || 'NaN');
  const base = Math.abs(current - applied) < 0.5 ? parseFloat(el.dataset.fitBase) : current;
  el.dataset.fitBase = base;
  el.style.fontSize = `${base}px`;
  el.dataset.fitApplied = base;
  const t = textBounds(el);
  if (!t.width) return;
  const c = contentBox(box === el ? el : box);
  const avail = c.right - c.left;
  const overRight = t.right - c.right;
  const overLeft = c.left - t.left;
  if (overRight <= 0.5 && overLeft <= 0.5) return;
  const usable = Math.min(avail, t.width - Math.max(0, overRight) - Math.max(0, overLeft));
  const k = Math.max(MIN, (usable / t.width) * 0.97);
  const size = Math.floor(base * k);
  el.style.fontSize = `${size}px`;
  el.dataset.fitApplied = size;
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  // A short timer rather than requestAnimationFrame: rAF is paused in background tabs, and the fit must
  // already be right when the tab comes back.
  setTimeout(() => {
    queued = false;
    for (const el of document.querySelectorAll(FIT)) {
      try {
        fit(el);
      } catch {
        /* one odd element never blocks the rest */
      }
    }
  }, 30);
}

export function installFit() {
  const mo = new MutationObserver(schedule);
  mo.observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready.then(schedule);
  schedule();
}
