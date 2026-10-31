import { html, useState, useEffect } from '../../../lib/preact.js';
import { useRpc, useAction } from '../../hooks.js';
import { Button, Sk, ErrorBox, Input, Select, Notice } from '../../components/base.js';
import { BigStackBanner, usd } from '../bigstack.js';
import { money } from '../../format.js';

export function BigStackAdmin() {
  const q = useRpc('bigstack.get', {}, { live: false });
  const sp = useRpc('sponsor.dashboard', {}, { live: false });
  const [f, setF] = useState(null);
  useEffect(() => {
    if (q.data && !f) {
      const b = q.data;
      setF({ name: b.name, sponsorId: b.sponsorId, guaranteedUSD: b.guaranteedUSD, stretchUSD: b.stretchUSD, contributionPct: b.contributionPct, qualifySpots: b.qualifySpots, finalsInDays: Math.max(1, Math.round((b.finalsAt - Date.now()) / 86400000)), fx: b.fx, status: b.status });
    }
  }, [q.data]);
  const save = useAction('admin.bigstackSave', { success: 'Big Stack updated', onSuccess: () => q.reload() });
  if (q.error) return html`<${ErrorBox} error=${q.error} retry=${q.reload} />`;
  if (!f) return html`<${Sk} h=${400} r="14" />`;
  const num = (k) => (v) => setF({ ...f, [k]: Number(String(v).replace(/[^0-9.]/g, '')) || 0 });
  return html`<div class="stack loose">
    <div><h1 class="h1">The Big Stack</h1><p class="muted mt-2">Season mega pool: sponsor guarantee plus a share of platform fees from every paid entry.</p></div>
    <${BigStackBanner} b=${q.data} href="/app/bigstack" cta="Open the event page" />
    <div class="split">
      <div class="panel"><div class="panel-head"><span class="strong">Event settings</span><${Button} size="sm" loading=${save.pending} onClick=${() => save.run(f)}>Save<//></div>
        <div class="panel-body stack">
          <div class="form-grid">
            <${Input} label="Event name" value=${f.name} onInput=${(v) => setF({ ...f, name: v })} />
            <${Select} label="Title sponsor" value=${f.sponsorId} onChange=${(v) => setF({ ...f, sponsorId: v })} options=${(sp.data?.sponsors || []).map((s) => ({ value: s.id, label: s.name }))} />
            <${Input} label="Sponsor guarantee" prefix="USD" value=${f.guaranteedUSD} onInput=${num('guaranteedUSD')} hint=${money(f.guaranteedUSD * f.fx)} />
            <${Input} label="Stretch goal" prefix="USD" value=${f.stretchUSD} onInput=${num('stretchUSD')} />
            <${Input} label="Share of platform fees added" type="number" value=${f.contributionPct} onInput=${num('contributionPct')} hint="% of every fee goes into the pool" />
            <${Input} label="Qualifying spots" type="number" value=${f.qualifySpots} onInput=${num('qualifySpots')} />
            <${Input} label="Finals in (days)" type="number" value=${f.finalsInDays} onInput=${num('finalsInDays')} />
            <${Input} label="UGX per USD" type="number" value=${f.fx} onInput=${num('fx')} />
            <${Select} label="Status" value=${f.status} onChange=${(v) => setF({ ...f, status: v })} options=${[{ value: 'qualifying', label: 'Qualifying' }, { value: 'finals', label: 'Finals' }, { value: 'complete', label: 'Complete' }]} />
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="kpis">
          <div class="kpi"><span class="l">Pool now</span><span class="v">${usd(q.data.poolUSD)}</span><span class="d">${money(q.data.poolUGX)}</span></div>
          <div class="kpi"><span class="l">From entries</span><span class="v">${usd(q.data.poolUSD - q.data.guaranteedUSD)}</span></div>
          <div class="kpi"><span class="l">Cut line</span><span class="v">${q.data.cutoff}</span><span class="d">season points</span></div>
        </div>
        <${Notice} tone="info" title="How the pool is funded">The sponsor guarantee is fixed. On top, ${f.contributionPct}% of every platform fee (pools, H2H, challenges, arcade) is added as it's collected. Player entries are never diverted from the competition they were paid into.<//>
      </div>
    </div>
  </div>`;
}
