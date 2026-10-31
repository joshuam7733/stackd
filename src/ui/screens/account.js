import { html, useState, useEffect } from '../../lib/preact.js';
import { useRpc, useAction, useSession, useMeta, toast } from '../hooks.js';
import { navigate, setQuery } from '../router.js';
import { Icon } from '../icons.js';
import { Button, Badge, Tabs, Seg, Chips, Empty, Async, Sk, PageHead, Notice, Input, Select, Textarea, Toggle, Confirm, ListSkeleton, Who } from '../components/base.js';
import { resetDemo } from '../components/shell.js';
import { EvidencePicker } from './match.js';
import { money, ago, when, PLATFORM, STATUS } from '../format.js';

const COLORS = ['#5B6CFF', '#3DDC97', '#FF6B3D', '#FFB547', '#59A8FF', '#C77DFF', '#FF5468', '#2EC4B6'];

function ProfileTab() {
  const { user, refresh } = useSession();
  const games = useRpc('games.list', {}, { live: false });
  const [f, setF] = useState({ bio: user.bio || '', avatarColor: user.avatar.color, games: user.games, platforms: user.platforms, inGameIds: user.inGameIds || {} });
  const save = useAction('account.update', { success: 'Profile saved', onSuccess: refresh });
  const toggle = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  return html`<div class="stack loose" style="max-width:720px">
    <div class="card pad-lg stack">
      <div class="row"><span class="avatar xl" style=${`background:${f.avatarColor}`}>${user.username.slice(0, 2)}</span>
        <div class="stack tight"><p class="h3">${user.username}</p><p class="xs muted">${user.email}</p>
          <div class="row tight" role="radiogroup" aria-label="Avatar colour">${COLORS.map((c) => html`<button type="button" role="radio" aria-checked=${f.avatarColor === c} aria-label=${c} onClick=${() => setF({ ...f, avatarColor: c })} style=${`width:26px;height:26px;border-radius:50%;background:${c};box-shadow:${f.avatarColor === c ? '0 0 0 2px var(--surface),0 0 0 4px var(--text)' : 'none'}`}></button>`)}</div>
        </div>
      </div>
      <${Textarea} label="Bio" optional value=${f.bio} maxlength="120" onInput=${(v) => setF({ ...f, bio: v })} />
    </div>
    <div class="card pad-lg stack">
      <p class="strong">Platforms</p>
      <div class="chips" style="flex-wrap:wrap">${Object.entries(PLATFORM).map(([k, l]) => html`<button type="button" class="chip" aria-pressed=${f.platforms.includes(k) ? 'true' : 'false'} onClick=${() => toggle('platforms', k)}>${l}</button>`)}</div>
      <p class="strong mt-4">Games</p>
      <div class="chips" style="flex-wrap:wrap">${(games.data || []).map((g) => html`<button type="button" class="chip" aria-pressed=${f.games.includes(g.id) ? 'true' : 'false'} onClick=${() => toggle('games', g.id)}>${g.short}</button>`)}</div>
    </div>
    <div class="card pad-lg stack">
      <p class="strong">In-game IDs</p><p class="small muted">Used by opponents to add you and by us to verify results.</p>
      <div class="form-grid">${f.games.map((id) => html`<${Input} label=${(games.data || []).find((g) => g.id === id)?.name || id} value=${f.inGameIds[id] || ''} onInput=${(v) => setF({ ...f, inGameIds: { ...f.inGameIds, [id]: v } })} />`)}</div>
    </div>
    <div><${Button} size="lg" loading=${save.pending} disabled=${!f.platforms.length} onClick=${() => save.run(f)}>Save changes<//></div>
  </div>`;
}

