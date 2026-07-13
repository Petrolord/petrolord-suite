// Prospect Risking (Integration & Risking G5.3): geologic chance of
// success + risked volumes on top of RCP's unrisked volumetrics, a
// prospect inventory, and a portfolio roll-up. Risked-mean and the
// SUCCESS-CASE percentiles are shown separately by construction — the
// dry-hole risk is never hidden (ProspectRiskEngine contract).
//
// Injected `backend` (rcp_prospects CRUD, or the in-memory harness
// twin) so the whole flow is auth-free-driveable. `unrisked` seeds the
// success-case volumes from RCP's latest run when present; otherwise
// the analyst enters mean/percentiles manually.

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Layers } from 'lucide-react';
import { RISK_FACTORS, chanceOfSuccess, riskProspect, portfolioRollup } from '../../services/ProspectRiskEngine';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

const DEFAULT_FACTORS = { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 };

export default function ProspectRiskingPanel({ backend, unrisked }) {
  const [name, setName] = useState('');
  const [factors, setFactors] = useState(DEFAULT_FACTORS);
  const [vol, setVol] = useState({ mean: '', p90: '', p50: '', p10: '' });
  const [prospects, setProspects] = useState([]);
  const [status, setStatus] = useState(null);

  // seed volumes from RCP's latest run when available
  useEffect(() => {
    if (unrisked && Number.isFinite(unrisked.mean)) {
      setVol({
        mean: String(Math.round(unrisked.mean)),
        p90: unrisked.p90 != null ? String(Math.round(unrisked.p90)) : '',
        p50: unrisked.p50 != null ? String(Math.round(unrisked.p50)) : '',
        p10: unrisked.p10 != null ? String(Math.round(unrisked.p10)) : '',
      });
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
  const live = Number.isFinite(unriskedObj.mean)
    ? riskProspect({ name, factors, unrisked: unriskedObj })
    : null;

  const rolled = useMemo(() => portfolioRollup(prospects.map((p) => ({
    pg: chanceOfSuccess(p.pg_factors || {}),
    riskedMean: (p.risked?.risked_mean ?? (chanceOfSuccess(p.pg_factors || {}) * (p.inputs?.mean || 0))),
    successCase: { mean: p.inputs?.mean || 0 },
  }))), [prospects]);

  const addToInventory = async () => {
    if (!name.trim()) { setStatus('Name the prospect.'); return; }
    if (!Number.isFinite(unriskedObj.mean)) { setStatus('Enter an unrisked mean volume.'); return; }
    try {
      await backend.saveProspect({
        name: name.trim(),
        pgFactors: factors,
        inputs: { mean: unriskedObj.mean, p90: unriskedObj.p90, p50: unriskedObj.p50, p10: unriskedObj.p10 },
        risked: { pg: live.pg, risked_mean: live.riskedMean, success: live.successCase },
      });
      setStatus(`Added ${name.trim()} to the inventory.`);
      setName('');
      await refresh();
    } catch (e) { setStatus(e.message); }
  };

  const remove = async (p) => {
    try { await backend.deleteProspect(p); await refresh(); }
    catch (e) { setStatus(e.message); }
  };

  return (
    <div className="space-y-4 text-slate-200" data-testid="prospect-risking">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Prospect Risking</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Pg factors */}
          <div className="rounded border border-slate-800 p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Chance of success (Pg)</div>
            {RISK_FACTORS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-xs capitalize">
                <span className="w-20 text-slate-400">{f}</span>
                <input type="range" min="0" max="1" step="0.05" value={factors[f] ?? 1}
                  data-testid={`pg-${f}`} className="flex-1"
                  onChange={(e) => setFactors((s) => ({ ...s, [f]: Number(e.target.value) }))} />
                <span className="w-10 text-right tabular-nums" data-testid={`pgv-${f}`}>{pct(factors[f] ?? 1)}</span>
              </label>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-xs">
              <span className="text-slate-400">Pg =</span>
              <span className="font-semibold text-amber-300" data-testid="pg-total">{pct(pg)}</span>
            </div>
          </div>

          {/* unrisked volume */}
          <div className="rounded border border-slate-800 p-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Unrisked volume {unrisked ? '(from last run)' : '(enter)'}
            </div>
            {['mean', 'p90', 'p50', 'p10'].map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-slate-400 uppercase">{k}</span>
                <input className={`${inputCls} flex-1`} value={vol[k]} data-testid={`vol-${k}`}
                  onChange={(e) => setVol((s) => ({ ...s, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        {/* live risked readout */}
        {live && (
          <div className="mt-2 rounded border border-amber-900/50 bg-amber-950/20 p-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="risked-readout">
            <div className="flex justify-between"><span className="text-slate-400">Risked mean (EMV basis)</span><span className="font-semibold" data-testid="risked-mean">{fmt(live.riskedMean)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">P(failure)</span><span>{pct(live.pFailure)}</span></div>
            <div className="col-span-2 text-[10px] text-slate-500 pt-1">Success case (volumes given discovery):</div>
            <div className="flex justify-between"><span className="text-slate-400">P90 / P50</span><span data-testid="success-p90p50">{fmt(live.successCase.p90)} / {fmt(live.successCase.p50)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">P10 / mean</span><span>{fmt(live.successCase.p10)} / {fmt(live.successCase.mean)}</span></div>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Prospect name" value={name}
            data-testid="prospect-name" onChange={(e) => setName(e.target.value)} />
          <button type="button" data-testid="prospect-add"
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-amber-700/60 text-amber-300 hover:bg-amber-500/10 text-xs"
            onClick={addToInventory}>
            <Plus className="w-3.5 h-3.5" /> Add to inventory
          </button>
        </div>
        {status && <p className="mt-1 text-[11px] text-slate-400" data-testid="prospect-status">{status}</p>}
      </div>

      {/* inventory */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Inventory <span data-testid="prospect-count">{prospects.length}</span>
        </div>
        {prospects.length ? (
          <table className="w-full text-xs" data-testid="prospect-table">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="pr-2 pb-1 font-medium">Prospect</th>
                <th className="pr-2 pb-1 font-medium">Pg</th>
                <th className="pr-2 pb-1 font-medium">Unrisked mean</th>
                <th className="pr-2 pb-1 font-medium">Risked mean</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => {
                const ppg = chanceOfSuccess(p.pg_factors || {});
                return (
                  <tr key={p.id} data-testid="prospect-row" data-prospect-name={p.name}>
                    <td className="pr-2 py-0.5 text-slate-200">{p.name}</td>
                    <td className="pr-2 py-0.5">{pct(ppg)}</td>
                    <td className="pr-2 py-0.5">{fmt(p.inputs?.mean)}</td>
                    <td className="pr-2 py-0.5 text-amber-300">{fmt(p.risked?.risked_mean ?? ppg * (p.inputs?.mean || 0))}</td>
                    <td className="py-0.5 text-right">
                      <button type="button" title={`Delete ${p.name}`} data-testid={`prospect-delete-${p.name}`}
                        className="text-slate-500 hover:text-red-400" onClick={() => remove(p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-xs text-slate-600">No prospects yet — add one above.</p>}
      </div>

      {/* portfolio roll-up */}
      {prospects.length > 0 && (
        <div className="rounded border border-slate-800 p-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="portfolio">
          <div className="col-span-2 text-[10px] uppercase tracking-wider text-slate-500">Portfolio ({rolled.count} prospects, treated independently)</div>
          <div className="flex justify-between"><span className="text-slate-400">Expected risked volume</span><span className="font-semibold" data-testid="portfolio-risked">{fmt(rolled.expectedRiskedVolume)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Expected discoveries</span><span data-testid="portfolio-discoveries">{fmt(rolled.expectedDiscoveries, 2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Success-case total</span><span>{fmt(rolled.successCaseMeanTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">P(≥1 discovery)</span><span>{pct(rolled.pAtLeastOneDiscovery)}</span></div>
        </div>
      )}
    </div>
  );
}
