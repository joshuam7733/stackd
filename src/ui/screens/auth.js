import { html, useState } from '../../lib/preact.js';
import { rpc } from '../../client/api.js';
import { useSession, useRpc, toast } from '../hooks.js';
import { navigate, parse } from '../router.js';
import { Icon } from '../icons.js';
import { Wordmark } from '../components/shell.js';
import { Button, Input, Select, Notice, Sk } from '../components/base.js';
import { GameArt } from '../components/game.js';
import { MotionBackdrop } from '../components/backdrop.js';
import { PLATFORM } from '../format.js';

function AuthSide({ phrase = 'Play for the bag.' }) {
  const games = useRpc('games.list', {}, { live: false }).data || [];
  return html`<aside class="auth-side">
    <${MotionBackdrop} height="100%" />
    <${Wordmark} href="/" size=${30} />
    <div class="auth-collage" aria-hidden="true">
      ${games.slice(0, 6).map((g, i) => html`<${GameArt} game=${g} style=${`--r:${[-4, 3, -2, 5, -3, 2][i]}deg`} />`)}
    </div>
    <h2 class="display" style="font-size:clamp(64px,7vw,120px);position:relative">${phrase}</h2>
  </aside>`;
}

const OAUTH_ERRORS = {
  google_unavailable: 'Google sign-in is not configured on this server yet. Use email and password for now.',
  oauth_cancelled: 'Google sign-in was cancelled. Try again or use email and password.',
  oauth_expired: 'That sign-in link expired. Start again.',
  oauth_failed: "We couldn't confirm your Google account. Try again.",
  oauth_no_email: 'Your Google account did not share an email address, which STACKD needs.',
  oauth_email_in_use: 'That email is already on a STACKD account. Log in with your password.',
};