function VerifyTab() {
  const { user, refresh } = useSession();
  const [docType, setDocType] = useState('national_id');
  const [doc, setDoc] = useState([]);
  const [selfie, setSelfie] = useState([]);
  const submit = useAction('account.kycSubmit', { success: 'Verification submitted', onSuccess: refresh });
  const k = user.kyc;
  return html`<div class="stack" style="max-width:640px">
    <div class="card pad-lg stack">
      <div class="row between"><p class="strong">Identity verification</p><${Badge} tone=${k.status === 'verified' ? 'money' : k.status === 'pending' ? 'warn' : k.status === 'rejected' ? 'err' : ''}>${{ verified: 'Verified', pending: 'In review', rejected: 'Needs another try', none: 'Not started' }[k.status]}<//></div>
      <p class="small muted">Required before withdrawals and higher limits. We check your age and that the account is yours. Documents are encrypted and only reviewed by the compliance team.</p>
      ${k.status === 'verified' ? html`<${Notice} tone="ok" title="You're verified">Level ${k.level}. Withdrawals are unlocked.<//>`
        : k.status === 'pending' ? html`<${Notice} tone="info" title="In review">Submitted ${ago(k.submittedAt)}. In the demo this clears in about 20 seconds.<//>`
        : html`<div class="stack">
          ${k.status === 'rejected' && html`<${Notice} tone="err" title="Last attempt was rejected">${k.note || 'The photo was unreadable.'}<//>`}
          <${Select} label="Document" value=${docType} onChange=${setDocType} options=${[{ value: 'national_id', label: 'National ID' }, { value: 'passport', label: 'Passport' }, { value: 'driving_permit', label: 'Driving permit' }]} />
          <div><p class="label mb-2">Photo of your document</p><${EvidencePicker} value=${doc} onChange=${setDoc} required /></div>
          <div><p class="label mb-2">A selfie holding it</p><${EvidencePicker} value=${selfie} onChange=${setSelfie} required /></div>
          <${Button} size="lg" loading=${submit.pending} disabled=${!doc.length || !selfie.length} onClick=${() => submit.run({ docType, docName: doc[0].name, selfieName: selfie[0].name })}>Submit for review<//>
          <p class="xs faint">Demo: any image works. Nothing leaves your browser.</p>
        </div>`}
    </div>
  </div>`;
}

