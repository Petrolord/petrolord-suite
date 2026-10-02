// The angle gather Rock Physics Studio published for this well, shown in
// the synthetics window (upgrade U2-020, second half; contract
// src/lib/rockPhysicsGather.js). Display only: Seismolord draws the stored
// traces with the shared gather canvas and does not recompute them. Time is
// two-way time from the top of the gather's own window (the payload has no
// time-depth relation), so it sits beside the synthetic, not on the seismic.

import React from 'react';
import AngleGatherCanvas from '@/components/charts/AngleGatherCanvas';
import { describeGather } from '@/lib/rockPhysicsGather';

/** @param {{gather: Object}} p a gather as readGather returns it */
export default function RockPhysicsGather({ gather }) {
  if (!gather) return null;
  return (
    <div className="shrink-0 rounded border border-pl-border p-2 space-y-1" data-testid="synth-rp-gather">
      <div className="text-xs text-pl-text" data-testid="synth-rp-gather-caption">{describeGather(gather)}</div>
      {(gather.vpSource === 'estimated' || gather.vsSource === 'estimated') && (
        <div className="text-xs text-pl-warning-text" data-testid="synth-rp-gather-estimated">
          {gather.vpSource === 'estimated' ? 'Vp was estimated (the well has no sonic log)' : 'Vs was estimated (the well has no shear log)'}: the change of amplitude with angle is indicative only.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {gather.cases.map((c) => (
          <AngleGatherCanvas
            key={c.key}
            testid={`synth-rp-gather-${c.key}`}
            traces={c.traces}
            angles={gather.angles}
            dtMs={gather.dtMs}
            gain={gather.gain}
            title={c.label}
            events={[
              ...(c.topSample != null ? [{ sample: c.topSample, label: `top ${gather.zone?.name || ''}`.trim() }] : []),
              ...(c.baseSample != null ? [{ sample: c.baseSample, label: 'base', color: '#64748b' }] : []),
            ]}
          />
        ))}
      </div>
      <table className="text-xs text-pl-text" data-testid="synth-rp-gather-ab">
        <tbody>
          {gather.cases.map((c) => (
            <tr key={c.key}>
              <td className="pr-3 text-pl-muted">{c.label}</td>
              <td className="pr-3">intercept {c.intercept != null ? c.intercept.toFixed(4) : 'n/a'}</td>
              <td>gradient {c.gradient != null ? c.gradient.toFixed(4) : 'n/a'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[11px] text-pl-muted">
        Time is two-way time from the top of the gather window; amplitudes are reflection coefficients at one gain. Published from Rock Physics Studio, Gather view.
      </div>
    </div>
  );
}
