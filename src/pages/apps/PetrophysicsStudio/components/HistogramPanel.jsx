// Histogram workstation view (Petrophysics Studio PS7): per-curve
// distribution + cumulative frequency with zone filtering, P10/50/90
// readouts, DRAGGABLE cutoff lines writing straight back into the
// parameter set (pairs with the PS1 param-bound track fills: drag the
// cutoff here, watch pay move there), multi-well overlays from the
// curves cache, and the GR normalization fit (engines normalize.js —
// the fitted shift/scale is quotable; APPLYING it to a curve is PS8
// conditioning, and the panel says so).

import React, { useEffect, useMemo, useState } from 'react';
import HistogramChart from './HistogramChart';
import { histogram, cumulative, maskForWindow, passingFraction } from '../viewer/stats';
import { percentile, fitNormalization, applyNormalization } from '../engine/normalize';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const OVERLAY_COLORS = ['#7c3aed', '#dc2626', '#0891b2', '#ca8a04'];

// which parameters bind as draggable cutoffs per curve, and which side
// of the cutoff counts as "passing" for the live readout
const THRESHOLDS = {
  PHIE: [{ param: 'cutPhi', label: 'φ ≥', side: 'above', color: '#d97706' }],
  VSH: [{ param: 'cutVsh', label: 'Vsh ≤', side: 'below', color: '#a3a065' }],
  SW: [{ param: 'cutSw', label: 'Sw ≤', side: 'below', color: '#2563eb' }],
  GR: [
    { param: 'grClean', label: 'clean', side: 'below', color: '#059669' },
    { param: 'grClay', label: 'clay', side: 'above', color: '#a3a065' },
  ],
};

