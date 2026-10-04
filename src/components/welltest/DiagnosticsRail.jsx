// Right-rail diagnostics: tab-aware readouts (waterflood rail pattern).
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { gaugeTime } from '@/utils/welltest/gaugeImport';
import { SectionLabel, fmt, fmtU, MATCH_METHOD_LABEL } from './primitives';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const Row = ({ label, value }) => (
  <div className="flex justify-between text-xs py-1 border-b border-pl-border last:border-0">
    <span className="text-pl-muted">{label}</span>
    <span className="text-pl-text font-medium">{value}</span>
  </div>
);

const DiagnosticsRail = ({ activeTab }) => {
  const {
    gaugeRows, prepared, configSpec, regimes, matchParams,
    semilogResult, derivedKpis, fitResult, matchMethod, flowPeriods,
    reservoirSpec, unitSystem, skinBreakdown,
  } = useWellTestStudio();
  const isBuildup = configSpec.config?.family === 'buildup';
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';
  const uL = (kind) => unitLabel(kind, unitSystem);

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Test</SectionLabel>
        <Row label="Type" value={isBuildup ? 'Buildup' : 'Drawdown'} />
        <Row label="Gauge points" value={gaugeRows.length || EMPTY_VALUE} />
        <Row label="Used" value={prepared.points.length || EMPTY_VALUE} />
        {isBuildup && <Row label="tp (hr)" value={fmt.f1(configSpec.config?.tp)} />}
        {isBuildup && <Row label={`pwf at Δt = 0 (${uL('pressure')})`} value={fmtU('pressure', prepared.pwfShutIn, unitSystem, fmt.f1)} />}
        {prepared.testStartTime ? <Row label={isBuildup ? 'Shut-in, gauge clock (hr)' : 'Flow start, gauge clock (hr)'} value={gaugeTime(prepared.testStartTime)} /> : null}
        {Number.isFinite(flowPeriods.equivalentTp) && <Row label="Equivalent tp (hr)" value={fmt.f1(flowPeriods.equivalentTp)} />}
      </section>

      {(activeTab === 'diagnostics' || activeTab === 'data') && (
        <section>
          <SectionLabel>Regimes</SectionLabel>
          {regimes.length
            ? regimes.map((r, i) => <Row key={i} label={r.label} value={`${fmt.sig3(r.xStart)}-${fmt.sig3(r.xEnd)} hr`} />)
            : <p className="text-[11px] text-pl-muted">None detected yet.</p>}
        </section>
      )}

      {(activeTab === 'match' || activeTab === 'report') && (
        <section>
          <SectionLabel>Working match</SectionLabel>
          <Row label="k (md)" value={fmt.sig3(matchParams?.k)} />
          <Row label="Skin" value={prepared.skinWithheld ? 'withheld' : fmt.f2(matchParams?.skin)} />
          <Row label={`C (${uL('storage')})`} value={fmtU('storage', matchParams?.C, unitSystem, fmt.sig3)} />
          <Row label="CD" value={fmt.sig3(derivedKpis?.cd)} />
          <Row label="Match method" value={MATCH_METHOD_LABEL(matchMethod, fitResult)} />
        </section>
      )}

      {activeTab === 'specialized' && (
        <section>
          <SectionLabel>Straight line</SectionLabel>
          <Row label={`m (${uL(isGas ? 'pseudoSlope' : 'semilogSlope')})`} value={isGas ? fmt.sci(fromOilfield('pseudoSlope', semilogResult?.m, unitSystem)) : fmtU('semilogSlope', semilogResult?.m, unitSystem, fmt.f1)} />
          <Row label="k (md)" value={fmt.sig3(semilogResult?.k)} />
          <Row label="Skin" value={prepared.skinWithheld ? 'withheld' : fmt.f2(semilogResult?.skin)} />
          {isBuildup && <Row label={`p* (${uL('pressure')})`} value={fmtU('pressure', semilogResult?.pStar, unitSystem, fmt.f1)} />}
          <Row label="r²" value={fmt.f3(semilogResult?.r2)} />
        </section>
      )}

      <section>
        <SectionLabel>Derived</SectionLabel>
        <p className="text-[10px] text-pl-muted -mt-1 mb-1" data-testid="wts-derived-source">
          {derivedKpis?.source === 'match' ? 'From the working match' : derivedKpis?.source === 'semilog' ? 'From the semilog line (match not yet adjusted)' : 'Needs a semilog line or a match'}
        </p>
        <Row label={`kh (${uL('kh')})`} value={fmtU('kh', derivedKpis?.kh, unitSystem, fmt.sig3)} />
        <Row label={`Radius of inv. (${uL('length')})`} value={fmtU('length', derivedKpis?.ri, unitSystem, fmt.int)} />
        <Row label={`Δp skin (${uL('pressure')})`} value={fmtU('pressure', derivedKpis?.dpSkin, unitSystem, fmt.f1)} />
        <Row label="Flow efficiency" value={fmt.pct(derivedKpis?.flowEfficiency)} />
        {(skinBreakdown?.status === 'ok' || skinBreakdown?.status === 'full') && (
          <>
            <Row label="Partial-penetration skin" value={fmt.f2(skinBreakdown.spp)} />
            <Row label="Mechanical skin" value={fmt.f2(skinBreakdown.mechanicalSkin)} />
          </>
        )}
      </section>
    </div>
  );
};

export default DiagnosticsRail;
