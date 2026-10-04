// Main area for the Report tab: the consolidated interpretation summary.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';
import { gaugeTime, PWF_SOURCE_TEXT } from '@/utils/welltest/gaugeImport';
import { skinBreakdownRows, flowSummaryHead, flowSummaryBody, inputsFootnote, rateSkinRows, RATE_SKIN_METHOD_TEXT } from '@/utils/welltest/reportModel';
import { buildReportFigures } from '@/utils/welltest/reportFigures';
import { buildCrossCheckRows } from '@/utils/wellTestReportExport';
import { Kpi, fmt, fmtU, MATCH_METHOD_LABEL } from './primitives';

const Card = ({ title, testId, children }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid={testId}>
    <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">{title}</p>
    {children}
  </div>
);

// A plain table that scrolls sideways inside its card on a narrow screen.
const Table = ({ head, body, minWidth = 520 }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs" style={{ minWidth }}>
      <thead>
        <tr className="text-pl-muted text-left">
          {head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody className="text-pl-text">
        {body.map((row, i) => (
          <tr key={i} className="border-t border-pl-border align-top">
            {row.map((cell, j) => <td key={j} className={`py-1 pr-3 ${j === 0 ? 'whitespace-pre' : ''}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

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
  const ctx = useWellTestStudio();
  const {
    wellName, fieldName, analyst, projectName, configSpec, reservoirSpec, prepared,
    matchParams, semilogResult, sqrtResult, pssResult, derivedKpis, sqrtMeaningful,
    multiRateResult, deliverabilityResult, fitResult, matchMethod, regimes, notes, model,
    unitSystem, rtaResult,
    identificationRows, inputsTable, skinBreakdown, flowSummary, pressureBasisRows, dataUse, limitsRows, changingStorage, rateSkin,
  } = ctx;
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
  // the same rows and figure list the PDF prints
  const crossCheck = buildCrossCheckRows({
    model,
    matchParams: derivedKpis?.source === 'match' ? matchParams : null,
    matchMethodKind: matchMethod?.kind,
    fitResult: matchMethod?.kind === 'regression' ? fitResult : null,
    semilogResult, multiRateResult, isBuildup, isGas, skinWithheld: !!prepared.skinWithheld,
  });
  const figures = buildReportFigures(ctx);
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

      <Card title="Well and test identification" testId="wts-report-identification">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {identificationRows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-t border-pl-border py-1">
              <dt className="text-pl-muted">{label}</dt>
              <dd className="text-pl-text font-medium text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(derivedKpis?.k)} unit="md" accent />
        <Kpi title="kh" value={fmt.sig3(fromOilfield('kh', derivedKpis?.kh, unitSystem))} unit={unitLabel('kh', unitSystem)} />
        <Kpi title="Skin (total)" value={fmt.f2(derivedKpis?.skin)} />
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

      <Card title="Gauge, datum and pressure basis" testId="wts-report-basis">
        <Table head={['Item', 'Statement']} body={pressureBasisRows} minWidth={420} />
      </Card>

      <Card title="Skin components" testId="wts-report-skin">
        <Table head={['Component', 'Value', 'Basis']} body={skinBreakdownRows(skinBreakdown, unitSystem)} minWidth={420} />
        {(skinBreakdown.status === 'ok' || skinBreakdown.status === 'full') && (
          <p className="text-[11px] text-pl-muted mt-2">
            {skinBreakdown.method}: {skinBreakdown.formula}.{skinBreakdown.slant ? ` Slant: ${skinBreakdown.slant.formula} (${skinBreakdown.slant.reference}).` : ''}{skinBreakdown.splitFormula ? ` Mechanical skin: ${skinBreakdown.splitFormula}.` : ''}
          </p>
        )}
        {skinBreakdown.message && <p className="text-[11px] text-pl-muted mt-1" data-testid="wts-report-skin-note">{skinBreakdown.message}</p>}
      </Card>

      {isGas && rateSkin && (rateSkin.points.length > 0 || Number.isFinite(rateSkin.litD)) && (
        <Card title="Rate-dependent skin" testId="wts-report-rate-skin">
          <Table head={['Quantity', 'Value', 'Basis']} body={rateSkinRows(rateSkin, unitSystem)} minWidth={420} />
          <p className="text-[11px] text-pl-muted mt-1">{RATE_SKIN_METHOD_TEXT}</p>
        </Card>
      )}

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
              {changingStorage.map(([label, value]) => <Row key={label} label={label} value={value} />)}
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

      {crossCheck.length > 0 && (
        <Card title="Cross-check of methods" testId="wts-report-crosscheck">
          <Table head={['Method', 'k (md)', 'Skin', 'Basis']} body={crossCheck} minWidth={460} />
        </Card>
      )}

      <Card title="Reservoir and fluid inputs" testId="wts-report-inputs">
        <Table head={['Input', 'Value', 'Unit', 'Source and quality']} body={inputsTable.map((r) => [r.label, r.value, r.unit, r.source])} />
        <p className="text-[11px] text-pl-muted mt-2">{inputsFootnote(isGas, reservoirSpec.reservoir?.pvtSource)}</p>
      </Card>

      <Card title="Flow and shut-in summary" testId="wts-report-flow">
        {flowSummary.rows.length > 0 && <Table head={flowSummaryHead(flowSummary, unitSystem)} body={flowSummaryBody(flowSummary)} minWidth={640} />}
        <p className="text-[11px] text-pl-muted mt-2">{flowSummary.note} Choke and recovered volume are entered on the Data tab.</p>
      </Card>

      <Card title="Method and its limits" testId="wts-report-limits">
        <Table head={['Topic', 'Statement']} body={limitsRows} minWidth={420} />
      </Card>

      {dataUse.rows.length > 0 && (
        <Card title="Gauge data used and left out" testId="wts-report-datause">
          <Table head={['Readings', 'Count', 'Treatment']} body={dataUse.rows} minWidth={460} />
          {dataUse.spikes.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-pl-muted mb-1">Spikes removed</p>
              <Table head={dataUse.spikeHead} body={dataUse.spikes} minWidth={260} />
              {dataUse.spikeNote && <p className="text-[11px] text-pl-muted mt-1">{dataUse.spikeNote}</p>}
            </div>
          )}
        </Card>
      )}

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
                <Row label="Productivity index J" value={fmt.sig3(fromOilfield(rtaResult.isGas ? 'gasProductivityIndex' : 'productivityIndex', fmbResult.J, unitSystem))} unit={unitLabel(rtaResult.isGas ? 'gasProductivityIndex' : 'productivityIndex', unitSystem)} />
                <Row label="FMB fit r²" value={fmt.f3(fmbResult.r2)} />
                {rtaResult.linear && (
                  <Row
                    label="Transient linear xf √k"
                    value={fmt.sig3(fromOilfield('xfSqrtK', rtaResult.linear.xfSqrtK, unitSystem))}
                    unit={unitLabel('xfSqrtK', unitSystem)}
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

      <Card title="Plots in the PDF report" testId="wts-report-figures">
        <ul className="space-y-1 text-xs">
          {figures.map((f) => (
            <li key={f.id} className="flex flex-col sm:flex-row sm:gap-2 border-t border-pl-border py-1" data-figure={f.id} data-plotted={f.panels ? 'yes' : 'no'}>
              <span className="text-pl-text font-medium shrink-0">Figure {f.number}. {f.title}</span>
              <span className="text-pl-muted">{f.panels ? 'Drawn from the same series as the tab plots.' : f.statement}</span>
            </li>
          ))}
        </ul>
      </Card>

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
