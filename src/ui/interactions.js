// App-wide micro-interactions, installed once. Delegated, so every button and card gets them without wiring.
//  - Press ripple on buttons, chips and tiles (originates from the pointer).
//  - 3D tilt with a moving glare on cards marked [data-tilt] or with .game-card / .comp-card.
// Both are skipped when the user prefers reduced motion.

const RIPPLE = '.btn, .chip, .opt-tile, .icon-btn, .amount-picker button, .seg button, .mode-tile, .mk-opt, .bottomnav a';
const TILT = '[data-tilt], .game-card .art, .comp-card, .mode-tile, .bs-hero-card';

export function installInteractions() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(RIPPLE);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
  }, { passive: true });

  if (!matchMedia('(hover: hover)').matches) return; // tilt is a pointer-only affordance
  let current = null;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest(TILT);
    if (current && current !== el) {
      current.style.removeProperty('--rx');
      current.style.removeProperty('--ry');
      current.classList.remove('tilting');
      current = null;
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
    el.classList.add('tilting');
    current = el;
  }, { passive: true });
  document.addEventListener('pointerleave', () => current?.classList.remove('tilting'));
}
