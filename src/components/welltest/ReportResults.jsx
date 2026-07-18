// Main area for the Report tab: the consolidated interpretation summary.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { Kpi, fmt } from './primitives';

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
    fitResult, fitStale, regimes, notes, model,
  } = useWellTestStudio();

  if (!prepared.points.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center">
        <p className="text-slate-300 font-medium">Nothing to report yet.</p>
        <p className="text-sm text-slate-500 mt-1">Load data, run the diagnostics and match a model first.</p>
      </div>
    );
  }

  const cfg = configSpec.config;
  const isBuildup = cfg?.testType === 'buildup';

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-slate-100">{projectName || 'Untitled interpretation'}</p>
            <p className="text-xs text-slate-500">
              {wellName ? `Well ${wellName}. ` : ''}{isBuildup ? `Pressure buildup, tp = ${fmt.f1(cfg.tp)} hr.` : 'Pressure drawdown.'} {prepared.points.length} analysis points.
            </p>
          </div>
          <p className="text-xs text-slate-500">Model: {model?.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(derivedKpis?.k)} unit="md" accent />
        <Kpi title="kh" value={fmt.sig3(derivedKpis?.kh)} unit="md·ft" />
        <Kpi title="Skin" value={fmt.f2(derivedKpis?.skin)} />
        <Kpi title="Δp across skin" value={fmt.f1(derivedKpis?.dpSkin)} unit="psi" />
        <Kpi title="Radius of investigation" value={fmt.int(derivedKpis?.ri)} unit="ft" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Model match</p>
          <table className="w-full text-xs">
            <tbody>
              {(model?.parameters || []).map((meta) => (
                <Row
                  key={meta.key}
                  label={meta.label}
                  value={meta.logScale ? fmt.sig3(matchParams?.[meta.key]) : fmt.f2(matchParams?.[meta.key])}
                  unit={meta.unit === 'dimensionless' || meta.unit === 'fraction' ? undefined : meta.unit}
                />
              ))}
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
              <Row label={isBuildup ? 'Horner slope m' : 'MDH slope m'} value={fmt.f1(semilogResult?.m)} unit="psi/cycle" />
              <Row label="Semilog k" value={fmt.sig3(semilogResult?.k)} unit="md" />
              <Row label="Semilog skin" value={fmt.f2(semilogResult?.skin)} />
              {isBuildup && <Row label="Extrapolated p*" value={fmt.f1(semilogResult?.pStar)} unit="psi" />}
              <Row label="Semilog fit r²" value={fmt.f3(semilogResult?.r2)} />
              <Row label="sqrt(t) slope" value={fmt.f2(sqrtResult?.slope)} unit="psi/hr^0.5" />
              {!isBuildup && pssResult && <Row label="Connected pore volume" value={fmt.f2(pssResult.poreVolumeMMbbl)} unit="MMbbl" />}
            </tbody>
          </table>
        </div>
      </div>

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