function PlayTab() {
  const { user, refresh } = useSession();
  const [dep, setDep] = useState(user.limits.dailyDeposit || '');
  const [ent, setEnt] = useState(user.limits.dailyEntry || '');
  const [cool, setCool] = useState(null);
  const [excl, setExcl] = useState(null);
  const limits = useAction('account.setLimits', { success: 'Limits saved', onSuccess: refresh });
  const coolOff = useAction('account.coolOff', { success: 'Break started', onSuccess: () => { setCool(null); refresh(); } });
  const exclude = useAction('account.selfExclude', { success: 'Self-exclusion active', onSuccess: () => { setExcl(null); refresh(); } });
  const now = Date.now();
  return html`<div class="stack loose" style="max-width:720px">
    <${Notice} tone="info" title="Play for fun first">Set limits that fit you. Lowering a limit is instant; raising one takes 24 hours. Need to talk to someone? Support is in the menu.<//>
    <div class="card pad-lg stack">
      <p class="strong">Daily limits</p>
      <div class="form-grid">
        <${Input} label="Deposit limit" prefix="UGX" inputmode="numeric" value=${dep} onInput=${(v) => setDep(v.replace(/[^0-9]/g, ''))} hint=${`Country maximum ${money(user.jurisdiction?.dailyDepositLimit || 0)}`} />
        <${Input} label="Entry limit" prefix="UGX" inputmode="numeric" value=${ent} onInput=${(v) => setEnt(v.replace(/[^0-9]/g, ''))} hint="Total paid entries per day" />
      </div>
      ${user.limits.pending && html`<${Notice} tone="warn">A higher limit takes effect ${when(user.limits.pending.effectiveAt)}.<//>`}
      <div><${Button} loading=${limits.pending} onClick=${() => limits.run({ dailyDeposit: dep ? Number(dep) : undefined, dailyEntry: ent ? Number(ent) : undefined })}>Save limits<//></div>
    </div>
    <div class="card pad-lg stack">
      <p class="strong">Take a break</p>
      <p class="small muted">Pauses deposits and paid entries. Free play and withdrawals stay open.</p>
      ${user.coolOffUntil > now ? html`<${Notice} tone="warn">On a break until ${new Date(user.coolOffUntil).toLocaleString()}.<//>`
        : html`<div class="row wrap">${[24, 72, 168].map((h) => html`<${Button} variant="secondary" onClick=${() => setCool(h)}>${h === 168 ? '7 days' : `${h / 24} day${h > 24 ? 's' : ''}`}<//>`)}</div>`}
    </div>
    <div class="card pad-lg stack">
      <p class="strong">Self-exclusion</p>
      <p class="small muted">Blocks all paid play for the period you pick. It can't be undone early.</p>
      ${user.selfExcludedUntil > now ? html`<${Notice} tone="err">Self-excluded until ${new Date(user.selfExcludedUntil).toLocaleDateString()}.<//>`
        : html`<div class="row wrap">${[1, 3, 6, 12].map((m) => html`<${Button} variant="danger" onClick=${() => setExcl(m)}>${m} month${m > 1 ? 's' : ''}<//>`)}</div>`}
    </div>
    <${Confirm} open=${!!cool} onClose=${() => setCool(null)} pending=${coolOff.pending} title="Start a break?" body=${`Deposits and paid entries pause for ${cool === 168 ? '7 days' : `${(cool || 0) / 24} day(s)`}.`} confirmLabel="Start break" onConfirm=${() => coolOff.run({ hours: cool })} />
    <${Confirm} open=${!!excl} onClose=${() => setExcl(null)} pending=${exclude.pending} title=${`Self-exclude for ${excl} month(s)?`} body="All paid play stops for the full period. This can't be reversed early." confirmLabel="Self-exclude" tone="danger" onConfirm=${() => exclude.run({ months: excl })} />
  </div>`;
}

function RegionTab() {
  const { user, refresh } = useSession();
  const meta = useMeta().data;
  const set = useAction('account.simulateCountry', { success: 'Region updated', onSuccess: refresh });
  const j = user.jurisdiction || {};
  const row = (label, on) => html`<div class="li"><span class="grow small">${label}</span><${Badge} tone=${on ? 'money' : 'err'}>${on ? 'Available' : 'Off'}<//></div>`;
  return html`<div class="stack" style="max-width:640px">
    <div class="card pad-lg stack">
      <p class="strong">Your region: ${user.countryName}</p>
      <div class="list">
        ${row('STACKD', j.enabled)}${row('Paid entries (real money when live)', j.realMoney)}${row('Back a player', j.staking)}${row('Predictions', j.predictions)}
        <div class="li"><span class="grow small">Minimum age for paid play</span><span class="strong">${j.minAge}+</span></div>
      </div>
    </div>
    <div class="card pad-lg stack" style="border-style:dashed">
      <p class="strong">Simulate another country (demo)</p>
      <p class="small muted">In production your country comes from ID verification and location, and can't be changed here. Switch to see how features turn on and off.</p>
      ${meta && html`<${Select} label="Country" value=${user.country} onChange=${(v) => set.run({ country: v })} options=${meta.countries.map((c) => ({ value: c.code, label: c.name }))} />`}
    </div>
  </div>`;
}

function AccountTab() {
  const { user, signOut } = useSession();
  const [reset, setReset] = useState(false);
  return html`<div class="stack" style="max-width:640px">
    <div class="card pad-lg"><dl class="kv"><dt>Email</dt><dd>${user.email}</dd><dt>Date of birth</dt><dd>${user.dob}</dd><dt>Account status</dt><dd>${user.status}</dd><dt>Role</dt><dd>${user.role}</dd></dl></div>
    <div class="row wrap"><${Button} variant="secondary" icon="logout" onClick=${async () => { await signOut(); navigate('/'); }}>Log out<//>${user.role === 'admin' && html`<${Button} variant="danger" icon="again" onClick=${() => setReset(true)}>Reset demo world<//>`}</div>
    <${Confirm} open=${reset} onClose=${() => setReset(false)} title="Reset the demo world?" body="This resets the shared demo world for everyone on this server: every account, match and transaction goes back to the seed data. You'll be logged out." confirmLabel="Reset everything" tone="danger" onConfirm=${() => resetDemo({ confirmed: true })} />
  </div>`;
}

export function Settings({ query }) {
  const tab = query.tab || 'profile';
  return html`<div class="container page">
    <${PageHead} title="Settings" />
    <${Tabs} value=${tab} onChange=${(v) => setQuery({ tab: v })} tabs=${[{ value: 'profile', label: 'Profile' }, { value: 'verify', label: 'Verification' }, { value: 'play', label: 'Responsible play' }, { value: 'region', label: 'Region' }, { value: 'account', label: 'Account' }]} />
    <div class="mt-6">
      ${tab === 'profile' && html`<${ProfileTab} />`}${tab === 'verify' && html`<${VerifyTab} />`}${tab === 'play' && html`<${PlayTab} />`}${tab === 'region' && html`<${RegionTab} />`}${tab === 'account' && html`<${AccountTab} />`}
    </div>
  </div>`;
}

const RULES = [
  ['Play it straight', 'No aimbots, macros, scripts, exploits or modified clients. Public matchmaking only unless the card says otherwise.'],
  ['One account, your account', 'No smurfing, no account sharing, no one playing for you.'],
  ['No collusion', 'No teaming with opponents, feeding kills, fixing matches or farming AFK players.'],
  ['Show your work', 'Screenshot or record the results screen with your in-game name visible. Keep clips for 7 days.'],
  ['Report honestly', 'False reports void results and can restrict your account. Every report is checked against evidence.'],
  ['Disconnects', 'Leading when your opponent drops? You win. Drop while leading? Refund. Drop while behind? Loss.'],
];
const REASON = { wrong_result: 'Wrong result', cheating: 'Cheating', disconnect: 'Disconnect', no_show: 'No-show', other: 'Other' };

export function FairPlay() {
  const q = useRpc('disputes.mine');
  return html`<div class="container page">
    <${PageHead} title="Fair play" sub="Every competition has an auditable result. Here's how we keep it clean, and where your disputes stand." />
    <div class="split">
      <div class="stack">
        <p class="strong">Your disputes</p>
        <${Async} q=${q} empty=${html`<${Empty} icon="shield" title="No disputes" body="If a result looks wrong, open the match and tap Dispute result within 24 hours." />`}>
          ${(l) => html`<div class="card"><div class="list">${l.map((d) => html`<a class="li clickable" href=${`#/app/disputes/${d.id}`}><${Icon} name="shield" size="20" /><div class="grow"><p class="li-title">${d.match?.title || 'Match'}</p><p class="li-sub">${REASON[d.reason]} · ${ago(d.createdAt)}</p></div><${Badge} tone=${['resolved'].includes(d.status) ? 'money' : d.status === 'rejected' ? '' : 'warn'}>${STATUS[d.status]}<//></a>`)}</div></div>`}
        <//>
      </div>
      <div class="card pad-lg stack">
        <p class="strong">The rules</p>
        ${RULES.map(([t, b]) => html`<div><p class="small strong">${t}</p><p class="small muted">${b}</p></div>`)}
        <p class="xs muted">Game-specific minimums (level, rank, matches played) are on each game's Modes & rules tab.</p>
      </div>
    </div>
  </div>`;
}

export function DisputeDetail({ params }) {
  const q = useRpc('disputes.get', { id: params.id });
  const [appeal, setAppeal] = useState('');
  const send = useAction('disputes.appeal', { success: 'Appeal filed', onSuccess: () => q.refresh() });
  const d = q.data;
  if (q.loading && !d) return html`<div class="container page"><${Sk} h=${300} r="14" /></div>`;
  if (q.error) return html`<div class="container page"><${Empty} icon="alert" title="Dispute not found" body=${q.error.message} action=${html`<${Button} href="/app/fairplay">Fair play<//>`} /></div>`;
  const reports = d.match ? Object.entries(d.match.reports) : [];
  return html`<div class="container page" style="max-width:860px">
    <a class="back" href="#/app/fairplay"><${Icon} name="chevL" />Fair play</a>
    <${PageHead} title=${d.match?.title || 'Dispute'} sub=${`${REASON[d.reason]}, opened ${ago(d.createdAt)}`} actions=${html`<${Badge} tone=${d.status === 'resolved' ? 'money' : d.status === 'rejected' ? '' : 'warn'}>${STATUS[d.status]}<//>`} />
    <div class="stack">
      ${d.resolution && html`<${Notice} tone=${d.status === 'resolved' ? 'ok' : 'info'} title=${`Decision: ${d.resolution.decision}`}>${d.resolution.note} — ${d.resolution.by}, ${ago(d.resolution.at)}<//>`}
      ${!d.resolution && html`<${Notice} tone="info" title="A referee is reviewing this">Both reports and all evidence are checked. In the demo this takes under a minute.<//>`}
      <div class="card"><p class="strong mb-2">What was reported</p><p class="small">${d.details}</p></div>
      ${reports.length > 0 && html`<div class="grid-2">${reports.map(([uid, r]) => {
        const who = d.match.players.find((p) => p.id === uid);
        return html`<div class="card stack tight"><${Who} user=${who} /><p class="small">Reported a <strong>${r.outcome || 'result'}</strong></p>${r.stats && html`<p class="xs muted">${Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join(', ')}</p>`}<p class="xs muted">${r.evidence.length} evidence file(s)</p></div>`;
      })}</div>`}
      <div class="card"><p class="strong mb-2">History</p><ol class="timeline">${d.history.map((h) => html`<li>${h.text}<time>${ago(h.at)}</time></li>`)}</ol></div>
      ${['resolved', 'rejected'].includes(d.status) && !d.appeal && html`<div class="card stack">
        <p class="strong">Appeal this decision</p><p class="small muted">A senior referee takes a second look. One appeal per dispute.</p>
        <${Textarea} label="Why the decision is wrong" value=${appeal} onInput=${setAppeal} hint="10 characters or more." />
        <div><${Button} loading=${send.pending} disabled=${appeal.trim().length < 10} onClick=${() => send.run({ id: d.id, reason: appeal })}>File appeal<//></div>
      </div>`}
      ${d.appeal && html`<${Notice} tone="info" title="Appeal filed">${d.appeal.reason}<//>`}
      ${d.match && html`<div><${Button} variant="secondary" href=${`/app/match/${d.match.id}`}>Open the match<//></div>`}
    </div>
  </div>`;
}

const HELP = [
  ['How do payouts work?', 'Prizes land in your stack the moment a result is verified. Withdraw any time after verifying your ID.'],
  ['My opponent never showed', 'Open the match and dispute with the "Opponent never showed" reason. No-shows forfeit after 30 minutes.'],
  ['Why is my result in review?', 'Something in the evidence needed a human: missing screenshot, stats that look off, or a mismatch. Reviews are quick.'],
  ['Is my money real?', 'Not in this prototype. Every balance and payment is simulated with demo credits.'],
];

export function Support() {
  const q = useRpc('support.tickets');
  const [f, setF] = useState({ subject: '', category: 'competitions', body: '' });
  const create = useAction('support.create', { success: 'Ticket sent. We reply within the hour.', onSuccess: () => { setF({ subject: '', category: 'competitions', body: '' }); q.refresh(); } });
  const [open, setOpen] = useState(0);
  return html`<div class="container page">
    <${PageHead} title="Help & support" />
    <div class="split">
      <div class="stack">
        <div class="faq card">${HELP.map(([t, b], i) => html`<div class="faq-item"><button type="button" aria-expanded=${open === i} onClick=${() => setOpen(open === i ? -1 : i)}><span>${t}</span><${Icon} name=${open === i ? 'minus' : 'plus'} /></button>${open === i && html`<p class="muted">${b}</p>`}</div>`)}</div>
        <div class="card stack">
          <p class="strong">Your tickets</p>
          <${Async} q=${q} empty=${html`<p class="small muted">No tickets yet.</p>`}>
            ${(l) => html`<div class="list">${l.map((t) => html`<div class="stack tight" style="padding:12px 0">
              <div class="row between"><p class="strong small">${t.subject}</p><${Badge} tone=${t.status === 'closed' ? '' : t.status === 'answered' ? 'money' : 'warn'}>${t.status}<//></div>
              ${t.messages.map((m) => html`<p class="small ${m.from === 'support' ? '' : 'muted'}"><strong>${m.from === 'support' ? 'STACKD' : 'You'}:</strong> ${m.body}</p>`)}
            </div>`)}</div>`}
          <//>
        </div>
      </div>
      <div class="card pad-lg stack">
        <p class="strong">Contact support</p>
        <${Input} label="Subject" value=${f.subject} onInput=${(v) => setF({ ...f, subject: v })} />
        <${Select} label="Topic" value=${f.category} onChange=${(v) => setF({ ...f, category: v })} options=${[{ value: 'competitions', label: 'Competitions & results' }, { value: 'wallet', label: 'Wallet & payouts' }, { value: 'account', label: 'Account & verification' }, { value: 'fairplay', label: 'Fair play' }, { value: 'other', label: 'Something else' }]} />
        <${Textarea} label="What's going on" value=${f.body} onInput=${(v) => setF({ ...f, body: v })} hint="Include match or transaction IDs if you have them." />
        <${Button} loading=${create.pending} disabled=${f.subject.trim().length < 4 || f.body.trim().length < 10} onClick=${() => create.run(f)}>Send ticket<//>
      </div>
    </div>
  </div>`;
}
