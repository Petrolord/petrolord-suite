// Main area for the Diagnostics tab: the log-log Bourdet plot and the
// detected flow regimes.
import React, { useMemo } from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { OILFIELD } from '@/utils/welltest/models/modelCatalog';
import { unitLabel } from '@/utils/welltest/units';
import { buildLoglogData } from '@/utils/welltest/plotData';
import { ChartCard, Kpi, WarningBanner, fmt } from './primitives';
import LogLogChart from './LogLogChart';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// Regime rows are labels, so they share one neutral look (colour is kept
// for status in the design system).
const REGIME_ROW = 'border-pl-border bg-pl-sunken text-pl-text';

const DiagnosticsResults = () => {
  const { loglog, regimes, reservoirSpec, configSpec, unitSystem, pseudoTime } = useWellTestStudio();
  const dpKind = reservoirSpec.reservoir?.fluid === 'gas' ? 'pseudoPressure' : 'pressure';
  // display-unit series from the shared builder (the PDF log-log uses it too)
  const displayLoglog = useMemo(
    () => buildLoglogData({ loglog, dpKind, unitSystem }).points,
    [loglog, dpKind, unitSystem],
  );

  if (!loglog.length) {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface px-6 py-10 text-center">
        <p className="text-pl-text font-medium">Nothing to diagnose yet.</p>
        <p className="text-sm text-pl-muted mt-1">Load gauge data on the Data tab first.</p>
      </div>
    );
  }

  // Quick kh from the radial derivative plateau: derivative = 70.6 qBmu/kh.
  const radial = regimes.find((r) => r.regime === 'radial');
  let plateauKh = null;
  if (radial && reservoirSpec.reservoir) {
    const inWindow = loglog.filter((p) => p.x >= radial.xStart && p.x <= radial.xEnd && p.derivative > 0);
    if (inWindow.length) {
      const sorted = inWindow.map((p) => p.derivative).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const r = reservoirSpec.reservoir;
      plateauKh = (OILFIELD.DERIVATIVE_PLATEAU * r.q * r.B * r.mu) / median;
    }
  }

  const timeName = pseudoTime.active ? 'pseudo-time' : 'time';
  const xLabel = configSpec.config?.family === 'buildup'
    ? `Agarwal equivalent ${timeName} (hr)`
    : `Elapsed ${timeName} (hr)`;
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';

  return (
    <div className="space-y-4 overflow-y-auto">
      {!reservoirSpec.reservoir && <WarningBanner warnings={[reservoirSpec.error]} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Diagnostic points" value={fmt.int(loglog.length)} />
        <Kpi title="Regimes detected" value={fmt.int(regimes.length)} />
        <Kpi title="Radial plateau kh" value={fmt.sig3(plateauKh)} unit="md·ft" accent={plateauKh != null} />
        <Kpi title="Plateau k" value={reservoirSpec.reservoir && plateauKh != null ? fmt.sig3(plateauKh / reservoirSpec.reservoir.h) : EMPTY_VALUE} unit="md" />
      </div>

      <ChartCard title="Log-log diagnostic plot" height={360}>
        <LogLogChart loglog={displayLoglog} xLabel={xLabel} yLabel={`${isGas ? 'Δm(p)' : 'Δp'} and derivative (${unitLabel(dpKind, unitSystem)})`} />
      </ChartCard>

      <div className="rounded-lg border border-pl-border bg-pl-surface p-4 space-y-2">
        <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider">Detected flow regimes</p>
        {regimes.length === 0 && (
          <p className="text-xs text-pl-muted">
            No sustained regime found. Try more smoothing, or the test may be dominated by transitions.
          </p>
        )}
        {regimes.map((r, i) => (
          <div key={i} className={`rounded-md border px-3 py-2 text-xs flex justify-between ${REGIME_ROW}`}>
            <span className="font-medium">{r.label}</span>
            <span>{fmt.sig3(r.xStart)} to {fmt.sig3(r.xEnd)} hr ({fmt.f1(r.spanDecades)} decades)</span>
          </div>
        ))}
        {radial && (
          <p className="text-[11px] text-pl-muted">
            The radial stabilization window is the right place for the semilog straight line on the Specialized tab.
          </p>
        )}
      </div>
    </div>
  );
};

export default DiagnosticsResults;
