import { html, useState, useEffect } from '../../lib/preact.js';
import { Icon, Glyph } from '../icons.js';
import { useSession, toast } from '../hooks.js';
import { navigate, isActive } from '../router.js';
import { IconButton, Avatar, Menu, Badge } from './base.js';
import { short } from '../format.js';
import { rpc, setToken } from '../../client/api.js';
import { MotionBackdrop } from './backdrop.js';

export function Wordmark({ href = '/app', size }) {
  return html`<a href=${'#' + href} class="wordmark" style=${size ? `font-size:${size}px` : ''} aria-label="STACKD home"><${Glyph} size=${size ? size * 0.8 : 22} /><span>STACKD</span></a>`;
}

const DESK_NAV = [
  ['Home', '/app', true],
  ['Games', '/app/games'],
  ['Challenges', '/app/challenges'],
  ['H2H', '/app/h2h'],
  ['Tournaments', '/app/tournaments'],
  ['Arcade', '/app/arcade'],
  ['Teams', '/app/teams'],
  ['Leaderboards', '/app/leaderboards'],
  ['Big Stack', '/app/bigstack'],
];

const PLAY_PATHS = ['/app/bigstack', '/app/play', '/app/games', '/app/challenges', '/app/h2h', '/app/arcade', '/app/teams', '/app/missions', '/app/compete', '/app/match', '/app/players', '/app/predictions'];

// Admin only: the demo world is shared by everyone on the server, so this resets it for all players.
export async function resetDemo({ confirmed = false } = {}) {
  if (!confirmed && !confirm('Reset the demo world for everyone on this server? All accounts, wallets and results go back to the seed data.')) return;
  try {
    await rpc('account.resetDemo');
  } catch (e) {
    toast.err("Couldn't reset", e.message);
    return;
  }
  setToken(null);
  toast.info('Demo reset', 'Fresh world. Log in again.');
  setTimeout(() => {
    location.hash = '/';
    location.reload();
  }, 400);
}

function SearchBox() {
  const [q, setQ] = useState('');
  return html`<form class="searchbox desk-only" role="search" onSubmit=${(e) => { e.preventDefault(); if (q.trim()) navigate(`/app/search?q=${encodeURIComponent(q.trim())}`); }}>
    <${Icon} name="search" />
    <input class="input" type="search" placeholder="Search players, games, teams" aria-label="Search" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} id="global-search" />
    <span class="kbd">/</span>
  </form>`;
}

function UserMenu({ user, signOut }) {
  return html`<${Menu} label="Account" trigger=${({ toggle, open }) => html`<button type="button" class="icon-btn" aria-haspopup="menu" aria-expanded=${open} aria-label="Account menu" onClick=${(e) => { e.stopPropagation(); toggle(); }}><${Avatar} user=${user} size="sm" online=${false} /></button>`}>
    <div style="padding:8px 10px 10px"><p class="strong">${user.username}</p><p class="xs muted">${user.email}</p></div>
    <hr />
    <a href="#/app/profile" role="menuitem"><${Icon} name="user" />Profile</a>
    <a href="#/app/wallet" role="menuitem"><${Icon} name="wallet" />Wallet</a>
    <a href="#/app/bigstack" role="menuitem"><${Icon} name="crown" />The Big Stack</a>
    <a href="#/app/players" role="menuitem"><${Icon} name="users" />Back a player</a>
    <a href="#/app/predictions" role="menuitem"><${Icon} name="trend" />Predictions</a>
    <a href="#/app/settings" role="menuitem"><${Icon} name="settings" />Settings</a>
    <a href="#/app/fairplay" role="menuitem"><${Icon} name="shield" />Fair play</a>
    <a href="#/app/support" role="menuitem"><${Icon} name="help" />Help & support</a>
    ${user.role === 'admin' && html`<a href="#/admin" role="menuitem"><${Icon} name="grid" />Admin console</a>`}
    ${(user.role === 'sponsor' || user.role === 'admin') && html`<a href="#/sponsor" role="menuitem"><${Icon} name="megaphone" />Sponsor dashboard</a>`}
    <hr />
    ${user.role === 'admin' && html`<button type="button" role="menuitem" onClick=${resetDemo}><${Icon} name="again" />Reset demo world</button>`}
    <button type="button" role="menuitem" onClick=${signOut}><${Icon} name="logout" />Log out</button>
  <//>`;
}

