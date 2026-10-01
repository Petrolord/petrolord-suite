// A Basin & Charge Modeling charge handed to Prospect Risking (BF-U2-017,
// contract src/lib/basinCharge.js). Shown when the page opens with
// ?bfCharge=<id>: what the basin model expels, the analyst's fetch area,
// trap age and migration efficiency, the charge that reaches the trap against
// the prospect's unrisked mean, and a suggested charge factor to apply.

import React, { useEffect, useMemo, useState } from 'react';
import { readBasinCharge, chargeAssessment, DEFAULT_MIGRATION_EFFICIENCY } from '@/lib/basinCharge';
import { toMMboe } from '../../services/prospectVolumes';

const cls = 'h-6 w-20 rounded border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text';

export default function BasinChargeNote({ meanVolume, unit, basis, onApply, onRecord }) {
  const id = useMemo(() => { try { return new URLSearchParams(window.location.search).get('bfCharge'); } catch { return null; } }, []);
  const read = useMemo(() => (id ? readBasinCharge(id) : null), [id]);
  const [area, setArea] = useState('');
  const [trap, setTrap] = useState('');
  const [eff, setEff] = useState(String(DEFAULT_MIGRATION_EFFICIENCY));
  const required = Number.isFinite(Number(meanVolume)) && meanVolume !== '' ? toMMboe(Number(meanVolume), unit) : null;
  const a = useMemo(() => (read?.ok ? chargeAssessment(read.payload, { fetchAreaKm2: Number(area), trapAgeMa: trap === '' ? NaN : Number(trap), efficiency: Number(eff), requiredMMboe: required }) : null), [read, area, trap, eff, required]);
  const record = useMemo(() => (read?.ok && a?.ok ? {
    schema: read.payload.schema, id: read.payload.id, model: read.payload.model.name, sentAt: read.payload.createdAt,
    fetchAreaKm2: Number(area), trapAgeMa: Number(trap), efficiency: Number(eff), chargeMMboe: a.chargeMMboe, ratio: a.ratio, suggestedFactor: a.factor,
  } : null), [read, a, area, trap, eff]);
  useEffect(() => { if (onRecord) onRecord(record); }, [record]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!read) return null;
  if (!read.ok) return <div className="rounded border border-pl-warning/40 bg-pl-warning-bg p-2 text-[11px] text-pl-warning-text" data-testid="rcp-bf-charge-error">{read.reason}</div>;
  const p = read.payload;
  return (
    <div className="rounded border border-pl-border bg-pl-sunken p-2 text-[11px] text-pl-text space-y-1.5" data-testid="rcp-bf-charge">
      <div className="font-semibold">Charge from the basin model: {p.model.name}</div>
      <div className="text-pl-muted">
        {p.sources.map((s) => `${s.name}: TOC ${s.tocWtPct} wt %, HI ${s.hi}, ${(100 * s.transformation).toFixed(0)} % transformed, ${s.expelledKgM2.toFixed(0)} kg/m2 expelled`).join('; ')}.
        {p.criticalMomentMa != null ? ` Critical moment ${p.criticalMomentMa} Ma.` : ''}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Fetch area (km2)<input className={cls} type="number" min="0" step="any" value={area} onChange={(e) => setArea(e.target.value)} data-testid="rcp-bf-charge-area" /></label>
        <label className="flex items-center gap-1">Trap formed (Ma)<input className={cls} type="number" min="0" step="any" value={trap} onChange={(e) => setTrap(e.target.value)} data-testid="rcp-bf-charge-trap" /></label>
        <label className="flex items-center gap-1">Migration efficiency (fraction)<input className={cls} type="number" min="0" max="1" step="0.01" value={eff} onChange={(e) => setEff(e.target.value)} data-testid="rcp-bf-charge-eff" /></label>
      </div>
      <div data-testid="rcp-bf-charge-result" className={a?.ok ? '' : 'text-pl-muted'}>{a?.ok ? a.text : a?.reason}</div>
      {a?.ok && basis === 'recoverable' && a.factor != null && <div className="text-pl-muted">The requirement here is the recoverable mean; a trap needs its in-place volume, which is larger.</div>}
      {a?.ok && a.factor != null && (
        <button type="button" data-testid="rcp-bf-charge-apply" className="px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-surface" onClick={() => onApply && onApply(a.factor)}>
          Use {a.factor} as the charge factor
        </button>
      )}
      {p.notes.map((n, i) => <div key={i} className="text-pl-muted">{n}</div>)}
    </div>
  );
}
