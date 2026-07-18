// Main area for the Report tab: the consolidated interpretation summary.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';
import { Kpi, fmt, fmtU } from './primitives';

const Row = ({ label, value, unit }) => (
  <tr className="border-t border-slate-800">
    <td className="py-1.5 text-slate-500">{label}</td>
    <td className="py-1.5 text-slate-200 font-medium text-right">{value}{unit ? <span className="text-slate-500 ml-1">{unit}</span> : null}</td>
  </tr>
);

const ci = (pair) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(3)} to ${Number(pair[1]).toPrecision(3)}`
    : null;

const ReportResults = () => {
  const {
    wellName, projectName, configSpec, reservoirSpec, prepared,
    matchParams, semilogResult, sqrtResult, pssResult, derivedKpis,
    multiRateResult, deliverabilityResult, fitResult, fitStale, regimes, notes, model,
    unitSystem,
  } = useWellTestStudio();
  const uL = (kind) => unitLabel(kind, unitSystem);

  if (!prepared.points.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center">
        <p className="text-slate-300 font-medium">Nothing to report yet.</p>
        <p className="text-sm text-slate-500 mt-1">Load data, run the diagnostics and match a model first.</p>
      </div>
    );
  }

  const cfg = configSpec.config;
  const isBuildup = cfg?.family === 'buildup';
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';
  const TEST_LABELS = {
    buildup: 'Pressure buildup',
    drawdown: 'Pressure drawdown',
    injection: 'Injection test',
    falloff: 'Injection falloff',
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-slate-100">{projectName || 'Untitled interpretation'}</p>
            <p className="text-xs text-slate-500">
              {wellName ? `Well ${wellName}. ` : ''}
              {TEST_LABELS[cfg?.testType] || 'Well test'}{isBuildup ? `, tp = ${fmt.f1(cfg.tp)} hr` : ''}
              {isGas ? ', gas analysis in pseudo-pressure m(p)' : ''}. {prepared.points.length} analysis points.
            </p>
          </div>
          <p className="text-xs text-slate-500">Model: {model?.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(derivedKpis?.k)} unit="md" accent />
        <Kpi title="kh" value={fmt.sig3(derivedKpis?.kh)} unit="md·ft" />
        <Kpi title="Skin" value={fmt.f2(derivedKpis?.skin)} />
        <Kpi title="Δp across skin" value={fmtU('pressure', derivedKpis?.dpSkin, unitSystem, fmt.f1)} unit={uL('pressure')} />
        <Kpi title="Radius of investigation" value={fmtU('length', derivedKpis?.ri, unitSystem, fmt.int)} unit={uL('length')} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Model match</p>
          <table className="w-full text-xs">
            <tbody>
              {(model?.parameters || []).map((meta) => {
                const kind = kindForCatalogUnit(meta.unit);
                const v = fromOilfield(kind, matchParams?.[meta.key], unitSystem);
                const label = unitLabel(kind, unitSystem) || meta.unit;
                return (
                  <Row
                    key={meta.key}
                    label={meta.label}
                    value={meta.logScale ? fmt.sig3(v) : fmt.f2(v)}
                    unit={meta.unit === 'dimensionless' || meta.unit === 'fraction' ? undefined : label}
                  />
                );
              })}
              <Row label="Dimensionless storage CD" value={fmt.sig3(derivedKpis?.cd)} />
              <Row label="Flow efficiency" value={fmt.pct(derivedKpis?.flowEfficiency)} />
              {fitResult && <Row label="Regression" value={`${fitResult.converged ? 'converged' : 'stopped early'}${fitStale ? ', stale' : ''}`} />}
              {fitResult && ci(fitResult.confidence95.k) && <Row label="k 95% CI" value={ci(fitResult.confidence95.k)} unit="md" />}
              {fitResult && ci(fitResult.confidence95.skin) && <Row label="Skin 95% CI" value={ci(fitResult.confidence95.skin)} />}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Straight-line analyses</p>
          <table className="w-full text-xs">
            <tbody>
              <Row label={isBuildup ? 'Horner slope m' : 'MDH slope m'} value={fmtU(isGas ? 'pseudoSlope' : 'semilogSlope', semilogResult?.m, unitSystem, isGas ? fmt.sci : fmt.f1)} unit={uL(isGas ? 'pseudoSlope' : 'semilogSlope')} />
              <Row label="Semilog k" value={fmt.sig3(semilogResult?.k)} unit="md" />
              <Row label="Semilog skin" value={fmt.f2(semilogResult?.skin)} />
              {isBuildup && <Row label="Extrapolated p*" value={fmtU('pressure', semilogResult?.pStar, unitSystem, fmt.f1)} unit={uL('pressure')} />}
              <Row label="Semilog fit r²" value={fmt.f3(semilogResult?.r2)} />
              <Row label="sqrt(t) slope" value={fmt.f2(fromOilfield(isGas ? 'pseudoPressure' : 'pressure', sqrtResult?.slope, unitSystem))} unit={`${uL(isGas ? 'pseudoPressure' : 'pressure')}/hr^0.5`} />
              {!isBuildup && pssResult && <Row label="Connected pore volume" value={unitSystem === 'si' ? fmt.f3(fromOilfield('poreVolume', pssResult.poreVolumeMMbbl, unitSystem)) : fmt.f2(pssResult.poreVolumeMMbbl)} unit={unitSystem === 'si' ? 'MM m³' : 'MMbbl'} />}
              {multiRateResult && <Row label="Multi-rate k (Odeh-Jones)" value={fmt.sig3(multiRateResult.k)} unit="md" />}
              {multiRateResult && <Row label="Multi-rate skin" value={fmt.f2(multiRateResult.skin)} />}
            </tbody>
          </table>
        </div>
      </div>

      {deliverabilityResult && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Gas deliverability ({deliverabilityResult.method === 'pseudo-pressure' ? 'pseudo-pressure' : 'pressure-squared'})
          </p>
          <table className="w-full text-xs">
            <tbody>
              {deliverabilityResult.backPressure && (
                <>
                  <Row label="AOF, back-pressure (Rawlins-Schellhardt)" value={fmtU('gasRate', deliverabilityResult.backPressure.aof, unitSystem, fmt.sig3)} unit={uL('gasRate')} />
                  <Row label="Exponent n" value={fmt.f2(deliverabilityResult.backPressure.n)} />
                  <Row label="Coefficient C" value={fmt.sci(deliverabilityResult.backPressure.C)} />
                </>
              )}
              {deliverabilityResult.lit && (
                <>
                  <Row label="AOF, LIT (Houpeurt)" value={fmtU('gasRate', deliverabilityResult.lit.aof, unitSystem, fmt.sig3)} unit={uL('gasRate')} />
                  <Row label="Laminar coefficient a" value={fmt.sci(deliverabilityResult.lit.a)} />
                  <Row label="Turbulent coefficient b" value={fmt.sci(deliverabilityResult.lit.b)} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Flow regimes observed</p>
        {regimes.length ? (
          <p className="text-xs text-slate-300">
            {regimes.map((r) => `${r.label} (${fmt.sig3(r.xStart)} to ${fmt.sig3(r.xEnd)} hr)`).join('; ')}.
          </p>
        ) : (
          <p className="text-xs text-slate-500">No sustained regimes detected.</p>
        )}
      </div>

      {(reservoirSpec.error || configSpec.error) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-xs">
          {reservoirSpec.error || configSpec.error}
        </div>
      )}

      {notes && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Interpretation notes</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  );
};

export default ReportResults;
