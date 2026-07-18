// Main area for the Diagnostics tab: the log-log Bourdet plot and the
// detected flow regimes.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { OILFIELD } from '@/utils/welltest/models/modelCatalog';
import { ChartCard, Kpi, WarningBanner, fmt } from './primitives';
import LogLogChart from './LogLogChart';

const REGIME_TONE = {
  'wellbore-storage': 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  radial: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  linear: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  bilinear: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  'boundary-or-pss': 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  'unit-slope': 'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

const DiagnosticsResults = () => {
  const { loglog, regimes, reservoirSpec, configSpec } = useWellTestStudio();

  if (!loglog.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center">
        <p className="text-slate-300 font-medium">Nothing to diagnose yet.</p>
        <p className="text-sm text-slate-500 mt-1">Load gauge data on the Data tab first.</p>
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

  const xLabel = configSpec.config?.testType === 'buildup' ? 'Agarwal equivalent time (hr)' : 'Elapsed time (hr)';

  return (
    <div className="space-y-4 overflow-y-auto">
      {!reservoirSpec.reservoir && <WarningBanner warnings={[reservoirSpec.error]} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Diagnostic points" value={fmt.int(loglog.length)} />
        <Kpi title="Regimes detected" value={fmt.int(regimes.length)} />
        <Kpi title="Radial plateau kh" value={fmt.sig3(plateauKh)} unit="md·ft" accent={plateauKh != null} />
        <Kpi title="Plateau k" value={reservoirSpec.reservoir && plateauKh != null ? fmt.sig3(plateauKh / reservoirSpec.reservoir.h) : '—'} unit="md" />
      </div>

      <ChartCard title="Log-log diagnostic plot" height={360}>
        <LogLogChart loglog={loglog} xLabel={xLabel} />
      </ChartCard>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detected flow regimes</p>
        {regimes.length === 0 && (
          <p className="text-xs text-slate-500">
            No sustained regime found. Try more smoothing, or the test may be dominated by transitions.
          </p>
        )}
        {regimes.map((r, i) => (
          <div key={i} className={`rounded-md border px-3 py-2 text-xs flex justify-between ${REGIME_TONE[r.regime] || REGIME_TONE['unit-slope']}`}>
            <span className="font-medium">{r.label}</span>
            <span>{fmt.sig3(r.xStart)} to {fmt.sig3(r.xEnd)} hr ({fmt.f1(r.spanDecades)} decades)</span>
          </div>
        ))}
        {radial && (
          <p className="text-[11px] text-slate-500">
            The radial stabilization window is the right place for the semilog straight line on the Specialized tab.
          </p>
        )}
      </div>
    </div>
  );
};

export default DiagnosticsResults;
