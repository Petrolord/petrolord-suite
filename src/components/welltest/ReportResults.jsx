// Main area for the Report tab: the consolidated interpretation summary.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';
import { gaugeTime, PWF_SOURCE_TEXT } from '@/utils/welltest/gaugeImport';
import { Kpi, fmt, fmtU, MATCH_METHOD_LABEL } from './primitives';

const Row = ({ label, value, unit }) => (
  <tr className="border-t border-pl-border">
    <td className="py-1.5 text-pl-muted">{label}</td>
    <td className="py-1.5 text-pl-text font-medium text-right">{value}{unit ? <span className="text-pl-muted ml-1">{unit}</span> : null}</td>
  </tr>
);

const ci = (pair) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(3)} to ${Number(pair[1]).toPrecision(3)}`
    : null;

const ReportResults = () => {
  const {
    wellName, fieldName, analyst, projectName, configSpec, reservoirSpec, prepared,
    matchParams, semilogResult, sqrtResult, pssResult, derivedKpis, sqrtMeaningful,
    multiRateResult, deliverabilityResult, fitResult, matchMethod, regimes, notes, model,
    unitSystem, rtaResult,
  } = useWellTestStudio();
  const uL = (kind) => unitLabel(kind, unitSystem);

  if (!prepared.points.length) {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface px-6 py-10 text-center">
        <p className="text-pl-text font-medium">Nothing to report yet.</p>
        <p className="text-sm text-pl-muted mt-1">Load data, run the diagnostics and match a model first.</p>
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
      <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-pl-text">{projectName || 'Untitled interpretation'}</p>
            <p className="text-xs text-pl-muted" data-testid="wts-report-identity">
              {[
                wellName ? `Well ${wellName}` : null,
                fieldName ? `Field ${fieldName}` : null,
                analyst ? `Analyst ${analyst}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-pl-muted">
              {TEST_LABELS[cfg?.testType] || 'Well test'}{isBuildup ? `, tp = ${fmt.f1(cfg.tp)} hr` : ''}
              {isGas ? ', gas analysis in pseudo-pressure m(p)' : ''}. {prepared.points.length} analysis points.
            </p>
            {isBuildup && Number.isFinite(prepared.pwfShutIn) && (
              <p className="text-xs text-pl-muted" data-testid="wts-report-pwf">
                {cfg.mirror ? 'pwi' : 'pwf'} at shut-in, Δt = 0 hr (gauge time {gaugeTime(prepared.testStartTime)} hr): {fmtU('pressure', prepared.pwfShutIn, unitSystem, fmt.f1)} {uL('pressure')} ({PWF_SOURCE_TEXT[prepared.pwfSource?.kind] || 'from data'}).
              </p>
            )}
          </div>
          <p className="text-xs text-pl-muted">Model: {model?.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(derivedKpis?.k)} unit="md" accent />
        <Kpi title="kh" value={fmt.sig3(derivedKpis?.kh)} unit="md·ft" />
        <Kpi title="Skin" value={fmt.f2(derivedKpis?.skin)} />
        <Kpi title="Δp across skin" value={fmtU('pressure', derivedKpis?.dpSkin, unitSystem, fmt.f1)} unit={uL('pressure')} />
        <Kpi title="Radius of investigation" value={fmtU('length', derivedKpis?.ri, unitSystem, fmt.int)} unit={uL('length')} />
      </div>
      <p className="text-[11px] text-pl-muted -mt-2" data-testid="wts-report-source">
        {derivedKpis?.source === 'match'
          ? 'Headline values from the working model match.'
          : derivedKpis?.source === 'semilog'
            ? 'Headline values from the semilog straight line: the model match has not been adjusted or fitted yet.'
            : 'No interpretation yet: fit a model or set a semilog window.'}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-1">Model match</p>
          {derivedKpis?.source !== 'match' ? (
            <p className="text-xs text-pl-muted py-2" data-testid="wts-report-no-match">
              Not matched yet. Adjust the sliders or run Auto-fit on the Match tab; the starting values are not reported.
            </p>
          ) : (
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
              <Row label="Match method" value={MATCH_METHOD_LABEL(matchMethod, fitResult)} />
              {matchMethod?.kind === 'regression' && ci(fitResult.confidence95.k) && <Row label="k 95% CI" value={ci(fitResult.confidence95.k)} unit="md" />}
              {matchMethod?.kind === 'regression' && !prepared?.skinWithheld && ci(fitResult.confidence95.skin) && <Row label="Skin 95% CI" value={ci(fitResult.confidence95.skin)} />}
            </tbody>
          </table>
          )}
        </div>

        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-1">Straight-line analyses</p>
          <table className="w-full text-xs">
            <tbody>
              <Row label={isBuildup ? 'Horner slope m' : 'MDH slope m'} value={fmtU(isGas ? 'pseudoSlope' : 'semilogSlope', semilogResult?.m, unitSystem, isGas ? fmt.sci : fmt.f1)} unit={uL(isGas ? 'pseudoSlope' : 'semilogSlope')} />
              <Row label="Semilog k" value={fmt.sig3(semilogResult?.k)} unit="md" />
              <Row label="Semilog skin" value={fmt.f2(semilogResult?.skin)} />
              {isBuildup && <Row label="Extrapolated p*" value={fmtU('pressure', semilogResult?.pStar, unitSystem, fmt.f1)} unit={uL('pressure')} />}
              <Row label="Semilog fit r²" value={fmt.f3(semilogResult?.r2)} />
{sqrtMeaningful &&               <Row label="sqrt(t) slope" value={fmt.f2(fromOilfield(isGas ? 'pseudoPressure' : 'pressure', sqrtResult?.slope, unitSystem))} unit={`${uL(isGas ? 'pseudoPressure' : 'pressure')}/hr^0.5`} />}
              {!isBuildup && pssResult && <Row label="Connected pore volume" value={unitSystem === 'si' ? fmt.f3(fromOilfield('poreVolume', pssResult.poreVolumeMMbbl, unitSystem)) : fmt.f2(pssResult.poreVolumeMMbbl)} unit={unitSystem === 'si' ? 'MM m³' : 'MMbbl'} />}
              {multiRateResult && <Row label="Multi-rate k (Odeh-Jones)" value={fmt.sig3(multiRateResult.k)} unit="md" />}
              {multiRateResult && <Row label="Multi-rate skin" value={fmt.f2(multiRateResult.skin)} />}
            </tbody>
          </table>
        </div>
      </div>

      {deliverabilityResult && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-1">
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

      {(() => {
        if (!rtaResult?.fmb) return null;
        const fmbResult = rtaResult.fmb;
        const inPlace = rtaResult.isGas
          ? (unitSystem === 'si'
            ? { label: 'OGIP G', value: fmt.f3((fmbResult.G * 28.3168466) / 1e9), unit: '10⁹ m³' }
            : { label: 'OGIP G', value: fmt.f2(fmbResult.G / 1e6), unit: 'Bcf' })
          : (unitSystem === 'si'
            ? { label: 'OOIP N', value: fmt.f3((fmbResult.N * 0.158987294928) / 1e6), unit: 'MM m³' }
            : { label: 'OOIP N', value: fmt.f2(fmbResult.N / 1e6), unit: 'MMSTB' });
        return (
          <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
            <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-1">Rate transient analysis (production data)</p>
            <table className="w-full text-xs">
              <tbody>
                <Row label={`${inPlace.label}, flowing material balance`} value={inPlace.value} unit={inPlace.unit} />
                <Row label="Productivity index J" value={fmt.sig3(fmbResult.J)} />
                <Row label="FMB fit r²" value={fmt.f3(fmbResult.r2)} />
                {rtaResult.linear && (
                  <Row
                    label="Transient linear xf √k"
                    value={fmt.sig3(unitSystem === 'si' ? rtaResult.linear.xfSqrtK * 0.3048 : rtaResult.linear.xfSqrtK)}
                    unit={unitSystem === 'si' ? 'm·√md' : 'ft·√md'}
                  />
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
        <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Flow regimes observed</p>
        {regimes.length ? (
          <p className="text-xs text-pl-text">
            {regimes.map((r) => `${r.label} (${fmt.sig3(r.xStart)} to ${fmt.sig3(r.xEnd)} hr)`).join('; ')}.
          </p>
        ) : (
          <p className="text-xs text-pl-muted">No sustained regimes detected.</p>
        )}
      </div>

      {(reservoirSpec.error || configSpec.error) && (
        <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-4 py-3 text-xs">
          {reservoirSpec.error || configSpec.error}
        </div>
      )}

      {notes && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Interpretation notes</p>
          <p className="text-sm text-pl-text whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  );
};

export default ReportResults;
