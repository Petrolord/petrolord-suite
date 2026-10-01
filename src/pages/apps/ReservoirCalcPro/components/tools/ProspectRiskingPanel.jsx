// Prospect Risking (Integration & Risking G5.3): geologic chance of
// success + risked volumes on top of RCP's unrisked volumetrics, a
// prospect inventory, and a portfolio roll-up. Risked-mean and the
// SUCCESS-CASE percentiles are shown separately by construction — the
// dry-hole risk is never hidden (ProspectRiskEngine contract).
//
// Injected `backend` (rcp_prospects CRUD, or the in-memory harness
// twin) so the whole flow is auth-free-driveable. `unrisked` seeds the
// success-case volumes from RCP's latest run when present; otherwise
// the analyst enters mean/percentiles manually. Volumes carry their unit
// (MMSTB, Bscf, MMsm³, Bsm³; services/prospectVolumes.js) into the saved
// row, which Risked Reserves Valuation reads (RCP-T1-003).

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Layers } from 'lucide-react';
import { RISK_FACTORS, chanceOfSuccess, riskProspect } from '../../services/ProspectRiskEngine';
import { VOLUME_UNITS, portfolioInMMboe } from '../../services/prospectVolumes';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { buildProspectSummaryPdf } from '../../services/prospectSummaryPdf';
import { prospectEconomics, ECONOMICS_DEFAULTS } from '../../services/prospectEconomics';
import { reviewerLines } from '../../services/reportInfo';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const inputCls = COMPACT_FIELD_THEMED;
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? EMPTY_VALUE : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : EMPTY_VALUE);

const DEFAULT_FACTORS = { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 };

