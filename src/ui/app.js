import { html, useState, useEffect, Component } from '../lib/preact.js';
import { useLocation, matchRoute, navigate } from './router.js';
import { SessionCtx, useSessionState, useRpc } from './hooks.js';
import { AppShell, AdminShell, Wordmark } from './components/shell.js';
import { Toasts, Empty, Button, Sk } from './components/base.js';

// Route table. Screens load on demand (one module per area).
const S = (path, name = 'default') => ({ path, name });
const ROUTES = [
  ['/', S('landing'), 'public'],
  ['/login', S('auth', 'Login'), 'guest'],
  ['/signup', S('auth', 'Signup'), 'guest'],
  ['/onboarding', S('auth', 'Onboarding'), 'onboarding'],

  ['/app', S('home'), 'app'],
  ['/app/play', S('play', 'PlayHub'), 'app'],
  ['/app/games', S('play', 'Games'), 'app'],
  ['/app/games/:slug', S('play', 'GameDetail'), 'app'],
  ['/app/challenges', S('compete', 'Challenges'), 'app'],
  ['/app/h2h', S('compete', 'H2H'), 'app'],
  ['/app/compete/:id', S('compete', 'CompetitionDetail'), 'app'],
  ['/app/match/:id', S('match', 'MatchRoom'), 'app'],
  ['/app/tournaments', S('tournaments', 'Tournaments'), 'app'],
  ['/app/tournaments/:id', S('tournaments', 'TournamentDetail'), 'app'],
  ['/app/arcade', S('arcade', 'Arcade'), 'app'],
  ['/app/arcade/:id', S('arcade', 'ArcadeGame'), 'app'],
  ['/app/teams', S('teams', 'Teams'), 'app'],
  ['/app/teams/:id', S('teams', 'TeamDetail'), 'app'],
  ['/app/missions', S('missions', 'Missions'), 'app'],
  ['/app/missions/:id', S('missions', 'MissionDetail'), 'app'],
  ['/app/leaderboards', S('social', 'Leaderboards'), 'app'],
  ['/app/bigstack', S('bigstack'), 'app'],
  ['/app/players', S('markets', 'BackPlayers'), 'app'],
  ['/app/predictions', S('markets', 'Predictions'), 'app'],
  ['/app/u/:username', S('social', 'Profile'), 'app'],
  ['/app/profile', S('social', 'Profile'), 'app'],
  ['/app/search', S('social', 'Search'), 'app'],
  ['/app/notifications', S('social', 'Notifications'), 'app'],
  ['/app/wallet', S('wallet', 'Wallet'), 'app'],
  ['/app/wallet/tx/:id', S('wallet', 'TxDetail'), 'app'],
  ['/app/settings', S('account', 'Settings'), 'app'],
  ['/app/fairplay', S('account', 'FairPlay'), 'app'],
  ['/app/disputes/:id', S('account', 'DisputeDetail'), 'app'],
  ['/app/support', S('account', 'Support'), 'app'],

  ['/sponsor', S('admin/sponsors', 'SponsorPortal'), 'sponsor'],
  ['/admin', S('admin/overview'), 'admin'],
  ['/admin/users', S('admin/users', 'Users'), 'admin'],
  ['/admin/users/:id', S('admin/users', 'UserDetail'), 'admin'],
  ['/admin/games', S('admin/games', 'GamesAdmin'), 'admin'],
  ['/admin/games/:id', S('admin/games', 'GameEditor'), 'admin'],
  ['/admin/competitions', S('admin/competitions', 'CompetitionsAdmin'), 'admin'],
  ['/admin/tournaments', S('admin/competitions', 'TournamentsAdmin'), 'admin'],
  ['/admin/markets', S('admin/competitions', 'MarketsAdmin'), 'admin'],
  ['/admin/wallet', S('admin/wallet', 'WalletAdmin'), 'admin'],
  ['/admin/sponsors', S('admin/sponsors', 'SponsorsAdmin'), 'admin'],
  ['/admin/bigstack', S('admin/bigstack', 'BigStackAdmin'), 'admin'],
  ['/admin/compliance', S('admin/trust', 'Compliance'), 'admin'],
  ['/admin/support', S('admin/trust', 'SupportAdmin'), 'admin'],
  ['/admin/fraud', S('admin/trust', 'Fraud'), 'admin'],
  ['/admin/audit', S('admin/trust', 'Audit'), 'admin'],
];

const modCache = new Map();
function loadModule(path) {
  if (!modCache.has(path)) modCache.set(path, import(`./screens/${path}.js`));
  return modCache.get(path);
}

class Boundary extends Component {
  constructor() {
    super();
    this.state = { error: null };
  }
  componentDidCatch(error) {
    console.error(error);
    this.setState({ error });
  }
  render() {
    if (this.state.error)
      return html`<div class="container page"><${Empty} icon="alert" title="This screen hit a snag" body=${String(this.state.error?.message || this.state.error)} action=${html`<${Button} onClick=${() => location.reload()}>Reload<//>`} /></div>`;
    return this.props.children;
  }
}

