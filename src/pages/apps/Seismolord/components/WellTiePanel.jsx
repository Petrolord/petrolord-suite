// Well-tie calibration panel (Phase W3): pair well tops with horizons,
// fit the velocity model, inspect honest before/after residuals, and
// apply ONLY on explicit Save — the current model is never silently
// rewritten. Presentation-only: the parent supplies grid loading and
// the apply action, so the whole flow is drivable in a dev harness.

import React, { useMemo, useState } from 'react';
import { Loader2, Ruler, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTiePoints, fitWellTie, calibrationProvenance } from '../engine/wellTie';
import { describeVelocity } from '../engine/velocityModel';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const inputCls = 'rounded-md bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs';

/**
 * @param {Object} p
 * @param {Array} p.wells visible wells (useWells `visible` shape: tops, stations…)
 * @param {Array<{id, name}>} p.horizons saved horizon rows
 * @param {?Object} p.velocityModel normalized current model (layer cakes
 *   only once their boundary grids are loaded — velocityForDisplay)
 * @param {?(Float32Array|null)[]} p.boundaries layer-cake boundary grids
 * @param {number} p.dtUs
 * @param {{nIl, nXl}} p.geom
 * @param {?Object} p.affine resolved survey affine
 * @param {(horizonId: string) => Promise<Float32Array>} p.loadGrid
 * @param {(manifestModel: Object) => Promise<void>} p.onApply
 * @param {'m'|'ft'} [p.depthUnit] the organisation's depth unit for the
 *   residuals and the RMS (the fit itself runs in metres)
 */
