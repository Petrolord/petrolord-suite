// Right-rail diagnostics: tab-aware readouts (waterflood rail pattern).
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, fmt } from './primitives';

const Row = ({ label, value }) => (
  <div className="flex justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-200 font-medium">{value}</span>
  </div>
);

const DiagnosticsRail = ({ activeTab }) => {
  const {
    gaugeRows, prepared, configSpec, regimes, matchParams,
    semilogResult, derivedKpis, fitResult, fitStale, flowPeriods,
  } = useWellTestStudio();
  const isBuildup = configSpec.config?.testType === 'buildup';

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Test</SectionLabel>
        <Row label="Type" value={isBuildup ? 'Buildup' : 'Drawdown'} />
        <Row label="Gauge points" value={gaugeRows.length || '—'} />
        <Row label="Used" value={prepared.points.length || '—'} />
        {isBuildup && <Row label="tp (hr)" value={fmt.f1(configSpec.config?.tp)} />}
        {isBuildup && <Row label="pwf at shut-in" value={fmt.f1(prepared.pwfShutIn)} />}
        {Number.isFinite(flowPeriods.equivalentTp) && <Row label="Equivalent tp (hr)" value={fmt.f1(flowPeriods.equivalentTp)} />}
      </section>

      {(activeTab === 'diagnostics' || activeTab === 'data') && (
        <section>
          <SectionLabel>Regimes</SectionLabel>
          {regimes.length
            ? regimes.map((r, i) => <Row key={i} label={r.label} value={`${fmt.sig3(r.xStart)}-${fmt.sig3(r.xEnd)} hr`} />)
            : <p className="text-[11px] text-slate-500">None detected yet.</p>}
        </section>
      )}

      {(activeTab === 'match' || activeTab === 'report') && (
        <section>
          <SectionLabel>Working match</SectionLabel>
          <Row label="k (md)" value={fmt.sig3(matchParams?.k)} />
          <Row label="Skin" value={fmt.f2(matchParams?.skin)} />
          <Row label="C (bbl/psi)" value={fmt.sig3(matchParams?.C)} />
          <Row label="CD" value={fmt.sig3(derivedKpis?.cd)} />
          <Row label="Fit" value={fitResult ? (fitStale ? 'Stale' : (fitResult.converged ? 'Converged' : 'Partial')) : 'Not run'} />
        </section>
      )}

      {activeTab === 'specialized' && (
        <section>
          <SectionLabel>Straight line</SectionLabel>
          <Row label="m (psi/cycle)" value={fmt.f1(semilogResult?.m)} />
          <Row label="k (md)" value={fmt.sig3(semilogResult?.k)} />
          <Row label="Skin" value={fmt.f2(semilogResult?.skin)} />
          {isBuildup && <Row label="p* (psi)" value={fmt.f1(semilogResult?.pStar)} />}
          <Row label="r²" value={fmt.f3(semilogResult?.r2)} />
        </section>
      )}

      <section>
        <SectionLabel>Derived</SectionLabel>
        <Row label="kh (md·ft)" value={fmt.sig3(derivedKpis?.kh)} />
        <Row label="Radius of inv. (ft)" value={fmt.int(derivedKpis?.ri)} />
        <Row label="Δp skin (psi)" value={fmt.f1(derivedKpis?.dpSkin)} />
        <Row label="Flow efficiency" value={fmt.pct(derivedKpis?.flowEfficiency)} />
      </section>
    </div>
  );
};

export default DiagnosticsRail;