export function AppShell({ path, children }) {
  const { user, signOut } = useSession();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        const el = document.getElementById('global-search');
        if (el) {
          e.preventDefault();
          el.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const out = async () => {
    await signOut();
    navigate('/');
  };
  const playActive = PLAY_PATHS.some((p) => isActive(path, p));
  return html`<div class="app">
    <a href="#main" class="sr-only">Skip to content</a>
    <header class="topbar">
      <div class="container topbar-in">
        <${Wordmark} />
        <nav class="topnav desk-only" aria-label="Main">
          ${DESK_NAV.map(([label, href, exact]) => html`<a href=${'#' + href} aria-current=${isActive(path, href, exact) ? 'page' : undefined}>${label}</a>`)}
        </nav>
        <div class="topbar-right">
          <span class="demo-pill tab-up" title="Simulated money. No real payments.">Demo mode</span>
          <${SearchBox} />
          <${IconButton} icon="search" label="Search" href="/app/search" class="search-ico" />
          <${IconButton} icon="bell" label=${`Notifications${user?.unread ? `, ${user.unread} unread` : ''}`} href="/app/notifications" badge=${user?.unread} />
          <a class="wallet-chip" href="#/app/wallet" aria-label=${`Wallet balance UGX ${user?.wallet?.available?.toLocaleString()}`}><${Icon} name="wallet" /><span class="cur">UGX</span>${short(user?.wallet?.available || 0)}</a>
          <span class="desk-only"><${UserMenu} user=${user} signOut=${out} /></span>
        </div>
      </div>
    </header>
    <main id="main" class="main"><${MotionBackdrop} height="" cls="app-bd" />${children}</main>
    <nav class="bottomnav" aria-label="Main">
      <a href="#/app" aria-current=${path === '/app' ? 'page' : undefined}><${Icon} name="home" />Home</a>
      <a href="#/app/play" class="play" aria-current=${playActive ? 'page' : undefined}><span class="pbtn"><${Icon} name="play" /></span>Play</a>
      <a href="#/app/tournaments" aria-current=${isActive(path, '/app/tournaments') ? 'page' : undefined}><${Icon} name="trophy" />Tournaments</a>
      <a href="#/app/wallet" aria-current=${isActive(path, '/app/wallet') ? 'page' : undefined}><${Icon} name="wallet" />Wallet</a>
      <a href="#/app/profile" aria-current=${['/app/profile', '/app/settings', '/app/notifications', '/app/fairplay', '/app/support', '/app/leaderboards'].some((p) => isActive(path, p)) || path.startsWith('/app/u/') ? 'page' : undefined}><${Icon} name="user" />Profile</a>
    </nav>
  </div>`;
}

const PLAY_TABS = [
  ['Games', '/app/games'],
  ['Challenges', '/app/challenges'],
  ['H2H', '/app/h2h'],
  ['Arcade', '/app/arcade'],
  ['Teams', '/app/teams'],
  ['Missions', '/app/missions'],
];
export function PlaySubnav({ path }) {
  return html`<nav class="subnav mob-only" aria-label="Play">
    <div class="chips">${PLAY_TABS.map(([l, h]) => html`<a class="chip" href=${'#' + h} aria-pressed=${isActive(path, h) ? 'true' : 'false'}>${l}</a>`)}</div>
  </nav>`;
}

export function PublicNav() {
  const { user } = useSession();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return html`<header class=${`pubnav ${scrolled ? 'scrolled' : ''}`}>
    <div class="container">
      <${Wordmark} href="/" />
      <nav class="desk-only" aria-label="Site">
        <a href="#how">How it works</a><a href="#games">Games</a><a href="#compete">Compete</a><a href="#missions">Missions</a><a href="#faq">FAQ</a>
      </nav>
      <div class="row tight" style="margin-left:auto">
        ${user
          ? html`<a class="btn btn-primary btn-sm" href="#/app">Open STACKD</a>`
          : html`<a class="btn btn-ghost btn-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/signup">Get started</a>`}
      </div>
    </div>
  </header>`;
}

const ADMIN_NAV = [
  ['Overview', [['Dashboard', '/admin', 'grid', true]]],
  ['Operate', [['Users', '/admin/users', 'users'], ['Games', '/admin/games', 'play'], ['Competitions', '/admin/competitions', 'swords'], ['Tournaments', '/admin/tournaments', 'trophy'], ['Markets', '/admin/markets', 'trend']]],
  ['Money', [['Wallet & payouts', '/admin/wallet', 'wallet', false, 'withdrawalsPending']]],
  ['Growth', [['Sponsors', '/admin/sponsors', 'megaphone'], ['The Big Stack', '/admin/bigstack', 'crown']]],
  ['Trust', [['Compliance', '/admin/compliance', 'shield', false, 'kycPending'], ['Disputes & support', '/admin/support', 'message', false, 'disputesOpen'], ['Fraud', '/admin/fraud', 'alert', false, 'fraudOpen'], ['Audit log', '/admin/audit', 'doc']]],
];

function AdminNavList({ path, counts }) {
  return ADMIN_NAV.map(([g, items]) => html`<div class="grp">
    <p class="grp-l">${g}</p>
    ${items.map(([l, h, ic, exact, countKey]) => html`<a href=${'#' + h} aria-current=${isActive(path, h, exact) ? 'page' : undefined}><${Icon} name=${ic} />${l}${countKey && counts?.[countKey] ? html`<${Badge} tone="warn">${counts[countKey]}<//>` : ''}</a>`)}
  </div>`);
}

export function AdminShell({ path, children, counts, title = 'Admin' }) {
  const { user, signOut } = useSession();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  return html`<div class="admin">
    <aside class="admin-side" aria-label="Admin">
      <div style="padding:0 8px"><${Wordmark} href="/admin" size=${24} /><p class="xs muted mt-2">${title} console</p></div>
      <${AdminNavList} path=${path} counts=${counts} />
      <div class="grp" style="margin-top:auto">
        <a href="#/app"><${Icon} name="chevL" />Back to the app</a>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="admin-top">
        <span class="mob-only"><${IconButton} icon="menu" label="Open navigation" onClick=${() => setDrawer(true)} /></span>
        <span class="mob-only"><${Wordmark} href="/admin" size=${22} /></span>
        <span class="demo-pill">Demo data</span>
        <div class="row tight" style="margin-left:auto">
          <span class="small muted tab-up">${user?.username} · ${user?.role}</span>
          <${IconButton} icon="logout" label="Log out" onClick=${async () => { await signOut(); navigate('/login'); }} />
        </div>
      </header>
      <main class="admin-main" id="main">${children}</main>
    </div>
    ${drawer && html`<div><div class="scrim" onClick=${() => setDrawer(false)}></div><nav class="drawer" aria-label="Admin"><${Wordmark} href="/admin" size=${24} /><${AdminNavList} path=${path} counts=${counts} /><div class="grp"><a href="#/app"><${Icon} name="chevL" />Back to the app</a></div></nav></div>`}
  </div>`;
}
