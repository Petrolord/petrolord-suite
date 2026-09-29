// Zone manager (Petrophysics Studio G2.3): the selected well's
// geo_wells_zones with LIVE net-pay summaries computed from the
// current preview curves (the G2.5 publish action snapshots the same
// numbers into zone.properties). Owner-only edits — read-only wells
// show summaries without the editing affordances, mirroring RLS.

import React, { useMemo, useState } from 'react';
import { Trash2, Plus, Loader2, UploadCloud, Crosshair, Layers } from 'lucide-react';
import { toDisplay, fromDisplay, depthLabel } from '../viewer/depthModes';
import { validateZoneWindow, planZoneFromTops, planZonesBetweenConsecutiveTops } from '../services/zonePlanner';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { AVERAGING_NOTE, publishedState } from '../services/zoneAverages';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? EMPTY_VALUE : Number(v).toFixed(d));

/** @param {'m'|'ft'} [p.depthUnit] display unit for depths typed and shown
 *  here (PT2); storage stays metres MD
 *  @param {Array} [p.tops] the well's tops (PT4: zones between tops)
 *  @param {(list: Array) => Promise<void>} [p.onAddMany] bulk create
 *  @param {() => void} [p.onStartPick] enter the two-click pick mode on the track
 *  @param {boolean} [p.pickActive] the track is in zone pick mode
 *  @param {?number} [p.tdM] TD for the optional last zone to TD */
