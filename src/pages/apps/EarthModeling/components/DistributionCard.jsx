// Volume distribution card in QC (Earth Modeling upgrade U2-010): the
// spreads to sample, Run, and P90/P50/P10 per zone from the canonical Monte
// Carlo module (services/volumeDistribution.js). P90 is the low case.
import React, { useState } from 'react';
import { Loader2, Dice5 } from 'lucide-react';
import { runVolumeDistribution } from '../services/volumeDistribution';
import { fmtVolume, volumeUnitLabel } from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const inCls = 'w-16 rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs';
const th = 'px-2 py-1 text-left text-[10px] uppercase tracking-wider text-pl-muted font-medium';
const td = 'px-2 py-1 text-xs text-pl-text whitespace-nowrap';
const LABEL = { hcpv_m3: 'HCPV', stoiip_m3: 'STOIIP', giip_m3: 'GIIP (free gas)' };

// The contact spreads are typed in the display depth unit (a feet session
// types feet) and reach the sampler in metres.
const FT = 0.3048;
export const spreadToM = (v, unit) => {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const x = Number(v);
  return Number.isFinite(x) ? (unit === 'ft' ? x * FT : x) : v;
};

export default function DistributionCard({ built, volumeUnits = 'metric', depthUnit = 'm', onResult }) {
  // 3D grid upgrade: a simulated porosity has no kriging variance, so it varies by a factor (+- percent)
  const simulated = (built?.zones || []).some((z) => (z.provenance?.phi || []).some((r) => r.methodUsed === 'sgs'));
  const [cfg, setCfg] = useState(() => ({ owcPlusMinus: depthUnit === 'ft' ? '30' : '10', gocPlusMinus: '', boPct: '5', bgPct: '5', phiPct: simulated ? '5' : '', ntgPct: '', properties: true, rhoPhiSw: '-0.5', iterations: simulated ? '200' : '500', seed: '1' }));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const run = async () => {
    setError(null); setBusy({ fraction: 0 });
    try {
      const { owcPlusMinus, gocPlusMinus, ...rest } = cfg;
      const d = await runVolumeDistribution(built, {
        ...rest,
        owcPlusMinusM: spreadToM(owcPlusMinus, depthUnit),
        gocPlusMinusM: spreadToM(gocPlusMinus, depthUnit),
      }, { onProgress: (p) => setBusy(p) });
      onResult?.(d);
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };
  const d = built.distribution;
  return (
    <div className="rounded border border-pl-border bg-pl-surface" data-testid="em-dist">
      <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">Volume distribution (Monte Carlo, the Suite's canonical sampler)</div>
      <div className="p-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-pl-muted">
        <label className="flex items-center gap-1" title="Triangular, centred on each contact; all blocks move together">OWC ± {depthUnit} <input className={inCls} data-testid="em-dist-owc" value={cfg.owcPlusMinus} onChange={set('owcPlusMinus')} /></label>
        <label className="flex items-center gap-1">GOC ± {depthUnit} <input className={inCls} data-testid="em-dist-goc" value={cfg.gocPlusMinus} onChange={set('gocPlusMinus')} /></label>
        <label className="flex items-center gap-1">Bo ± % <input className={inCls} data-testid="em-dist-bo" value={cfg.boPct} onChange={set('boPct')} /></label>
        <label className="flex items-center gap-1">Bg ± % <input className={inCls} data-testid="em-dist-bg" value={cfg.bgPct} onChange={set('bgPct')} /></label>
        <label className="flex items-center gap-1" title="Porosity times a triangular factor (for a simulated porosity, which has no kriging variance)">porosity ± % <input className={inCls} data-testid="em-dist-phi" value={cfg.phiPct} onChange={set('phiPct')} /></label>
        <label className="flex items-center gap-1" title="NTG times a triangular factor">NTG ± % <input className={inCls} data-testid="em-dist-ntg" value={cfg.ntgPct} onChange={set('ntgPct')} /></label>
        <label className="flex items-center gap-1" title="Shift each kriged property by a standard normal number of kriging standard deviations per trial">
          <input type="checkbox" data-testid="em-dist-props" checked={cfg.properties} onChange={set('properties')} /> kriged properties
        </label>
        <label className="flex items-center gap-1" title="Correlation between the porosity and Sw shifts">phi-Sw rho <input className={inCls} value={cfg.rhoPhiSw} onChange={set('rhoPhiSw')} /></label>
        <label className="flex items-center gap-1">trials <input className={inCls} data-testid="em-dist-n" value={cfg.iterations} onChange={set('iterations')} /></label>
        <label className="flex items-center gap-1" title="The same seed gives the same result">seed <input className={inCls} value={cfg.seed} onChange={set('seed')} /></label>
        <button type="button" data-testid="em-dist-run" disabled={!!busy} onClick={run}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-primary/50 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dice5 className="w-3.5 h-3.5" />} {busy ? `${Math.round(100 * (busy.fraction || 0))}%` : 'Run'}
        </button>
      </div>
      {error && <p className="px-2 pb-2 text-[11px] text-pl-warning-text">{error}</p>}
      {d && (
        <table className="w-full" data-testid="em-dist-table">
          <thead><tr><th className={th}>Zone</th><th className={th}>Quantity</th><th className={th}>P90 (low)</th><th className={th}>P50</th><th className={th}>P10 (high)</th><th className={th}>Mean</th></tr></thead>
          <tbody>
            {d.zones.flatMap((z) => Object.entries(z.stats).map(([q, s]) => (
              <tr key={`${z.name}-${q}`} className="border-t border-pl-border">
                <td className={td}>{z.name}</td>
                <td className={td}>{LABEL[q]} ({volumeUnitLabel(q, volumeUnits)})</td>
                {['p90', 'p50', 'p10', 'mean'].map((k) => <td key={k} className={td} data-testid={`em-dist-${z.name.replace(/\s+/g, '-').toLowerCase()}-${q.replace('_m3', '')}-${k}`}>{Number.isFinite(s[k]) ? fmtVolume(s[k], q, volumeUnits) : EMPTY_VALUE}</td>)}
              </tr>
            )))}
          </tbody>
        </table>
      )}
      {d && <p className="px-2 py-1 text-[10px] text-pl-muted">{d.iterations} trials, seed {d.seed}; one draw per trial for every zone, so zones that share a contact move together. Varying: {d.zones.map((z) => `${z.name}: ${z.varying.length ? z.varying.join(', ') : 'nothing'}`).join('; ')}. P90 is the low case (the 10th percentile of outcomes).</p>}
    </div>
  );
}