export default function WellTiePanel({
  wells, horizons, velocityModel, boundaries, dtUs, geom, affine,
  loadGrid, onApply, depthUnit = 'm',
}) {
  const ft = depthUnit === 'ft';
  const dz = (m) => (ft ? m / 0.3048 : m);
  const du = ft ? 'ft' : 'm';
  const [pairs, setPairs] = useState({});     // topName -> horizonId
  const [fitK, setFitK] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  // Tops to Horizons pairs itself: a horizon made from a top (params
  // source 'well_tops', role 'mapped') is that top's default partner
  const autoPairs = useMemo(() => {
    const out = {};
    for (const h of horizons || []) {
      const p = h.params || {};
      if (p.source === 'well_tops' && p.role === 'mapped' && p.top_name && !out[p.top_name]) out[p.top_name] = h.id;
    }
    return out;
  }, [horizons]);
  const pairOf = (n) => (Object.prototype.hasOwnProperty.call(pairs, n) ? pairs[n] : (autoPairs[n] || ''));

  const topNames = useMemo(() => {
    const names = new Set();
    for (const w of wells || []) for (const t of w.tops || []) names.add(t.name);
    return [...names].sort();
  }, [wells]);

  const runFit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const pairings = topNames
        .filter((n) => pairOf(n))
        .map((topName) => ({ topName, horizonId: pairOf(topName) }));
      if (!pairings.length) throw new Error('Pair at least one top with a horizon.');
      if (!affine) throw new Error('This volume has no usable coordinates.');
      const horizonGrids = new Map();
      for (const p of pairings) {
        if (!horizonGrids.has(p.horizonId)) {
          horizonGrids.set(p.horizonId, await loadGrid(p.horizonId));
        }
      }
      const ties = buildTiePoints(wells, pairings, { affine, geom, dtUs, horizonGrids });
      setResult(fitWellTie(ties, velocityModel, { boundaries, dtUs, fitK }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply(result.manifestModel, {
        ...calibrationProvenance(result),
        fitted_at: new Date().toISOString(),
      });
      setResult(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  if (!velocityModel) {
    return (
      <p className="text-xs text-pl-muted">
        Save a velocity model first: calibration adjusts the CURRENT model’s
        velocities to match the well tops.
      </p>
    );
  }
  if (!topNames.length) {
    return (
      <p className="text-xs text-pl-muted">
        No tops on the visible wells. Import tops (Wells panel) and toggle
        those wells visible to calibrate against them.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="welltie">
      <div className="text-xs text-pl-muted">
        Pair tops with horizons; the fit adjusts
        {velocityModel.kind === 'layercake' ? ' each sampled layer’s V0 ' : ' V0 '}
        so converted horizon depths match the tops (least squares).
        Ties come from every VISIBLE well.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {topNames.map((name) => (
          <label key={name} className="text-xs text-pl-muted flex items-center gap-1">
            {name} ↔
            <select
              className={inputCls}
              value={pairOf(name)}
              onChange={(e) => setPairs((p) => ({ ...p, [name]: e.target.value }))}
              data-testid={`welltie-pair-${name}`}
            >
              <option value="">{EMPTY_VALUE}</option>
              {(horizons || []).map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </label>
        ))}
        {velocityModel.kind === 'linear' && (
          <label className="text-xs text-pl-muted flex items-center gap-1">
            <input type="checkbox" className="accent-pl-primary" checked={fitK}
              onChange={(e) => setFitK(e.target.checked)} data-testid="welltie-fitk" />
            fit k too
          </label>
        )}
        <Button variant="outline" size="sm" onClick={runFit} disabled={busy}
          data-testid="welltie-fit"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Ruler className="w-4 h-4 mr-1" />}
          Fit
        </Button>
      </div>

      {error && <div className="text-xs text-pl-danger-text" data-testid="welltie-error">{error}</div>}

      {result && (
        <div className="rounded-lg border border-pl-border bg-pl-sunken/60 p-2 space-y-2"
          data-testid="welltie-result"
        >
          <div className="text-xs text-pl-text">
            Proposed: <span data-testid="welltie-model">{describeVelocity(result.model)}</span>
            <span className="text-pl-muted" data-testid="welltie-rms">
              {`, RMS ${dz(result.rmsBeforeM).toFixed(1)} ${du} → ${dz(result.rmsAfterM).toFixed(1)} ${du}`}
              {` (${result.residuals.length} ties)`}
            </span>
            {result.fittedLayers.some((f) => !f) && (
              <span className="text-pl-warning-text">
                {' '}· layers {result.fittedLayers
                  .map((f, i) => (!f ? i + 1 : null)).filter(Boolean).join(', ')}
                {' '}not sampled by any tie, so their V0 is kept
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs text-pl-text font-mono">
              <thead>
                <tr className="text-pl-muted">
                  <th className="pr-4 text-left">well</th>
                  <th className="pr-4 text-left">top</th>
                  <th className="pr-4 text-right">TWT ms</th>
                  <th className="pr-4 text-right">{`top ${du}`}</th>
                  <th className="pr-4 text-right">{`before ${du}`}</th>
                  <th className="pr-4 text-right">{`after ${du}`}</th>
                </tr>
              </thead>
              <tbody data-testid="welltie-residuals">
                {result.residuals.map((r) => (
                  <tr key={`${r.wellName}~${r.topName}~${r.horizonId}~${r.twtMs}`}>
                    <td className="pr-4">{r.wellName}</td>
                    <td className="pr-4">{r.topName}</td>
                    <td className="pr-4 text-right">{r.twtMs.toFixed(1)}</td>
                    <td className="pr-4 text-right">{dz(r.zTopM).toFixed(1)}</td>
                    <td className="pr-4 text-right">{dz(r.beforeM).toFixed(1)}</td>
                    <td className={`pr-4 text-right ${Math.abs(r.afterM) > 10 ? 'text-pl-warning-text' : ''}`}>
                      {dz(r.afterM).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg"
              onClick={apply} disabled={applying} data-testid="welltie-apply"
            >
              {applying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Apply to volume
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResult(null)} disabled={applying}>
              Discard
            </Button>
            <span className="text-xs text-pl-muted">
              nothing changes until applied
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