export default function ZoneManager({
  zones, summaries, isOwn, busy, onAdd, onDelete, onPublish, zoneParams = {}, depthUnit = 'm',
  tops = [], onAddMany, onStartPick, pickActive = false, tdM = null, probZones = null, onOpenSensitivity = null,
}) {
  const [draft, setDraft] = useState({ name: '', top: '', base: '' });
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('typed'); // 'typed' | 'tops' | 'pick'
  const [pair, setPair] = useState({ from: '', to: '' });
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  const sortedTops = useMemo(() => (tops || []).slice().sort((a, b) => a.md_m - b.md_m), [tops]);
  const plan = useMemo(() => planZonesBetweenConsecutiveTops(sortedTops, { existingZones: zones, tdM }), [sortedTops, zones, tdM]);

  const addFromTops = async () => {
    const a = sortedTops.find((t) => t.id === pair.from);
    const b = sortedTops.find((t) => t.id === pair.to);
    try {
      const z = planZoneFromTops(a, b, draft.name.trim() || null);
      setError(null);
      await onAdd(z);
      setDraft({ name: '', top: '', base: '' });
    } catch (e) { setError(e.message); }
  };
  const addAllBetweenTops = async () => {
    if (!plan.zones.length) { setError('All consecutive top pairs already have zones.'); return; }
    setError(null);
    try { await onAddMany(plan.zones); } catch (e) { setError(e.message); }
  };

  const add = async () => {
    const top = fromDisplay(Number(draft.top), depthUnit);
    const base = fromDisplay(Number(draft.base), depthUnit);
    if (!draft.name.trim()) { setError('The zone needs a name.'); return; }
    const bad = validateZoneWindow(top, base, depthUnit);
    if (bad) { setError(bad); return; }
    setError(null);
    try {
      await onAdd({ name: draft.name.trim(), topMdM: top, baseMdM: base });
      setDraft({ name: '', top: '', base: '' });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="p-2 space-y-2 text-xs" data-testid="petro-zones">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-pl-muted">
          Zones {busy && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
        </span>
        {onOpenSensitivity && zones.length > 0 && (
          <button
            type="button"
            data-testid="petro-sensitivity-open"
            className="ml-auto px-1.5 py-0.5 rounded border text-[11px] border-pl-border text-pl-text hover:bg-pl-sunken"
            title="Net pay and HCPV against each cutoff, per zone (PETRO-U2-005)"
            onClick={() => onOpenSensitivity(null)}
          >
            Cutoff sensitivity…
          </button>
        )}
      </div>

      {zones.map((z) => {
        const s = summaries?.[z.id];
        return (
          <div key={z.id} className="rounded border border-pl-border p-1.5" data-testid="petro-zone-card" data-zone-name={z.name}>
            <div className="flex items-center gap-1">
              <span className="text-pl-text font-medium">{z.name}</span>
              <span className="text-pl-muted">{fmt(toDisplay(z.top_md_m, depthUnit), 1)}–{fmt(toDisplay(z.base_md_m, depthUnit), 1)} {u}</span>
              {Object.keys(zoneParams[z.id] || {}).length > 0 && (
                <span
                  className="rounded px-1 text-[10px] bg-pl-primary/10 text-pl-primary-text"
                  title={`Parameter overrides: ${Object.keys(zoneParams[z.id]).join(', ')}`}
                  data-testid={`petro-zone-overrides-${z.name}`}
                >
                  {Object.keys(zoneParams[z.id]).length} override{Object.keys(zoneParams[z.id]).length > 1 ? 's' : ''}
                </span>
              )}
              {isOwn && (
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    title={s ? `Publish ${z.name} summary to the registry` : 'Compute curves first'}
                    disabled={!s}
                    className="text-pl-muted hover:text-pl-primary-text disabled:opacity-30"
                    data-testid={`petro-zone-publish-${z.name}`}
                    onClick={() => onPublish(z)}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={`Delete zone ${z.name}`}
                    className="text-pl-muted hover:text-pl-danger-text"
                    data-testid={`petro-zone-delete-${z.name}`}
                    onClick={() => onDelete(z)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {s ? (
              <div className="grid grid-cols-3 gap-x-2 mt-1 text-[11px] text-pl-muted" data-testid={`petro-zone-summary-${z.name}`}>
                <span title="Net pay: samples passing the porosity, Vsh and Sw cutoffs, measured along hole (MD)">net pay <b className="text-pl-text" data-testid={`petro-zone-net-${z.name}`}>{fmt(toDisplay(s.net_m, depthUnit), 1)}</b> {u}</span>
                <span title="Gross interval thickness along hole (MD)">gross {fmt(toDisplay(s.gross_m, depthUnit), 1)} {u}</span>
                <span title="Net pay over gross">NTG {fmt(s.ntg, 3)}</span>
                {Number.isFinite(s.net_res_m) && (
                  <span title="Net reservoir: samples passing the porosity and Vsh cutoffs only" data-testid={`petro-zone-netres-${z.name}`}>net res {fmt(toDisplay(s.net_res_m, depthUnit), 1)} {u}</span>
                )}
                <span title="Effective porosity, net-pay-thickness weighted">φe {fmt(s.phi_avg, 3)}</span>
                <span title={AVERAGING_NOTE} data-testid={`petro-zone-sw-${z.name}`}>Sw {fmt(s.sw_avg, 3)}</span>
                <span>Vsh {fmt(s.vsh_avg, 3)}</span>
                {s.k_gm_md !== undefined && (
                  <span
                    data-testid={`petro-zone-kgm-${z.name}`}
                    title={Number.isFinite(s.k_gm_md)
                      ? 'Thickness-weighted geometric mean of KPERM over the pay samples'
                      : 'No pay sample in this zone carries a positive permeability'}
                  >
                    k gm <b className="text-pl-text">{fmt(s.k_gm_md, 1)}</b> mD
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-pl-muted">no computed curves yet</div>
            )}
            {s && s.tvt_source === 'deviation survey' && (
              <div className="mt-0.5 text-[11px] text-pl-muted" data-testid={`petro-zone-tvt-${z.name}`} title="True vertical thickness through the deviation survey: the thickness volumetrics use">
                TVT gross {fmt(toDisplay(s.gross_tvt_m, depthUnit), 1)} · net pay <b className="text-pl-text">{fmt(toDisplay(s.net_tvt_m, depthUnit), 1)}</b> {u} (deviated well)
              </div>
            )}
            {probZones?.[z.id] && (
              <div className="mt-0.5 text-[11px] text-pl-muted" data-testid={`petro-zone-prob-${z.name}`}
                title="Net pay cases from the probabilistic run. P90 means a 90% probability the actual quantity meets or exceeds this value, per SPE PRMS.">
                net P90 <b className="text-pl-text">{fmt(toDisplay(probZones[z.id].outcomes.net_m.p90, depthUnit), 1)}</b>
                {' · '}P50 <b className="text-pl-text">{fmt(toDisplay(probZones[z.id].outcomes.net_m.p50, depthUnit), 1)}</b>
                {' · '}P10 <b className="text-pl-text">{fmt(toDisplay(probZones[z.id].outcomes.net_m.p10, depthUnit), 1)}</b> {u}
              </div>
            )}
            {(() => {
              // PETRO-U1-014: say what the registry row is, from the row itself
              const ps = publishedState(z, s);
              if (ps.state === 'none') return null;
              return ps.state === 'current'
                ? <div className="mt-1 text-[10px] text-pl-success-text" data-testid={`petro-zone-published-${z.name}`}>published{ps.at ? ` ${ps.at}` : ''}; matches these numbers</div>
                : <div className="mt-1 text-[10px] text-pl-warning-text" data-testid={`petro-zone-published-${z.name}`}>published{ps.at ? ` ${ps.at}` : ''} with different numbers; publish again to update what other apps read</div>;
            })()}
          </div>
        );
      })}
      {!zones.length && <p className="text-pl-muted">No zones on this well yet.</p>}

      {isOwn && (
        <div className="rounded border border-pl-border p-1.5 space-y-1">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-pl-muted mr-1">New zone</span>
            {[['typed', 'Typed'], ['tops', 'Between tops'], ['pick', 'Pick on track']].map(([k, label]) => (
              <button key={k} type="button" data-testid={`petro-zone-mode-${k}`}
                className={`px-1.5 py-0.5 rounded border ${mode === k ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`}
                onClick={() => { setMode(k); setError(null); }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input className={`${inputCls} flex-1`} placeholder={mode === 'tops' ? 'Zone name (defaults to the upper top)' : 'Zone name'} value={draft.name}
              data-testid="petro-zone-name"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          {mode === 'typed' && (
            <div className="flex items-center gap-1">
              <input className={`${inputCls} w-20`} placeholder={`Top ${u}`} value={draft.top}
                data-testid="petro-zone-top"
                onChange={(e) => setDraft((d) => ({ ...d, top: e.target.value }))} />
              <input className={`${inputCls} w-20`} placeholder={`Base ${u}`} value={draft.base}
                data-testid="petro-zone-base"
                onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))} />
              <button
                type="button"
                data-testid="petro-zone-add"
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border
                  border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10"
                onClick={add}
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          )}
          {mode === 'tops' && (
            sortedTops.length < 2 ? (
              <p className="text-pl-muted">This well needs at least two tops. Pick them on the track or upload them in Well Data Manager.</p>
            ) : (
              <>
                <div className="flex items-center gap-1 flex-wrap">
                  <select className={inputCls} value={pair.from} data-testid="petro-zone-from-top"
                    onChange={(e) => { setPair((p) => ({ ...p, from: e.target.value })); if (!draft.name) { const t = sortedTops.find((x) => x.id === e.target.value); if (t) setDraft((d) => ({ ...d, name: t.name })); } }}>
                    <option value="">Top…</option>
                    {sortedTops.map((t) => <option key={t.id} value={t.id}>{t.name} {depthLabel(t.md_m, depthUnit)}</option>)}
                  </select>
                  <span className="text-pl-muted">to</span>
                  <select className={inputCls} value={pair.to} data-testid="petro-zone-to-top"
                    onChange={(e) => setPair((p) => ({ ...p, to: e.target.value }))}>
                    <option value="">Base…</option>
                    {sortedTops.map((t) => <option key={t.id} value={t.id}>{t.name} {depthLabel(t.md_m, depthUnit)}</option>)}
                  </select>
                  <button type="button" data-testid="petro-zone-add-from-tops" disabled={!pair.from || !pair.to}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-50"
                    onClick={addFromTops}>
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <button type="button" data-testid="petro-zone-fill-between-tops" disabled={busy}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50"
                  title={plan.zones.length ? `Creates ${plan.zones.length} zone(s): ${plan.zones.map((z) => z.name).join(', ')}` : 'Every consecutive pair already has a zone'}
                  onClick={addAllBetweenTops}>
                  <Layers className="w-3 h-3" /> Zones between consecutive tops ({plan.zones.length})
                </button>
              </>
            )
          )}
          {mode === 'pick' && (
            <div className="space-y-1">
              <p className="text-pl-muted">Click the zone top on the track, then its base; a name box opens (the nearest top above is suggested). Esc leaves the mode.</p>
              <button type="button" data-testid="petro-zone-pick"
                className={`flex items-center gap-1 px-2 py-0.5 rounded border ${pickActive
                  ? 'border-pl-primary text-pl-primary-text bg-pl-primary/10' : 'border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10'}`}
                onClick={onStartPick}>
                <Crosshair className="w-3 h-3" /> {pickActive ? 'Picking… (Esc to stop)' : 'Pick on track'}
              </button>
            </div>
          )}
          {error && <div className="text-pl-danger-text" data-testid="petro-zone-error">{error}</div>}
        </div>
      )}
      {!isOwn && (
        <p className="text-[10px] text-pl-muted">
          Org-shared well. Zones are read-only for you.
        </p>
      )}
    </div>
  );
}
