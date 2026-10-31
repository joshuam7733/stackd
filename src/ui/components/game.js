import { html, useState } from '../../lib/preact.js';
import { Icon } from '../icons.js';
import { PLATFORM } from '../format.js';

// Generated key art. Each game gets a duotone composition built from its category motif.
// Placeholder by design: no publisher artwork is used or implied.

const SIZES = { card: [400, 500], banner: [800, 350], hero: [1200, 560], square: [400, 400] };

function motif(kind, W, H, fg) {
  const s = `stroke="${fg}" fill="none"`;
  switch (kind) {
    case 'zone': {
      const cx = W * 0.68, cy = H * 0.38, r = Math.max(W, H) * 0.55;
      return `
        <circle cx="${cx}" cy="${cy}" r="${r}" ${s} stroke-opacity=".14" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="${r * 0.66}" ${s} stroke-opacity=".22" stroke-width="2" stroke-dasharray="10 8"/>
        <circle cx="${cx * 0.98}" cy="${cy * 1.05}" r="${r * 0.32}" ${s} stroke-opacity=".55" stroke-width="3"/>
        <circle cx="${cx * 0.98}" cy="${cy * 1.05}" r="${r * 0.32}" fill="${fg}" fill-opacity=".07"/>
        <path d="M${-W * 0.05} ${H * 0.12} L${W * 1.05} ${H * 0.62}" ${s} stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>
        <circle cx="${W * 0.36}" cy="${H * 0.25}" r="5" fill="${fg}" fill-opacity=".8"/>
        <circle cx="${W * 0.55}" cy="${H * 0.34}" r="4" fill="${fg}" fill-opacity=".5"/>`;
    }
    case 'lanes': {
      let out = '';
      for (let i = -2; i < 5; i++) out += `<path d="M${i * W * 0.28} ${H} L${i * W * 0.28 + W * 0.9} 0" ${s} stroke-opacity="${i === 1 ? 0.6 : 0.16}" stroke-width="${i === 1 ? 4 : 2}"/>`;
      out += `<rect x="${W * 0.62}" y="${H * 0.16}" width="18" height="18" transform="rotate(45 ${W * 0.62 + 9} ${H * 0.16 + 9})" fill="${fg}" fill-opacity=".8"/>`;
      out += `<rect x="${W * 0.3}" y="${H * 0.5}" width="14" height="14" transform="rotate(45 ${W * 0.3 + 7} ${H * 0.5 + 7})" fill="${fg}" fill-opacity=".45"/>`;
      return out;
    }
    case 'pitch': {
      const pw = W * 1.1, ph = H * 0.9, x = W * 0.25, y = -H * 0.05;
      return `
        <g transform="rotate(-14 ${W / 2} ${H / 2})">
          <rect x="${x}" y="${y}" width="${pw}" height="${ph}" ${s} stroke-opacity=".22" stroke-width="2"/>
          <path d="M${x + pw / 2} ${y} V${y + ph}" ${s} stroke-opacity=".22" stroke-width="2"/>
          <circle cx="${x + pw / 2}" cy="${y + ph / 2}" r="${ph * 0.18}" ${s} stroke-opacity=".5" stroke-width="3"/>
          <rect x="${x}" y="${y + ph * 0.25}" width="${pw * 0.14}" height="${ph * 0.5}" ${s} stroke-opacity=".3" stroke-width="2"/>
          <circle cx="${x + pw / 2}" cy="${y + ph / 2}" r="5" fill="${fg}"/>
        </g>`;
    }
    case 'rack': {
      let out = '';
      const r = Math.min(W, H) * 0.075, ox = W * 0.62, oy = H * 0.12;
      for (let row = 0; row < 5; row++)
        for (let k = 0; k <= row; k++) {
          const cx = ox + (k - row / 2) * r * 2.1, cy = oy + row * r * 1.85;
          out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fg}" fill-opacity="${row === 2 && k === 1 ? 0.95 : 0.12 + ((row + k) % 3) * 0.1}" ${s} stroke-opacity=".5" stroke-width="2"/>`;
        }
      out += `<circle cx="${W * 0.2}" cy="${H * 0.36}" r="${r}" fill="#f2efe6" fill-opacity=".85"/>`;
      out += `<path d="M${W * 0.2 + r} ${H * 0.36} L${ox - r * 4} ${oy + r * 4}" ${s} stroke-opacity=".4" stroke-width="2" stroke-dasharray="4 8"/>`;
      return out;
    }
    case 'speed': {
      let out = '';
      for (let i = 0; i < 14; i++) {
        const y = (H / 14) * i + 8, len = W * (0.25 + ((i * 37) % 10) / 14);
        out += `<path d="M${W - len * 1.1} ${y} L${W + 20} ${y - H * 0.2}" ${s} stroke-opacity="${0.08 + (i % 4) * 0.08}" stroke-width="${2 + (i % 3)}" stroke-linecap="round"/>`;
      }
      out += `<path d="M${W * 0.5} ${H * 0.18} l${W * 0.12} ${H * 0.12} l-${W * 0.12} ${H * 0.12}" ${s} stroke-opacity=".8" stroke-width="6"/>`;
      out += `<path d="M${W * 0.6} ${H * 0.18} l${W * 0.12} ${H * 0.12} l-${W * 0.12} ${H * 0.12}" ${s} stroke-opacity=".4" stroke-width="6"/>`;
      return out;
    }
    case 'burst': {
      let out = '';
      const cx = W * 0.66, cy = H * 0.34;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, R = Math.max(W, H);
        out += `<path d="M${cx} ${cy} L${cx + Math.cos(a) * R} ${cy + Math.sin(a) * R} L${cx + Math.cos(a + 0.12) * R} ${cy + Math.sin(a + 0.12) * R}Z" fill="${fg}" fill-opacity="${i % 2 ? 0.05 : 0.11}"/>`;
      }
      out += `<circle cx="${cx}" cy="${cy}" r="${Math.min(W, H) * 0.12}" fill="${fg}" fill-opacity=".85"/>`;
      return out;
    }
    case 'tiles': {
      let out = '';
      const sz = Math.min(W, H) * 0.16;
      for (let y = -1; y < H / sz + 1; y++)
        for (let x = -1; x < W / sz + 1; x++) {
          const on = (x * 7 + y * 3) % 9 === 0;
          out += `<rect x="${x * sz + (y % 2) * sz / 2}" y="${y * sz * 0.9}" width="${sz * 0.55}" height="${sz * 0.55}" transform="rotate(45 ${x * sz + (y % 2) * sz / 2 + sz * 0.27} ${y * sz * 0.9 + sz * 0.27})" fill="${fg}" fill-opacity="${on ? 0.7 : 0.07}"/>`;
        }
      return out;
    }
    case 'slash':
    default: {
      return `
        <path d="M${W * 0.45} 0 L${W} 0 L${W} ${H} L${W * 0.15} ${H}Z" fill="${fg}" fill-opacity=".09"/>
        <path d="M${W * 0.62} ${-H * 0.05} L${W * 0.3} ${H * 0.75}" ${s} stroke-opacity=".85" stroke-width="7" stroke-linecap="round"/>
        <path d="M${W * 0.74} ${H * 0.02} L${W * 0.44} ${H * 0.7}" ${s} stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>
        <path d="M${W * 0.84} ${H * 0.08} L${W * 0.58} ${H * 0.62}" ${s} stroke-opacity=".22" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
}

// Which artwork slot each layout uses, and the widths requested from the CDN (1x and 2x).
const SLOT = { card: 'cover', banner: 'banner', hero: 'hero', square: 'icon' };
const WIDTHS = { cover: [360, 720], banner: [480, 960], hero: [1280, 1920], icon: [96, 192] };
const IMG_SIZES = { cover: '(min-width: 1024px) 240px, 45vw', banner: '(min-width: 1024px) 420px, 92vw', hero: '100vw', icon: '64px' };

function Photo({ game, size = 'card', word = true, cls = '', style, onFail }) {
  const m = game.media;
  let slot = SLOT[size] || 'banner';
  if (slot === 'hero' && !m.hero) slot = 'banner';
  const tpl = m[slot] || m.banner || m.cover;
  const ws = WIDTHS[slot];
  const sized = tpl.includes('{w}');
  const src = sized ? tpl.replaceAll('{w}', ws[0]) : tpl;
  const srcset = sized ? ws.map((w) => `${tpl.replaceAll('{w}', w)} ${w}w`).join(', ') : undefined;
  const pos = slot === 'cover' || slot === 'icon' ? m.coverPos : m.bannerPos;
  return html`<div class=${`art photo ${cls}`} style=${style} role="img" aria-label=${`${game.name} artwork`}>
    <img src=${src} srcset=${srcset} sizes=${sized ? IMG_SIZES[slot] : undefined} alt="" loading=${size === 'hero' ? 'eager' : 'lazy'} decoding="async"
      style=${`object-position:${pos || '50% 50%'}`} onLoad=${(e) => e.currentTarget.classList.add('in')} onError=${onFail} />
    ${word && size === 'card' && !m.logo && html`<span class="art-shade"></span><span class="art-name">${game.short}</span>`}
  </div>`;
}

export function GameArt(props) {
  const [failed, setFailed] = useState(false);
  const { game } = props;
  if (game?.media && !failed) return html`<${Photo} ...${props} onFail=${() => setFailed(true)} />`;
  return html`<${GeneratedArt} ...${props} />`;
}

// Generated duotone art: the fallback when a game has no artwork or the image can't load.
function GeneratedArt({ game, size = 'card', word = true, cls = '', style }) {
  if (!game) return html`<div class=${`art ${cls}`} style=${style}></div>`;
  const [W, H] = SIZES[size] || SIZES.card;
  const { bg, fg, motif: m } = game.art || { bg: '#1d2027', fg: '#9ea1aa', motif: 'zone' };
  const label = (game.short || game.name || '').toUpperCase();
  const fs = Math.min(H * (size === 'card' ? 0.38 : 0.5), (W * 0.9) / (Math.max(2, label.length) * 0.44));
  const id = `g${game.id}${size}`;
  const svg = `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#0c0d10"/>
      </linearGradient>
      <linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1">
        <stop offset=".45" stop-color="#0c0d10" stop-opacity="0"/><stop offset="1" stop-color="#0c0d10" stop-opacity=".75"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${id})"/>
    ${motif(m, W, H, fg)}
    <rect width="${W}" height="${H}" fill="url(#${id}v)"/>
    ${word ? `<text x="${W * 0.04}" y="${H - H * 0.035}" font-family="Archivo, sans-serif" font-weight="900" font-stretch="62%" style="font-variation-settings:'wdth' 62;font-stretch:62%" font-size="${fs}" fill="${fg}" letter-spacing="-1">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : ''}`;
  return html`<div class=${`art ${cls}`} style=${style} role="img" aria-label=${`${game.name} artwork`}>
    <svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" dangerouslySetInnerHTML=${{ __html: svg }}></svg>
  </div>`;
}

export function PlatformIcons({ platforms = [] }) {
  return html`<span class="row tight xs muted" style="gap:6px">${platforms.map((p) => html`<span title=${PLATFORM[p]}>${PLATFORM[p]}</span>`)}</span>`;
}

export function GameCard({ game, sub }) {
  return html`<a class="game-card" href=${`#/app/games/${game.slug}`}>
    <${GameArt} game=${game} />
    <div>
      <p class="gname truncate">${game.name}</p>
      <p class="gmeta">${sub ?? (game.open != null ? `${game.open} open now` : game.platforms.map((p) => PLATFORM[p]).join(', '))}</p>
    </div>
  </a>`;
}

export function GameThumb({ game, size = 40 }) {
  return html`<div style=${`width:${size}px;height:${size}px;flex-shrink:0`}><${GameArt} game=${game} size="square" word=${false} style="width:100%;height:100%;border-radius:10px" /></div>`;
}
