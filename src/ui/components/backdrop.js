import { html, useEffect, useRef } from '../../lib/preact.js';

// Motion backdrop: flowing line ribbons drawn on a 2D canvas at full device resolution (so lines stay crisp).
// Two twisting ribbons of thin wavy lines in the brand colours — cobalt into chalk, heat into chalk — with
// light pulses racing along them. It sits at the top of a page and fades into the background below.
// Follows the pointer, pauses when off-screen or hidden, and holds a still frame for reduced motion.

const COBALT = [91, 108, 255];
const CHALK = [242, 239, 230];
const HEAT = [255, 107, 61];

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

function ribbons(W, H, small) {
  return [
    // main ribbon: wide, cobalt → chalk → cobalt
    { lines: small ? 26 : 42, from: COBALT, to: CHALK, y: 0.4, amp: 0.13, spread: small ? 0.42 : 0.5, freq: 2.3, twist: 2.6, speed: 0.28, phase: 0, alpha: 0.42, width: 1 },
    // accent ribbon: thinner, heat → chalk, crossing the first
    { lines: small ? 12 : 18, from: HEAT, to: CHALK, y: 0.55, amp: 0.1, spread: small ? 0.2 : 0.24, freq: 1.7, twist: 3.4, speed: -0.22, phase: 2.1, alpha: 0.55, width: 1.1 },
  ];
}

// y position of line k (0..1) of ribbon r at horizontal position nx (0..1), time t.
function lineY(r, k, nx, t, H, m) {
  const c = H * (r.y + r.amp * Math.sin(nx * r.freq * Math.PI + t * r.speed + r.phase + m.px) + r.amp * 0.35 * Math.sin(nx * 5.3 - t * 0.41 + r.phase));
  const twist = Math.cos(nx * r.twist + t * r.speed * 1.3 + r.phase + m.px * 0.6);
  const ripple = Math.sin(nx * 14 + t * 1.1 + k * 9) * H * 0.006;
  return c + (k - 0.5) * H * r.spread * m.spread * twist + ripple;
}

function startLines(canvas, small) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let W = 0, H = 0, dpr = 1, set = [];
  const pulses = Array.from({ length: small ? 3 : 5 }, (_, i) => ({ r: i % 2, k: Math.random(), x: Math.random(), v: 0.08 + Math.random() * 0.1 }));

  return {
    resize(w, h) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      set = ribbons(W, H, small);
    },
    draw(t, mouse, energy, dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const m = { px: (mouse[0] - 0.5) * 0.9, spread: 1 + (mouse[1] - 0.5) * 0.25 };
      const step = small ? 10 : 7;

      for (const r of set) {
        for (let i = 0; i < r.lines; i++) {
          const k = i / (r.lines - 1);
          const edge = 1 - Math.abs(k - 0.5) * 2; // 0 at edges, 1 in the middle
          const [cr, cg, cb] = mix(r.from, r.to, edge);
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.05 + r.alpha * Math.pow(edge, 1.4)) * energy})`;
          ctx.lineWidth = r.width;
          ctx.beginPath();
          for (let x = -20; x <= W + 20; x += step) {
            const y = lineY(r, k, x / W, t, H, m);
            if (x === -20) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // light pulses travelling along individual lines
      for (const p of pulses) {
        p.x += p.v * dt;
        if (p.x > 1.1) {
          p.x = -0.1;
          p.k = Math.random();
          p.r = Math.random() < 0.65 ? 0 : 1;
          p.v = 0.08 + Math.random() * 0.12;
        }
        const r = set[p.r];
        const x = p.x * W;
        const y = lineY(r, p.k, p.x, t, H, m);
        const col = p.r === 0 ? (p.k > 0.3 && p.k < 0.7 ? CHALK : COBALT) : HEAT;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
        g.addColorStop(0, `rgba(${col.join(',')},${0.9 * energy})`);
        g.addColorStop(0.25, `rgba(${col.join(',')},${0.25 * energy})`);
        g.addColorStop(1, `rgba(${col.join(',')},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.fill();
        // short bright trail behind the pulse
        ctx.strokeStyle = `rgba(${col.join(',')},${0.55 * energy})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let s = 0; s <= 10; s++) {
          const nx = p.x - s * 0.006;
          const yy = lineY(r, p.k, nx, t, H, m);
          if (s === 0) ctx.moveTo(nx * W, yy);
          else ctx.lineTo(nx * W, yy);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/**
 * <MotionBackdrop cls="app-bd" energy={1} />
 * Renders behind content (absolute, top 0).
 */
export function MotionBackdrop({ height = '', energy = 1, cls = '' }) {
  const wrap = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const engine = startLines(canvas, innerWidth < 700);
    if (!engine) return;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      engine.resize(Math.max(2, r.width), Math.max(2, r.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const mouse = [0.5, 0.5];
    const target = [0.5, 0.5];
    const onMove = (e) => {
      target[0] = e.clientX / innerWidth;
      target[1] = e.clientY / innerHeight;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(wrap.current);

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      mouse[0] += (target[0] - mouse[0]) * 0.03;
      mouse[1] += (target[1] - mouse[1]) * 0.03;
      engine.draw((now - t0) / 1000, mouse, energy, dt);
    };
    if (reduce) engine.draw(4, mouse, energy, 0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return html`<div class=${`backdrop ${cls}`} ref=${wrap} style=${height ? `height:${height}` : ''} aria-hidden="true">
    <div class="backdrop-glow"></div>
    <canvas ref=${canvasRef}></canvas>
    <div class="backdrop-grid"></div>
    <div class="backdrop-fade"></div>
  </div>`;
}