function SocialSignIn({ next }) {
  const providers = useRpc('auth.providers', {}, { live: false }).data;
  const google = providers?.google;
  const go = () => (location.href = `/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return html`<div class="stack tight">
    <${Button} variant="secondary" size="lg" block icon="globe" disabled=${!google?.enabled} onClick=${go}>Continue with Google<//>
    ${providers && !google?.enabled && html`<p class="xs muted center">${providers.demoBuild ? 'Google sign-in needs the full STACKD server. This online preview uses email and password.' : "Google sign-in isn't switched on for this server yet. Email and password work now."}</p>`}
  </div>`;
}

function OAuthError() {
  const code = parse().query.error;
  return code && OAUTH_ERRORS[code] ? html`<${Notice} tone="err">${OAUTH_ERRORS[code]}<//>` : null;
}

function DemoAccess({ next }) {
  const { signIn } = useSession();
  const meta = useRpc('meta.get', {}, { live: false }).data;
  const [busy, setBusy] = useState(null);
  if (meta && !meta.demoLogins) return null;
  const go = async (as) => {
    setBusy(as);
    try {
      const r = await rpc('auth.demo', { as });
      signIn(r.token, r.user);
      navigate(as === 'admin' ? '/admin' : as === 'sponsor' ? '/sponsor' : next || '/app');
    } catch (e) {
      toast.err("Couldn't open the demo account", e.message);
    } finally {
      setBusy(null);
    }
  };
  return html`<div class="stack tight">
    <div class="divider-label">Or jump straight in</div>
    <div class="demo-access">
      <button type="button" class="opt-tile" onClick=${() => go('player')} disabled=${!!busy}>
        <${Icon} name="play" /><div class="grow"><p class="strong small">Demo player</p><p class="xs muted">nilewave, Gold rank, history and a team</p></div>${busy === 'player' ? html`<span class="spin"></span>` : html`<${Icon} name="chevR" />`}
      </button>
      <button type="button" class="opt-tile" onClick=${() => go('admin')} disabled=${!!busy}>
        <${Icon} name="grid" /><div class="grow"><p class="strong small">Admin console</p><p class="xs muted">Operations, compliance, payouts</p></div>${busy === 'admin' ? html`<span class="spin"></span>` : html`<${Icon} name="chevR" />`}
      </button>
      <button type="button" class="opt-tile" onClick=${() => go('sponsor')} disabled=${!!busy}>
        <${Icon} name="megaphone" /><div class="grow"><p class="strong small">Sponsor dashboard</p><p class="xs muted">FIZZUP campaigns and mission builder</p></div>${busy === 'sponsor' ? html`<span class="spin"></span>` : html`<${Icon} name="chevR" />`}
      </button>
    </div>
  </div>`;
}

export function Login() {
  const { signIn } = useSession();
  const next = parse().query.next;
  const [f, setF] = useState({ login: '', password: '' });
  const [err, setErr] = useState({});
  const [formErr, setFormErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const validate = (k, v = f[k]) => {
    const e = { ...err };
    if (k === 'login') e.login = v.trim().length < 3 ? 'Enter your email or username.' : null;
    if (k === 'password') e.password = !v ? 'Enter your password.' : null;
    setErr(e);
    return !e[k];
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = [validate('login'), validate('password')].every(Boolean);
    if (!ok) return;
    setBusy(true);
    setFormErr(null);
    try {
      const r = await rpc('auth.login', f);
      signIn(r.token, r.user);
      navigate(r.user.role === 'admin' ? '/admin' : r.user.role === 'sponsor' ? '/sponsor' : next || '/app');
    } catch (e2) {
      setFormErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="auth-wrap">
    <${AuthSide} phrase="Run it back." />
    <div class="auth-main">
      <div class="mob-only"><${Wordmark} href="/" /></div>
      <form class="auth-card" onSubmit=${submit} novalidate>
        <div><h1 class="h1">Log in</h1><p class="muted mt-2">New here? <a class="link" href="#/signup">Create an account</a></p></div>
        <${OAuthError} />
        ${formErr && html`<${Notice} tone="err">${formErr}<//>`}
        <${SocialSignIn} next=${next} />
        <div class="divider-label">Or with email</div>
        <${Input} label="Email or username" autocomplete="username" value=${f.login} error=${err.login} onInput=${(v) => { setF({ ...f, login: v }); if (err.login) validate('login', v); }} onBlur=${() => validate('login')} />
        <${Input} label="Password" type="password" autocomplete="current-password" value=${f.password} error=${err.password} onInput=${(v) => { setF({ ...f, password: v }); if (err.password) validate('password', v); }} onBlur=${() => validate('password')} hint="Demo accounts use demo1234." />
        <${Button} type="submit" size="lg" block loading=${busy}>Log in<//>
        <${DemoAccess} next=${next} />
      </form>
    </div>
  </div>`;
}

export function Signup() {
  const { signIn } = useSession();
  const meta = useRpc('meta.get', {}, { live: false }).data;
  const [f, setF] = useState({ email: '', username: '', password: '', dob: '', country: 'UG', terms: false });
  const [err, setErr] = useState({});
  const [formErr, setFormErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const age = f.dob ? Math.floor((Date.now() - new Date(f.dob).getTime()) / (365.25 * 86400000)) : null;

  const rules = {
    email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Enter a valid email address.'),
    username: (v) => (v.length < 3 ? 'At least 3 characters.' : v.length > 16 ? 'At most 16 characters.' : /^[A-Za-z0-9_.]+$/.test(v) ? null : 'Letters, numbers, dots and underscores only.'),
    password: (v) => (v.length < 8 ? 'At least 8 characters.' : null),
    dob: (v) => (!v ? 'Enter your date of birth.' : age < 13 ? 'You need to be 13 or older to use STACKD.' : null),
    terms: (v) => (v ? null : 'Accept the terms to continue.'),
  };
  const check = (k, v = f[k]) => {
    const m = rules[k]?.(v) || null;
    setErr((e) => ({ ...e, [k]: m }));
    return !m;
  };
  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }));
    if (err[k]) check(k, v);
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = Object.keys(rules).map((k) => check(k)).every(Boolean);
    if (!ok) return;
    setBusy(true);
    setFormErr(null);
    try {
      const { terms, ...payload } = f;
      const r = await rpc('auth.signup', payload);
      signIn(r.token, r.user);
      navigate('/onboarding');
    } catch (e2) {
      if (e2.details?.path) setErr((x) => ({ ...x, [e2.details.path.split('.').pop()]: e2.message }));
      else setFormErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="auth-wrap">
    <${AuthSide} phrase="Play for the bag." />
    <div class="auth-main">
      <div class="mob-only"><${Wordmark} href="/" /></div>
      <form class="auth-card" onSubmit=${submit} novalidate>
        <div><h1 class="h1">Get in the game</h1><p class="muted mt-2">Already have an account? <a class="link" href="#/login">Log in</a></p></div>
        <${Notice} tone="info" title="Demo mode">You start with UGX ${(meta?.starterStack ?? 100000).toLocaleString()} DEMO in your wallet. Nothing here touches real money.<//>
        <${OAuthError} />
        ${formErr && html`<${Notice} tone="err">${formErr}<//>`}
        <${SocialSignIn} />
        <div class="divider-label">Or with email</div>
        <${Input} label="Email" type="email" autocomplete="email" value=${f.email} error=${err.email} onInput=${set('email')} onBlur=${() => f.email && check('email')} />
        <${Input} label="Username" autocomplete="username" value=${f.username} error=${err.username} onInput=${set('username')} onBlur=${() => f.username && check('username')} hint="This is your gamer tag on STACKD. 3–16 characters." />
        <${Input} label="Password" type="password" autocomplete="new-password" value=${f.password} error=${err.password} onInput=${set('password')} onBlur=${() => f.password && check('password')} hint="8 characters or more." />
        <div class="form-grid">
          <${Input} label="Date of birth" type="date" value=${f.dob} error=${err.dob} onInput=${set('dob')} onBlur=${() => f.dob && check('dob')} max=${new Date().toISOString().slice(0, 10)} />
          ${meta ? html`<${Select} label="Country" value=${f.country} onChange=${set('country')} options=${meta.countries.map((c) => ({ value: c.code, label: c.name }))} />` : html`<${Sk} h=${70} />`}
        </div>
        ${age != null && age >= 13 && age < 18 && html`<${Notice} tone="warn" title="Free play only until you're 18">Free competitions, missions and arcade practice are all open to you. Paid entries unlock at 18.<//>`}
        <label class="row top small" style="gap:10px;cursor:pointer">
          <input type="checkbox" checked=${f.terms} onChange=${(e) => { setF({ ...f, terms: e.currentTarget.checked }); check('terms', e.currentTarget.checked); }} style="width:18px;height:18px;margin-top:2px;accent-color:var(--secondary)" />
          <span class="muted">I agree to the Terms, Fair Play Policy and Privacy Policy, and confirm my details are accurate.</span>
        </label>
        ${err.terms && html`<p class="error-msg" role="alert">${err.terms}</p>`}
        <${Button} type="submit" size="lg" block loading=${busy}>Create account<//>
        <${DemoAccess} />
      </form>
    </div>
  </div>`;
}

const COLORS = ['#5B6CFF', '#3DDC97', '#FF6B3D', '#FFB547', '#59A8FF', '#C77DFF', '#FF5468', '#2EC4B6'];

export function Onboarding() {
  const { user, refresh } = useSession();
  const games = useRpc('games.list', {}, { live: false });
  const meta = useRpc('meta.get', {}, { live: false }).data;
  // Accounts created with Google arrive without a username, date of birth or country: ask for those first.
  const needProfile = user?.profileComplete === false;
  const [step, setStep] = useState(needProfile ? -1 : 0);
  const [profile, setProfile] = useState({ username: user?.username || '', dob: '', country: 'UG' });
  const [pErr, setPErr] = useState({});
  const [picked, setPicked] = useState([]);
  const [platforms, setPlatforms] = useState(['mobile']);
  const [color, setColor] = useState(user?.avatar?.color || COLORS[0]);
  const [ids, setIds] = useState({});
  const [busy, setBusy] = useState(false);
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const visible = (games.data || []).filter((g) => g.platforms.some((p) => platforms.includes(p)));
  const finish = async () => {
    setBusy(true);
    try {
      await rpc('account.onboard', { games: picked, platforms, avatarColor: color, inGameIds: ids, ...(needProfile ? profile : {}) });
      await refresh();
      toast.ok("You're in", 'Your demo wallet is loaded. Play for the bag.');
      navigate('/app');
    } catch (e) {
      if (needProfile && e.details?.path) {
        setPErr({ [e.details.path.split('.').pop()]: e.message });
        setStep(-1);
      }
      toast.err("Couldn't save that", e.message);
    } finally {
      setBusy(false);
    }
  };
  const checkProfile = () => {
    const years = profile.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 86400000)) : null;
    const e = {
      username: profile.username.length < 3 || profile.username.length > 16 ? '3 to 16 characters.' : /^[A-Za-z0-9_.]+$/.test(profile.username) ? null : 'Letters, numbers, dots and underscores only.',
      dob: !profile.dob ? 'Enter your date of birth.' : years < 13 ? 'You need to be 13 or older to use STACKD.' : null,
    };
    setPErr(e);
    if (!e.username && !e.dob) setStep(0);
  };
  const steps = needProfile ? ['About you', 'Platforms', 'Games', 'Your identity'] : ['Platforms', 'Games', 'Your identity'];
  const at = step + (needProfile ? 1 : 0);
  return html`<div class="container" style="max-width:860px;padding-top:var(--s-6);padding-bottom:var(--s-16)">
    <div class="row between"><${Wordmark} href="/" /><span class="small muted">Step ${at + 1} of ${steps.length}</span></div>
    <div class="onb-steps" aria-hidden="true">${steps.map((s, i) => html`<span class=${i <= at ? 'on' : ''}></span>`)}</div>

    ${step === -1 && html`<div class="stack loose">
      <div><h1 class="h1">Set up your player card.</h1><p class="muted mt-2">You signed in with Google. Pick the gamer tag opponents will see, and confirm your age and country so we only show competitions you can enter.</p></div>
      <div class="card pad-lg stack">
        <${Input} label="Username" autocomplete="username" value=${profile.username} error=${pErr.username} onInput=${(v) => setProfile({ ...profile, username: v })} hint="Your gamer tag on STACKD. 3–16 characters." />
        <div class="form-grid">
          <${Input} label="Date of birth" type="date" value=${profile.dob} error=${pErr.dob} onInput=${(v) => setProfile({ ...profile, dob: v })} max=${new Date().toISOString().slice(0, 10)} />
          ${meta ? html`<${Select} label="Country" value=${profile.country} onChange=${(v) => setProfile({ ...profile, country: v })} options=${meta.countries.map((c) => ({ value: c.code, label: c.name }))} />` : html`<${Sk} h=${70} />`}
        </div>
      </div>
      <div class="row end"><${Button} size="lg" onClick=${checkProfile} iconRight="arrowR">Continue<//></div>
    </div>`}

    ${step === 0 && html`<div class="stack loose">
      <div><h1 class="h1">Where do you play?</h1><p class="muted mt-2">Pick everything you play on. We'll only show competitions you can actually enter.</p></div>
      <div class="grid-2">
        ${['mobile', 'pc', 'playstation', 'xbox'].map((p) => html`<button type="button" class="opt-tile" aria-pressed=${platforms.includes(p) ? 'true' : 'false'} onClick=${() => toggle(platforms, setPlatforms, p)} style="padding:18px">
          <${Icon} name=${p === 'mobile' ? 'phone' : p === 'pc' ? 'grid' : 'joystick'} />
          <span class="strong">${PLATFORM[p]}</span>
          <span class="check"><${Icon} name="check" /></span>
        </button>`)}
      </div>
      <div class="row end"><${Button} size="lg" disabled=${!platforms.length} onClick=${() => setStep(1)} iconRight="arrowR">Continue<//></div>
    </div>`}

    ${step === 1 && html`<div class="stack loose">
      <div><h1 class="h1">What are you good at?</h1><p class="muted mt-2">Pick at least one. Your home feed, matchmaking and missions follow these.</p></div>
      ${games.loading ? html`<div class="grid-4">${Array.from({ length: 8 }, () => html`<${Sk} h=${200} r="14" />`)}</div>` : html`<div class="onb-games">
        ${visible.map((g) => html`<button type="button" class="onb-game" aria-pressed=${picked.includes(g.id) ? 'true' : 'false'} onClick=${() => toggle(picked, setPicked, g.id)}>
          <${GameArt} game=${g} />
          <span class="onb-check"><${Icon} name="check" /></span>
          <span class="small strong truncate" style="display:block;margin-top:8px">${g.name}</span>
        </button>`)}
      </div>`}
      <div class="row between"><${Button} variant="ghost" icon="chevL" onClick=${() => setStep(0)}>Back<//><${Button} size="lg" disabled=${!picked.length} onClick=${() => setStep(2)} iconRight="arrowR">Continue${picked.length ? ` (${picked.length})` : ''}<//></div>
    </div>`}

    ${step === 2 && html`<div class="stack loose">
      <div><h1 class="h1">Make it yours.</h1><p class="muted mt-2">Pick a colour and link your in-game IDs. Opponents use these to find you, and we use them to verify results.</p></div>
      <div class="card pad-lg row" style="gap:var(--s-5);flex-wrap:wrap">
        <span class="avatar xl" style=${`background:${color}`}>${(user?.username || '?').slice(0, 2)}</span>
        <div class="stack tight">
          <p class="h3">${user?.username}</p>
          <div class="row tight" role="radiogroup" aria-label="Avatar colour">${COLORS.map((c) => html`<button type="button" role="radio" aria-checked=${c === color} aria-label=${c} onClick=${() => setColor(c)} style=${`width:30px;height:30px;border-radius:50%;background:${c};box-shadow:${c === color ? '0 0 0 2px var(--bg), 0 0 0 4px var(--text)' : 'none'}`}></button>`)}</div>
        </div>
      </div>
      <div class="form-grid">
        ${picked.map((id) => {
          const g = games.data.find((x) => x.id === id);
          return html`<${Input} label=${`${g.name} ID`} optional placeholder="In-game ID or tag" value=${ids[id] || ''} onInput=${(v) => setIds({ ...ids, [id]: v })} />`;
        })}
      </div>
      <div class="row between"><${Button} variant="ghost" icon="chevL" onClick=${() => setStep(1)}>Back<//><${Button} size="lg" loading=${busy} onClick=${finish}>Enter STACKD<//></div>
    </div>`}
  </div>`;
}
