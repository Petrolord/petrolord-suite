// Choke tab results: two-phase critical flow across the Gilbert family, or
// single-phase gas choke with regime and downstream temperature.
import React from 'react';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { Kpi, WarningBanner, fmtU, fmt, SectionLabel } from './primitives';
import { unitLabel } from '@/utils/nodal/units';

const NAMES = {
  gilbert: 'Gilbert',
  ros: 'Ros',
  baxendell: 'Baxendell',
  achong: 'Achong',
  pilehvari: 'Pilehvari',
};

const ChokesResults = () => {
  const { chokeResult, choke, unitSystem } = useNodalStudio();

  if (chokeResult.error) {
    return <WarningBanner warnings={[chokeResult.error]} />;
  }

  if (chokeResult.gas) {
    const g = chokeResult.gas;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi title="Gas rate" value={fmtU('gasRate', g.qMscfd, unitSystem, fmt.int)} unit={unitLabel('gasRate', unitSystem)} accent />
          <Kpi title="Regime" value={g.regime === 'sonic' ? 'Sonic (critical)' : 'Subsonic'} />
          <Kpi title="Critical ratio" value={fmt.f3(g.yc)} />
          <Kpi title="Temperature at bean" value={fmtU('temperature', g.tDnF, unitSystem, fmt.f1)} unit={unitLabel('temperature', unitSystem)} />
        </div>
        {g.tDnF < 32 && (
          <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-4 py-3 text-sm">
            The gas cools below freezing across the bean. Check hydrate conditions; heating may be
            needed to prevent icing.
          </div>
        )}
        {g.regime === 'sonic' && (
          <div className="text-xs text-slate-400">
            Flow is choked: the rate is independent of downstream pressure until the ratio rises
            above the critical value.
          </div>
        )}
      </div>
    );
  }

  const l = chokeResult.liquid;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title={`${NAMES[choke.correlation] || 'Gilbert'} wellhead pressure`} value={fmtU('pressure', l.pwh, unitSystem, fmt.int)} unit={unitLabel('pressure', unitSystem)} accent />
        <Kpi title="Downstream ratio" value={fmt.f2(l.ratio)} />
        <Kpi title="Critical flow" value={l.valid ? 'Yes' : 'Not assured'} />
        <Kpi title="Bean check" value={fmt.f1(l.size)} unit="64ths in" />
      </div>

      {!l.valid && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-sm">
          The downstream to wellhead ratio is above 0.55, so critical flow is not assured and the
          Gilbert family reads are lower bounds. A subcritical model (Sachdeva or Perkins class)
          belongs to a later phase.
        </div>
      )}

      <SectionLabel>All correlations at these conditions</SectionLabel>
      <div className="text-xs text-slate-300 space-y-1 max-w-md">
        {l.allCorrelations.map((c) => (
          <div key={c.id} className="flex justify-between border-b border-slate-800 py-1">
            <span className="text-slate-400">{NAMES[c.id]}</span>
            <span>
              {fmtU('pressure', c.pwh, unitSystem, fmt.int)} {unitLabel('pressure', unitSystem)}
            </span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500">
        Convention: wellhead pressure in psia, rate in gross liquid, GLR in scf/STB, bean in 64ths
        of an inch. Valid for critical (sonic) flow.
      </div>
    </div>
  );
};

export default ChokesResults;