export default function ProspectRiskingPanel({ backend, unrisked, defaultUnit = 'MMbbl', valuationHref = '/dashboard/apps/reservoir/risked-reserves-valuation', reviewer = null, context = null, projectName = null }) {
  const [name, setName] = useState('');
  const [factors, setFactors] = useState(DEFAULT_FACTORS);
  const [vol, setVol] = useState({ mean: '', p90: '', p50: '', p10: '' });
  const [prospects, setProspects] = useState([]);
  const [status, setStatus] = useState(null);
  const [unit, setUnit] = useState(defaultUnit);
  // RCP-U1-003: what the volumes are. The valuation reads recoverable
  // volumes; a run from before U1 can only offer in-place ones.
  const [basis, setBasis] = useState('recoverable');
  const [added, setAdded] = useState(false);
  // U2-012: success-case economics through the canonical screening NPV
  const [econOn, setEconOn] = useState(false);
  const [econ, setEcon] = useState({ ...ECONOMICS_DEFAULTS });

  // seed volumes from RCP's latest run when available
  useEffect(() => {
    if (unrisked && Number.isFinite(unrisked.mean)) {
      const r = (v) => (v != null && Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '');
      setVol({ mean: r(unrisked.mean), p90: r(unrisked.p90), p50: r(unrisked.p50), p10: r(unrisked.p10) });
      if (unrisked.unit) setUnit(unrisked.unit);
      setBasis(unrisked.basis || 'recoverable');
    }
  }, [unrisked]);

  const refresh = async () => {
    try { setProspects(await backend.listProspects()); }
    catch (e) { setStatus(e.message); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [backend]);

  const num = (v) => (v === '' ? NaN : Number(v));
  const unriskedObj = useMemo(() => ({
    mean: num(vol.mean), p90: num(vol.p90) || null, p50: num(vol.p50) || null, p10: num(vol.p10) || null,
  }), [vol]);

  const pg = chanceOfSuccess(factors);
  const econRes = useMemo(() => (econOn ? prospectEconomics(num(vol.mean), unit, econ) : null), [econOn, vol.mean, unit, econ]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = Number.isFinite(unriskedObj.mean)
    ? riskProspect({ name, factors, unrisked: unriskedObj })
    : null;

  // RCP-U1-005: one unit for the portfolio (MMboe); rows with no stated
  // unit are left out and counted
  const rolled = useMemo(() => portfolioInMMboe(prospects, (p) => chanceOfSuccess(p.pg_factors || {})), [prospects]);

  const addToInventory = async () => {
    if (!name.trim()) { setStatus('Name the prospect.'); return; }
    if (!Number.isFinite(unriskedObj.mean)) { setStatus('Enter an unrisked mean volume.'); return; }
    try {
      await backend.saveProspect({
        name: name.trim(),
        pgFactors: factors,
        inputs: {
          mean: unriskedObj.mean, p90: unriskedObj.p90, p50: unriskedObj.p50, p10: unriskedObj.p10, unit, basis,
          ...(econRes?.ok ? { economics: { npvMM: econRes.npvMM, unitValue: econRes.unitValue, devCost: econRes.devCost, assumptions: econRes.assumptions, engine: econRes.engine } } : {}),
        },
        risked: { pg: live.pg, risked_mean: live.riskedMean, success: live.successCase },
      });
      setStatus(`Added ${name.trim()} to the inventory.`);
      setAdded(true);
      setName('');
      await refresh();
    } catch (e) { setStatus(e.message); }
  };

  const remove = async (p) => {
    try { await backend.deleteProspect(p); await refresh(); }
    catch (e) { setStatus(e.message); }
  };

  return (
    <div className="space-y-4 text-pl-text" data-testid="prospect-risking">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-pl-muted" />
          <h3 className="text-sm font-semibold">Prospect Risking</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Pg factors */}
          <div className="rounded border border-pl-border p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-pl-muted">Chance of success (Pg)</div>
            {RISK_FACTORS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-xs capitalize">
                <span className="w-20 text-pl-muted">{f}</span>
                <input type="range" min="0" max="1" step="0.05" value={factors[f] ?? 1}
                  data-testid={`pg-${f}`} className="flex-1 accent-pl-primary"
                  onChange={(e) => setFactors((s) => ({ ...s, [f]: Number(e.target.value) }))} />
                <span className="w-10 text-right tabular-nums" data-testid={`pgv-${f}`}>{pct(factors[f] ?? 1)}</span>
              </label>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-pl-border text-xs">
              <span className="text-pl-muted">Pg =</span>
              <span className="font-semibold font-pl-mono text-pl-text" data-testid="pg-total">{pct(pg)}</span>
            </div>
          </div>

          {/* unrisked volume */}
          <div className="rounded border border-pl-border p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-pl-muted">
              Unrisked {basis === 'in-place' ? 'in-place' : 'recoverable'} volume {unrisked ? '(from the last Monte Carlo run)' : '(enter, or run Monte Carlo first)'}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-14 text-pl-muted">Basis</span>
              <select className={`${inputCls} flex-1`} value={basis} data-testid="vol-basis" onChange={(e) => setBasis(e.target.value)}>
                <option value="recoverable">Recoverable (prospective resources)</option>
                <option value="in-place">In place (STOIIP / GIIP)</option>
              </select>
            </label>
            {basis === 'in-place' && (
              <p className="text-[10px] text-pl-warning-text" data-testid="vol-basis-warning">
                These are in-place volumes. Risked Reserves Valuation values recoverable volumes; re-run the Monte Carlo (it now reports recoverable volumes) or enter recoverable ones.
              </p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <span className="w-14 text-pl-muted">Unit</span>
              <select className={`${inputCls} flex-1`} value={unit} data-testid="vol-unit" onChange={(e) => setUnit(e.target.value)}>
                {Object.entries(VOLUME_UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
              </select>
            </label>
            {['mean', 'p90', 'p50', 'p10'].map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-pl-muted uppercase">{k}</span>
                <input className={`${inputCls} flex-1`} value={vol[k]} data-testid={`vol-${k}`}
                  onChange={(e) => setVol((s) => ({ ...s, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        {/* live risked readout */}
        {live && (
          <div className="mt-2 rounded border border-pl-border bg-pl-sunken p-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="risked-readout">
            <div className="flex justify-between"><span className="text-pl-muted">Risked mean (EMV basis)</span><span className="font-semibold"><span data-testid="risked-mean">{fmt(live.riskedMean)}</span> {VOLUME_UNITS[unit]?.label}</span></div>
            <div className="flex justify-between"><span className="text-pl-muted">P(failure)</span><span>{pct(live.pFailure)}</span></div>
            <div className="col-span-2 text-[10px] text-pl-muted pt-1">Success case (volumes given discovery):</div>
            <div className="flex justify-between"><span className="text-pl-muted">P90 / P50</span><span data-testid="success-p90p50">{fmt(live.successCase.p90)} / {fmt(live.successCase.p50)}</span></div>
            <div className="flex justify-between"><span className="text-pl-muted">P10 / mean</span><span>{fmt(live.successCase.p10)} / {fmt(live.successCase.mean)}</span></div>
          </div>
        )}

        <div className="mt-2 rounded border border-pl-border p-2 space-y-1.5" data-testid="prospect-econ">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={econOn} data-testid="prospect-econ-on" onChange={(e) => setEconOn(e.target.checked)} />
            <span>Success-case economics (the Suite&apos;s screening NPV, Tax/Royalty, mid-year discounting)</span>
          </label>
          {econOn && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ['price', 'Price, $/boe'], ['life', 'Producing years'], ['decline', 'Decline, %/yr'],
                  ['capex', 'Development, $MM'], ['opexPerBoe', 'Opex, $/boe'], ['opexFixed', 'Fixed opex, $MM/yr'],
                  ['royalty', 'Royalty, %'], ['tax', 'Tax, %'], ['discount', 'Discount, %'],
                ].map(([k, label]) => (
                  <label key={k} className="flex flex-col text-[10px] text-pl-muted">{label}
                    <input className={inputCls} value={econ[k]} data-testid={`econ-${k}`}
                      onChange={(e) => setEcon((s) => ({ ...s, [k]: e.target.value === '' ? '' : Number(e.target.value) }))} />
                  </label>
                ))}
              </div>
              {econRes && !econRes.ok && <p className="text-[10px] text-pl-warning-text">{econRes.reason}</p>}
              {econRes?.ok && (
                <div className="grid grid-cols-3 gap-2 text-xs" data-testid="econ-result">
                  <div><span className="text-pl-muted">NPV{econ.discount} success case</span><div className="font-semibold" data-testid="econ-npv">{fmt(econRes.npvMM)} $MM</div></div>
                  <div><span className="text-pl-muted">Value per boe before development</span><div className="font-semibold" data-testid="econ-unit">{fmt(econRes.unitValue, 2)} $</div></div>
                  <div><span className="text-pl-muted">Development (discounted, after tax)</span><div className="font-semibold">{fmt(econRes.devCost)} $MM</div></div>
                  <p className="col-span-3 text-[10px] text-pl-muted">Production declines from first oil the year after development and recovers the success-case mean ({fmt(econRes.meanMMboe, 2)} MMboe). Saved with the prospect; Risked Reserves Valuation takes the value per barrel and the development cost from it.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Prospect name" value={name}
            data-testid="prospect-name" onChange={(e) => setName(e.target.value)} />
          <button type="button" data-testid="prospect-add"
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-pl-primary text-pl-primary-text hover:bg-pl-sunken text-xs"
            onClick={addToInventory}>
            <Plus className="w-3.5 h-3.5" /> Add to inventory
          </button>
        </div>
        <button type="button" data-testid="prospect-pdf" disabled={!live}
          className="mt-2 px-2.5 py-1 rounded border border-pl-border text-xs text-pl-text hover:bg-pl-sunken disabled:opacity-50"
          title="One page: reviewer header, Pg factors, success-case and risked volumes, signature block"
          onClick={async () => {
            try {
              const doc = await buildProspectSummaryPdf({
                name: name.trim() || 'Unnamed prospect', factors, unrisked: unriskedObj, unit, basis, projectName,
                reviewer: reviewer || reviewerLines({ unitSystem: 'field' }).slice(0, 1), context: context || [],
              });
              doc.save(`prospect_${(name.trim() || 'unnamed').replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`);
            } catch (e) { setStatus(e.message); }
          }}>
          Prospect summary PDF
        </button>
        {status && <p className="mt-1 text-[11px] text-pl-muted" data-testid="prospect-status">{status}</p>}
        {added && (
          <a href={valuationHref} className="mt-1 inline-block text-[11px] text-pl-primary-text hover:text-pl-primary-text-hover hover:underline" data-testid="prospect-value-link">
            Value the inventory in Risked Reserves Valuation (commercial chance, EMV, break-even Pg)
          </a>
        )}
      </div>

      {/* inventory */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-pl-muted mb-1">
          Inventory <span data-testid="prospect-count">{prospects.length}</span>
        </div>
        {prospects.length ? (
          <table className="w-full text-xs" data-testid="prospect-table">
            <thead>
              <tr className="text-pl-muted text-left">
                <th className="pr-2 pb-1 font-medium">Prospect</th>
                <th className="pr-2 pb-1 font-medium">Pg</th>
                <th className="pr-2 pb-1 font-medium">Unrisked mean</th>
                <th className="pr-2 pb-1 font-medium">Unit</th>
                <th className="pr-2 pb-1 font-medium">Basis</th>
                <th className="pr-2 pb-1 font-medium">Risked mean</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => {
                const ppg = chanceOfSuccess(p.pg_factors || {});
                return (
                  <tr key={p.id} data-testid="prospect-row" data-prospect-name={p.name}>
                    <td className="pr-2 py-0.5 text-pl-text">{p.name}</td>
                    <td className="pr-2 py-0.5">{pct(ppg)}</td>
                    <td className="pr-2 py-0.5">{fmt(p.inputs?.mean)}</td>
                    <td className="pr-2 py-0.5 text-pl-muted">{VOLUME_UNITS[p.inputs?.unit]?.label || 'not stated'}</td>
                    <td className="pr-2 py-0.5 text-pl-muted" data-testid="prospect-basis">{p.inputs?.basis || 'not stated'}</td>
                    <td className="pr-2 py-0.5 font-pl-mono text-pl-text">{fmt(p.risked?.risked_mean ?? ppg * (p.inputs?.mean || 0))}</td>
                    <td className="py-0.5 text-right">
                      <button type="button" title={`Delete ${p.name}`} data-testid={`prospect-delete-${p.name}`}
                        className="text-pl-muted hover:text-pl-danger-text" onClick={() => remove(p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-xs text-pl-muted">No prospects yet. Add one above.</p>}
      </div>

      {/* portfolio roll-up */}
      {prospects.length > 0 && (
        <div className="rounded border border-pl-border p-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="portfolio">
          <div className="col-span-2 text-[10px] uppercase tracking-wider text-pl-muted">Portfolio ({rolled.count} prospects, treated independently, in MMboe at 6 Mscf per boe)</div>
          <div className="flex justify-between"><span className="text-pl-muted">Expected risked volume</span><span className="font-semibold" data-testid="portfolio-risked">{fmt(rolled.expectedRiskedVolume)} MMboe</span></div>
          <div className="flex justify-between"><span className="text-pl-muted">Expected discoveries</span><span data-testid="portfolio-discoveries">{fmt(rolled.expectedDiscoveries, 2)}</span></div>
          <div className="flex justify-between"><span className="text-pl-muted">Success-case total</span><span>{fmt(rolled.successCaseMeanTotal)} MMboe</span></div>
          <div className="flex justify-between"><span className="text-pl-muted">P(≥1 discovery)</span><span>{pct(rolled.pAtLeastOneDiscovery)}</span></div>
          {rolled.unstated > 0 && (
            <div className="col-span-2 text-[10px] text-pl-warning-text" data-testid="portfolio-unstated">
              {rolled.unstated} prospect{rolled.unstated === 1 ? '' : 's'} saved without a volume unit {rolled.unstated === 1 ? 'is' : 'are'} left out of these totals. Add {rolled.unstated === 1 ? 'it' : 'them'} again with the unit stated.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
