import { html, useState, useEffect } from '../../../lib/preact.js';
import { useRpc, useAction, useMeta } from '../../hooks.js';
import { navigate } from '../../router.js';
import { Icon } from '../../icons.js';
import { Button, Badge, Sk, ErrorBox, Async, Input, Select, Textarea, Toggle, Notice } from '../../components/base.js';
import { GameArt, GameThumb } from '../../components/game.js';
import { PLATFORM, CATEGORY } from '../../format.js';

export function GamesAdmin() {
  const q = useRpc('admin.games');
  const status = useAction('admin.gameStatus', { success: 'Game updated', onSuccess: () => q.refresh() });
  return html`<div class="stack">
    <div class="row between wrap"><div><h1 class="h1">Game catalog</h1><p class="muted mt-2">Nothing is hard-coded in the app. Every game, mode, platform and rule comes from here.</p></div><${Button} icon="plus" href="/admin/games/new">Add game<//></div>
    <${Async} q=${q}>
      ${(games) => html`<div class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>Game</th><th>Category</th><th>Platforms</th><th>Modes</th><th class="r">Players</th><th>Real money</th><th>Status</th><th></th></tr></thead>
        <tbody>${games.map((g) => html`<tr>
          <td><div class="row tight"><${GameThumb} game=${g} size=${34} /><div><a class="strong" href=${`#/admin/games/${g.id}`}>${g.name}</a><p class="xs muted">${g.developer}</p></div></div></td>
          <td>${CATEGORY[g.category]}</td><td class="small">${g.platforms.map((p) => PLATFORM[p]).join(', ')}</td><td class="small">${g.modes.length}</td>
          <td class="r num">${g.players}</td><td>${g.realMoney ? html`<${Badge} tone="money">On<//>` : html`<${Badge}>Credits only<//>`}</td>
          <td><select class="select" style="height:32px;width:auto;font-size:13px" aria-label=${`Status of ${g.name}`} value=${g.status} onChange=${(e) => status.run({ id: g.id, status: e.currentTarget.value })}><option value="active">Active</option><option value="coming_soon">Coming soon</option><option value="disabled">Disabled</option></select></td>
          <td><${Button} size="sm" variant="ghost" href=${`/admin/games/${g.id}`}>Edit<//></td>
        </tr>`)}</tbody>
      </table></div></div>`}
    <//>
  </div>`;
}

const METRIC_PRESETS = {
  kills: { key: 'kills', label: 'Kills', min: 0, max: 40 }, placement: { key: 'placement', label: 'Placement', min: 1, max: 100, lowerBetter: true },
  won: { key: 'won', label: 'Won the match', type: 'bool' }, goals: { key: 'goals', label: 'Goals scored', min: 0, max: 15 }, conceded: { key: 'conceded', label: 'Goals conceded', min: 0, max: 15 },
  rounds: { key: 'rounds', label: 'Rounds won', min: 0, max: 5 }, roundsLost: { key: 'roundsLost', label: 'Rounds lost', min: 0, max: 5 }, headshots: { key: 'headshots', label: 'Headshots', min: 0, max: 40 },
  damage: { key: 'damage', label: 'Damage', min: 0, max: 6000 }, kda: { key: 'kda', label: 'KDA', min: 0, max: 30, step: 0.1 },
};
const TYPES = [['challenge', 'Challenge'], ['h2h', 'H2H'], ['pool', 'Pool'], ['tournament', 'Tournament']];
const blank = { name: '', short: '', developer: '', description: '', category: 'battle_royale', platforms: ['mobile'], regions: ['UG', 'KE', 'TZ', 'RW', 'NG', 'GH', 'ZA', 'GB'], modes: [{ id: 'main', name: 'Main mode', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [METRIC_PRESETS.won] }], rules: [], eligibility: [], verification: ['screenshot', 'manual'], status: 'coming_soon', realMoney: true, featured: false, art: { bg: '#1D2027', fg: '#9EA1AA', motif: 'zone' } };

export function GameEditor({ params }) {
  const isNew = params.id === 'new';
  const meta = useMeta().data;
  const games = useRpc('admin.games', {}, { live: false, skip: isNew });
  const [g, setG] = useState(isNew ? blank : null);
  useEffect(() => {
    if (!isNew && games.data && !g) setG(structuredClone(games.data.find((x) => x.id === params.id)));
  }, [games.data]);
  const save = useAction('admin.gameSave', { success: 'Saved to the catalog', onSuccess: (out) => navigate(`/admin/games/${out.id}`) });
  if (!g) return games.error ? html`<${ErrorBox} error=${games.error} />` : html`<${Sk} h=${400} r="14" />`;
  const set = (k) => (v) => setG({ ...g, [k]: v });
  const tog = (k, v) => setG({ ...g, [k]: g[k].includes(v) ? g[k].filter((x) => x !== v) : [...g[k], v] });
  const setMode = (i, patch) => setG({ ...g, modes: g.modes.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const submit = () => {
    const { id, slug, popularity, competitionTypes, competitions, players, ...rest } = g;
    const media = g.media && Object.values(g.media).some(Boolean) ? Object.fromEntries(Object.entries(g.media).filter(([, v]) => v)) : undefined;
    save.run({ ...rest, media, id: isNew ? undefined : g.id, rules: g.rules.filter(Boolean), eligibility: g.eligibility.filter(Boolean), modes: g.modes.map(({ id: mid, name, teamSize, maxPlayers, types, metrics }) => ({ id: mid, name, teamSize: Number(teamSize), maxPlayers: Number(maxPlayers), types, metrics })) });
  };
  return html`<div class="stack loose">
    <a class="back" href="#/admin/games"><${Icon} name="chevL" />Game catalog</a>
    <div class="row between wrap"><h1 class="h1">${isNew ? 'Add game' : g.name}</h1><${Button} loading=${save.pending} onClick=${submit}>${isNew ? 'Add to catalog' : 'Save changes'}<//></div>
    <div class="split">
      <div class="stack">
        <div class="panel"><div class="panel-head"><span class="strong">Basics</span></div><div class="panel-body stack">
          <div class="form-grid"><${Input} label="Name" value=${g.name} onInput=${set('name')} /><${Input} label="Short name" value=${g.short} onInput=${set('short')} /></div>
          <div class="form-grid"><${Input} label="Developer" value=${g.developer} onInput=${set('developer')} /><${Select} label="Category" value=${g.category} onChange=${set('category')} options=${Object.entries(CATEGORY).map(([value, label]) => ({ value, label }))} /></div>
          <${Textarea} label="Description" value=${g.description} onInput=${set('description')} />
          <div class="field"><span class="label">Platforms</span><div class="chips" style="flex-wrap:wrap">${Object.entries(PLATFORM).map(([k, l]) => html`<button type="button" class="chip" aria-pressed=${g.platforms.includes(k) ? 'true' : 'false'} onClick=${() => tog('platforms', k)}>${l}</button>`)}</div></div>
          <div class="field"><span class="label">Available in</span><div class="chips" style="flex-wrap:wrap">${(meta?.countries || []).map((c) => html`<button type="button" class="chip" aria-pressed=${g.regions.includes(c.code) ? 'true' : 'false'} onClick=${() => tog('regions', c.code)}>${c.name}</button>`)}</div></div>
          <div class="row wrap" style="gap:var(--s-6)"><${Toggle} label="Real-money eligible" checked=${g.realMoney} onChange=${set('realMoney')} hint="Off = credits only" /><${Toggle} label="Featured" checked=${g.featured} onChange=${set('featured')} /></div>
          <${Select} label="Status" value=${g.status} onChange=${set('status')} options=${[{ value: 'active', label: 'Active' }, { value: 'coming_soon', label: 'Coming soon' }, { value: 'disabled', label: 'Disabled' }]} />
        </div></div>

        <div class="panel"><div class="panel-head"><span class="strong">Modes</span><${Button} size="sm" variant="secondary" icon="plus" onClick=${() => setG({ ...g, modes: [...g.modes, { id: `mode${g.modes.length + 1}`, name: 'New mode', teamSize: 1, maxPlayers: 2, types: ['h2h'], metrics: [METRIC_PRESETS.won] }] })}>Add mode<//></div>
          <div class="panel-body stack">${g.modes.map((m, i) => html`<div class="card" style="background:var(--elevated)">
            <div class="form-grid">
              <${Input} label="Mode ID" value=${m.id} onInput=${(v) => setMode(i, { id: v.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
              <${Input} label="Name" value=${m.name} onInput=${(v) => setMode(i, { name: v })} />
              <${Input} label="Team size" type="number" min="1" max="10" value=${m.teamSize} onInput=${(v) => setMode(i, { teamSize: v })} />
              <${Input} label="Max players" type="number" min="1" max="200" value=${m.maxPlayers} onInput=${(v) => setMode(i, { maxPlayers: v })} />
            </div>
            <p class="label mt-4 mb-2">Competition types</p>
            <div class="chips" style="flex-wrap:wrap">${TYPES.map(([k, l]) => html`<button type="button" class="chip" aria-pressed=${m.types.includes(k) ? 'true' : 'false'} onClick=${() => setMode(i, { types: m.types.includes(k) ? m.types.filter((x) => x !== k) : [...m.types, k] })}>${l}</button>`)}</div>
            <p class="label mt-4 mb-2">Tracked stats</p>
            <div class="chips" style="flex-wrap:wrap">${Object.values(METRIC_PRESETS).map((x) => html`<button type="button" class="chip" aria-pressed=${m.metrics.some((y) => y.key === x.key) ? 'true' : 'false'} onClick=${() => setMode(i, { metrics: m.metrics.some((y) => y.key === x.key) ? m.metrics.filter((y) => y.key !== x.key) : [...m.metrics, x] })}>${x.label}</button>`)}</div>
            ${g.modes.length > 1 && html`<div class="mt-4"><${Button} size="sm" variant="ghost" onClick=${() => setG({ ...g, modes: g.modes.filter((_, j) => j !== i) })}>Remove mode<//></div>`}
          </div>`)}</div>
        </div>
      </div>

      <div class="stack">
        <div class="panel"><div class="panel-head"><span class="strong">Artwork</span></div><div class="panel-body stack">
          <${GameArt} game=${{ ...g, id: 'preview' }} size="banner" />
          <div class="form-grid">
            <div class="field"><label class="label" for="bg">Background</label><input id="bg" type="color" value=${g.art.bg} onInput=${(e) => setG({ ...g, art: { ...g.art, bg: e.currentTarget.value.toUpperCase() } })} style="width:100%;height:42px;background:none;border:1px solid var(--border-strong);border-radius:6px" /></div>
            <div class="field"><label class="label" for="fg">Accent</label><input id="fg" type="color" value=${g.art.fg} onInput=${(e) => setG({ ...g, art: { ...g.art, fg: e.currentTarget.value.toUpperCase() } })} style="width:100%;height:42px;background:none;border:1px solid var(--border-strong);border-radius:6px" /></div>
            <${Select} label="Motif" value=${g.art.motif} onChange=${(v) => setG({ ...g, art: { ...g.art, motif: v } })} options=${['zone', 'lanes', 'pitch', 'rack', 'speed', 'burst', 'tiles', 'slash']} />
          </div>
          <p class="label">Artwork URLs</p>
          <p class="xs muted">Use <code>{w}</code> where the CDN takes a width (App Store, PlayStation Store) so the app requests right-sized files. Leave empty to use the generated art above.</p>
          ${['cover', 'banner', 'hero', 'icon'].map((k) => html`<${Input} label=${{ cover: 'Card image (portrait crop)', banner: 'Banner image', hero: 'Hero image', icon: 'Square icon' }[k]} optional value=${g.media?.[k] || ''} onInput=${(v) => setG({ ...g, media: { ...(g.media || {}), [k]: v } })} />`)}
          <div class="form-grid"><${Input} label="Card focal point" optional placeholder="50% 50%" value=${g.media?.coverPos || ''} onInput=${(v) => setG({ ...g, media: { ...(g.media || {}), coverPos: v } })} /><${Input} label="Banner focal point" optional placeholder="50% 50%" value=${g.media?.bannerPos || ''} onInput=${(v) => setG({ ...g, media: { ...(g.media || {}), bannerPos: v } })} /></div>
          <p class="xs faint">Official artwork belongs to its publisher. Confirm licensing before using it in a public launch.</p>
        </div></div>
        <div class="panel"><div class="panel-head"><span class="strong">Rules & verification</span></div><div class="panel-body stack">
          <${Textarea} label="Rules (one per line)" value=${g.rules.join('\n')} onInput=${(v) => setG({ ...g, rules: v.split('\n') })} />
          <${Textarea} label="Eligibility (one per line)" value=${g.eligibility.join('\n')} onInput=${(v) => setG({ ...g, eligibility: v.split('\n') })} />
          <div class="field"><span class="label">Verification methods, in order</span><div class="chips" style="flex-wrap:wrap">${[['api', 'Game data / API'], ['video', 'Video / VOD'], ['screenshot', 'Screenshot'], ['manual', 'Referee']].map(([k, l]) => html`<button type="button" class="chip" aria-pressed=${g.verification.includes(k) ? 'true' : 'false'} onClick=${() => tog('verification', k)}>${l}</button>`)}</div></div>
          <${Notice} tone="info">The integration layer picks the first method the match supports. Add "Game data" when a publisher API or tournament platform is connected.<//>
        </div></div>
      </div>
    </div>
  </div>`;
}