export default function HistogramPanel({
  curves, outputs, params, zones, onApplyParams, onStatus,
  wells, currentWellId, curvesCache,
}) {
  const [curveKey, setCurveKey] = useState('GR');
  const [bins, setBins] = useState(40);
  const [filter, setFilter] = useState('all');    // 'all' | zone id
  const [overlayIds, setOverlayIds] = useState([]); // other well ids
  const [overlayCurves, setOverlayCurves] = useState({}); // wellId -> curves
  const [normTarget, setNormTarget] = useState('');
  const [normMethod, setNormMethod] = useState('two-point');
  const [fit, setFit] = useState(null); // {targetId, result}

  const available = useMemo(() => {
    const out = [];
    for (const key of ['GR', 'RHOB', 'NPHI', 'DT', 'RT']) if (curves[key]) out.push(key);
    for (const key of ['PHIE', 'VSH', 'SW', 'KPERM', 'BVW', 'TEMP']) if (outputs?.[key]) out.push(key);
    return out;
  }, [curves, outputs]);

  const data = curves[curveKey] || outputs?.[curveKey];
  const log = curveKey === 'RT' || curveKey === 'KPERM';

  const mask = useMemo(() => {
    if (filter === 'all' || !curves.DEPT) return null;
    const z = zones.find((x) => x.id === filter);
    return z ? maskForWindow(curves.DEPT, z.top_md_m, z.base_md_m) : null;
  }, [filter, zones, curves]);

  const hist = useMemo(
    () => (data ? histogram(data, { bins, mask, log }) : null),
    [data, bins, mask, log],
  );
  const cum = useMemo(() => (hist ? cumulative(hist.counts) : null), [hist]);
  const pcts = useMemo(() => (hist && hist.n
    ? [10, 50, 90].map((p) => ({ p, value: percentile(hist.values, p) }))
    : []), [hist]);

  // load overlay wells through the cache
  useEffect(() => {
    let live = true;
    (async () => {
      for (const id of overlayIds) {
        if (overlayCurves[id]) continue;
        try {
           
          const { curves: c } = await curvesCache.getCurves(id);
          if (!live) return;
          setOverlayCurves((m) => ({ ...m, [id]: c }));
        } catch (e) {
          if (live) onStatus(e.message);
        }
      }
    })();
    return () => { live = false; };
  }, [overlayIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (!hist) return [];
    const out = [{ name: wells.find((w) => w.id === currentWellId)?.name || 'well', color: '#0891b2', hist }];
    overlayIds.forEach((id, i) => {
      const oc = overlayCurves[id]?.[curveKey];
      if (!oc) return;
      out.push({
        name: wells.find((w) => w.id === id)?.name || id,
        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
        outline: true,
        hist: histogram(oc, { bins, domain: [hist.lo, hist.hi], log }),
      });
    });
    if (fit && fit.curveKey === curveKey && overlayCurves[fit.targetId]?.[curveKey]) {
      out.push({
        name: 'normalized',
        color: '#059669',
        outline: true,
        dash: [4, 3],
        hist: histogram(
          applyNormalization(overlayCurves[fit.targetId][curveKey], fit.result),
          { bins, domain: [hist.lo, hist.hi], log },
        ),
      });
    }
    return out;
  }, [hist, overlayIds, overlayCurves, curveKey, bins, log, wells, currentWellId, fit]);

  const thresholds = (THRESHOLDS[curveKey] || []).map((t) => ({
    key: t.param,
    label: t.label,
    value: params[t.param],
    color: t.color,
  }));

  const passing = useMemo(() => {
    const spec = THRESHOLDS[curveKey]?.[0];
    if (!spec || !data) return null;
    return passingFraction(data, params[spec.param], spec.side, mask);
  }, [curveKey, data, params, mask]);

  const runFit = () => {
    const tgt = overlayCurves[normTarget]?.[curveKey];
    if (!data || !tgt) { onStatus('Load the target well overlay first.'); return; }
    const result = fitNormalization(data, tgt, { method: normMethod });
    setFit({ targetId: normTarget, curveKey, result });
    onStatus(`Normalization fit: shift ${result.shift.toFixed(3)}, scale ${result.scale.toFixed(4)}. Applying to a curve lands with conditioning (PS8).`);
  };

  const otherWells = wells.filter((w) => w.id !== currentWellId);

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="petro-histogram">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 text-xs flex-wrap">
        <label className="flex items-center gap-1 text-slate-500">Curve
          <select className={inputCls} data-testid="petro-hist-curve" value={curveKey}
            onChange={(e) => { setCurveKey(e.target.value); setFit(null); }}
          >
            {available.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-500">Bins
          <input className={`${inputCls} w-14`} data-testid="petro-hist-bins" value={String(bins)}
            onChange={(e) => { const b = Number(e.target.value); if (Number.isFinite(b) && b >= 5 && b <= 200) setBins(b); }} />
        </label>
        <label className="flex items-center gap-1 text-slate-500">Interval
          <select className={inputCls} data-testid="petro-hist-filter" value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Whole well</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        {passing !== null && Number.isFinite(passing) && (
          <span className="text-slate-400" data-testid="petro-hist-passing">
            passing cutoff: <b className="text-slate-200">{(passing * 100).toFixed(1)}%</b>
          </span>
        )}
        {pcts.length > 0 && (
          <span className="text-slate-500" data-testid="petro-hist-pcts">
            {pcts.map((x) => `P${x.p} ${Number(x.value.toPrecision(4))}`).join(' · ')}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {otherWells.map((w) => (
            <label key={w.id} className="flex items-center gap-1 text-slate-400">
              <input
                type="checkbox"
                data-testid={`petro-hist-overlay-${w.name}`}
                checked={overlayIds.includes(w.id)}
                onChange={(e) => {
                  setOverlayIds((ids) => (e.target.checked ? [...ids, w.id] : ids.filter((x) => x !== w.id)));
                  setFit(null);
                }}
              />
              {w.name}
            </label>
          ))}
          {overlayIds.length > 0 && (
            <>
              <select className={inputCls} data-testid="petro-hist-norm-target" value={normTarget}
                onChange={(e) => setNormTarget(e.target.value)}
              >
                <option value="">normalize…</option>
                {overlayIds.map((id) => (
                  <option key={id} value={id}>{wells.find((w) => w.id === id)?.name || id}</option>
                ))}
              </select>
              <select className={inputCls} value={normMethod} onChange={(e) => setNormMethod(e.target.value)}>
                <option value="two-point">two-point P5/P95</option>
                <option value="mean-std">mean-std</option>
              </select>
              <button type="button" data-testid="petro-hist-fit" disabled={!normTarget}
                className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
                onClick={runFit}
              >
                Fit
              </button>
              {fit && (
                <span className="text-slate-300" data-testid="petro-hist-fit-result">
                  shift {fit.result.shift.toFixed(3)} · scale {fit.result.scale.toFixed(4)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {hist && hist.n ? (
          <HistogramChart
            series={series}
            cumulative={cum}
            log={log}
            xLabel={curveKey}
            thresholds={thresholds}
            percentiles={pcts}
            onThresholdChange={(key, value) => {
              onApplyParams({ [key]: value });
              onStatus(`Set ${key} = ${value} from the histogram.`);
            }}
          />
        ) : (
          <p className="p-4 text-xs text-slate-500">No finite samples for {curveKey} in this interval.</p>
        )}
      </div>
    </div>
  );
}
