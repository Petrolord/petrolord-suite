// RMS (stacking) velocities to a velocity model (upgrade U2-006). Paste a
// time and RMS velocity table with its units declared; the Dix interval
// velocities and depths are shown, and the result fills the editor: a
// single V0 + kZ fitted to the Dix depths, or the layer velocities of the
// current layer cake (time-weighted mean interval velocity over each
// layer at the boundary times given). Nothing is saved until Save to volume.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  parseRmsTable, dixIntervals, fitLinearToDix, layerVelocitiesFromDix,
} from '../../lib/dixVelocity';

const inp = 'rounded-md bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs';
const f0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : EMPTY_VALUE);

export default function StackingVelocityPanel({
  velMode, velLayers, layerTimesMs = [], onUseLinear, onUseLayers, depthUnit = 'm',
}) {
  // depths in the organisation's unit (velocities stay in m/s, as entered)
  const ft = depthUnit === 'ft';
  const dz = (m) => (ft ? m / 0.3048 : m);
  const du = ft ? 'ft' : 'm';
  const [text, setText] = useState('');
  const [timeUnit, setTimeUnit] = useState('ms');
  const [velocityUnit, setVelocityUnit] = useState('m/s');
  const res = useMemo(() => {
    if (!text.trim()) return null;
    const { picks, skipped } = parseRmsTable(text, { timeUnit, velocityUnit });
    try {
      const { intervals } = dixIntervals(picks);
      return { intervals, skipped, fit: fitLinearToDix(intervals) };
    } catch (e) {
      return { error: e.message, skipped };
    }
  }, [text, timeUnit, velocityUnit]);
  const layerV = useMemo(() => (res?.intervals && velMode === 'layercake' && layerTimesMs.length === Math.max(0, velLayers.length - 1)
    ? layerVelocitiesFromDix(res.intervals, layerTimesMs) : null), [res, velMode, velLayers, layerTimesMs]);

  return (
    <div className="space-y-1.5 rounded-lg border border-pl-border bg-pl-sunken/60 p-2" data-testid="sl-stacking-velocity">
      <div className="flex flex-wrap items-center gap-2 text-xs text-pl-text">
        <strong>From stacking (RMS) velocities</strong>
        <label className="flex items-center gap-1">Time
          <select className={inp} value={timeUnit} onChange={(e) => setTimeUnit(e.target.value)} aria-label="Time unit">
            <option value="ms">ms (TWT)</option>
            <option value="s">s (TWT)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">Velocity
          <select className={inp} value={velocityUnit} onChange={(e) => setVelocityUnit(e.target.value)} aria-label="Velocity unit">
            <option value="m/s">m/s</option>
            <option value="ft/s">ft/s</option>
          </select>
        </label>
      </div>
      <textarea
        className={`${inp} w-full h-20 font-mono`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'TWT, Vrms per line, e.g.\n1000, 2000\n1600, 2201\n2000, 2382'}
        aria-label="RMS velocity table"
        data-testid="sl-stacking-input"
      />
      {res?.error && <p className="text-xs text-pl-danger-text" data-testid="sl-stacking-error">{res.error}</p>}
      {res?.skipped?.length > 0 && (
        <p className="text-[11px] text-pl-warning-text">{`Lines not read: ${res.skipped.map((k) => k.line).join(', ')}`}</p>
      )}
      {res?.intervals && (
        <>
          <table className="w-full text-xs" data-testid="sl-dix-table">
            <thead>
              <tr className="text-pl-muted text-left">
                <th className="pr-2">TWT (ms)</th>
                <th className="pr-2">Interval velocity (m/s)</th>
                <th>{`Depth at base (${du})`}</th>
              </tr>
            </thead>
            <tbody>
              {res.intervals.map((iv) => (
                <tr key={iv.t1} className="text-pl-text font-mono">
                  <td className="pr-2">{`${f0(iv.t0)} to ${f0(iv.t1)}`}</td>
                  <td className="pr-2">{f0(iv.vint)}</td>
                  <td>{f0(dz(iv.z1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onUseLinear(res.fit)} data-testid="sl-dix-use-linear">
              Use as V0 + kZ
            </Button>
            <span className="text-[11px] text-pl-muted" data-testid="sl-dix-fit">
              {`V(z) = ${f0(res.fit.v0)} + ${res.fit.k.toFixed(3)} z, RMS misfit ${dz(res.fit.rmsM).toFixed(1)} ${du} against the Dix depths`}
            </span>
            {velMode === 'layercake' && (
              <Button
                variant="outline" size="sm"
                disabled={!layerV || layerV.some((v) => v == null)}
                onClick={() => onUseLayers(layerV)}
                title={layerV ? 'Each layer: the time-weighted mean interval velocity across its time span here (k = 0)' : 'Choose every boundary horizon first; the layer times are read at the survey centre'}
                data-testid="sl-dix-use-layers"
              >
                Fill layer velocities
              </Button>
            )}
          </div>
          <p className="text-[11px] text-pl-muted">
            Dix: Vint = sqrt((V2^2 t2 - V1^2 t1) / (t2 - t1)) between consecutive picks, from the datum. Stacking
            velocities approximate RMS velocities for flat layers and short offsets; a pair that gives no real interval
            velocity is refused.
          </p>
        </>
      )}
    </div>
  );
}