function Screen({ spec, params, query, path }) {
  // Remember which route the loaded component belongs to, so the previous screen is never rendered with the
  // next route's params while the next module loads (it would fire requests with missing ids).
  const [loaded, setLoaded] = useState(null);
  const [err, setErr] = useState(null);
  const id = `${spec.path}#${spec.name}`;
  useEffect(() => {
    let alive = true;
    setErr(null);
    loadModule(spec.path)
      .then((m) => alive && setLoaded({ id, Comp: m[spec.name] }))
      .catch((e) => alive && setErr(e));
    return () => {
      alive = false;
    };
  }, [spec.path, spec.name]);
  const Comp = loaded?.id === id ? loaded.Comp : null;
  if (err) return html`<div class="container page"><${Empty} icon="alert" title="Couldn't load this screen" body=${err.message} /></div>`;
  if (!Comp) return html`<div class="container page stack"><${Sk} h=${42} w="40%" /><${Sk} h=${220} r="14" /><${Sk} h=${220} r="14" /></div>`;
  return html`<${Boundary} key=${path}><${Comp} params=${params} query=${query} path=${path} /><//>`;
}

function NotFound() {
  return html`<div class="container page" style="padding-top:12vh">
    <h1 class="display" style="font-size:var(--d-2)">Wrong lobby.</h1>
    <p class="muted mt-4">That page doesn't exist or moved.</p>
    <div class="row mt-6"><${Button} href="/app">Back to home<//></div>
  </div>`;
}

function AdminLayout({ path, children, title }) {
  const q = useRpc('admin.overview');
  return html`<${AdminShell} path=${path} counts=${q.data?.kpis} title=${title}>${children}<//>`;
}

function SponsorLayout({ children }) {
  return html`<div class="app">
    <header class="topbar"><div class="container topbar-in">
      <${Wordmark} href="/sponsor" /><span class="small muted">Sponsor dashboard</span>
      <div class="topbar-right"><span class="demo-pill">Demo data</span><a class="btn btn-ghost btn-sm" href="#/app">Open the app</a></div>
    </div></header>
    <main class="main" id="main">${children}</main>
  </div>`;
}

function Router() {
  const { path, query } = useLocation();
  const session = useSessionState();
  const { user, ready } = session;

  let found = null;
  for (const [pattern, spec, guard] of ROUTES) {
    const params = matchRoute(pattern, path);
    if (params) {
      found = { spec, params, guard };
      break;
    }
  }

  // Guards (decided after the session is known)
  let redirect = null;
  if (ready && found) {
    const g = found.guard;
    if (['app', 'admin', 'sponsor', 'onboarding'].includes(g) && !user) redirect = `/login?next=${encodeURIComponent(path)}`;
    else if (g === 'guest' && user) redirect = user.onboarded ? '/app' : '/onboarding';
    else if (g === 'app' && user && !user.onboarded && user.role === 'player') redirect = '/onboarding';
    else if (g === 'onboarding' && user?.onboarded) redirect = '/app';
  }
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  const body = () => {
    if (!ready) return html`<div class="boot"><span class="boot-mark">STACKD</span></div>`;
    if (redirect) return null;
    if (!found) return user ? html`<${AppShell} path=${path}><${NotFound} /><//>` : html`<${NotFound} />`;
    const screen = html`<${Screen} spec=${found.spec} params=${found.params} query=${query} path=${path} />`;
    if (found.guard === 'app') return html`<${AppShell} path=${path}>${user?.status === 'suspended' ? html`<div class="container" style="padding-top:16px"><div class="notice err"><p><strong>Your account is suspended.</strong> You can browse, but you can't enter competitions or move money. Contact support.</p></div></div>` : null}${screen}<//>`;
    if (found.guard === 'admin') {
      if (!['admin', 'referee'].includes(user.role)) return html`<div class="container page"><${Empty} icon="lock" title="Admins only" body="Your account doesn't have access to the admin console." action=${html`<${Button} href="/app">Back to the app<//>`} /></div>`;
      return html`<${AdminLayout} path=${path}>${screen}<//>`;
    }
    if (found.guard === 'sponsor') {
      if (!['sponsor', 'admin'].includes(user.role)) return html`<div class="container page"><${Empty} icon="lock" title="Sponsors only" body="This dashboard is for brand partners." action=${html`<${Button} href="/app">Back to the app<//>`} /></div>`;
      return html`<${SponsorLayout}>${screen}<//>`;
    }
    return screen;
  };

  return html`<${SessionCtx.Provider} value=${session}>
    ${body()}
    <${Toasts} />
  <//>`;
}

export function App() {
  return html`<${Router} />`;
}
