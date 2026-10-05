// The Well Spacing results (WS-U1). The tables are the rows of the report
// model (reportModel.js), so the screen and the PDF print the same numbers
// (RL12); the charts draw the engine's series in the display units, on the
// white chart standard with the Petrolord mark inside the plot area.
//
// Before this round the NPV and capex columns were headed "$M" while the
// values are US$ million (WS-U1-001: in oilfield usage M is a thousand, so
// the heading read 1,000 times low), the initial rate each case assumes was
// computed and never shown (WS-U1-005), and the results stayed on screen
// after an input changed until Calculate was pressed (WS-U1-006).
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Target, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { ChartPanel } from '@/components/ui/chart-panel';
import { boNote, NO_OPTIMUM_NOTE } from '@/utils/wellSpacingCalculations';
import { buildWellSpacingReportModel } from '@/utils/wellspacing/reportModel';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useWellSpacing } from '@/contexts/WellSpacingContext';

const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
// WS-U1-012: the mark sat over the last X tick labels; it now sits inside the plot area, clear of the axis
const LOGO_STYLE = { bottom: `${XAXIS_LABEL_HEIGHT + 14}px`, right: '22px', height: '32px' };

const SpacingChart = ({ data, xKey, xLabel, lines, unit, fmt = (v) => v, log = false }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} {...AXIS} height={XAXIS_LABEL_HEIGHT}
        tickFormatter={(v) => Number(Number(v).toPrecision(4))}
        label={{ value: xLabel, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
      <YAxis {...AXIS} width={64} tickFormatter={fmt} scale={log ? 'log' : 'auto'} domain={log ? ['auto', 'auto'] : [0, 'auto']} allowDataOverflow={false}
        label={{ value: unit, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `${Number(Number(v).toPrecision(5))} ${xLabel.replace(/^.*\(|\)$/g, '')}`} formatter={(v, n) => [fmt(v), n]} />
      {lines.length > 1 && <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11 }} />}
      {lines.map((l) => (
        <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
      ))}
    </LineChart>
  </ResponsiveContainer>
);

const Table = ({ head, rows, testId, note }) => (
  <div className="space-y-1">
    <div className="overflow-x-auto">
      <table className="w-full text-pl-text text-xs" data-testid={testId}>
        <thead>
          <tr className="border-b border-pl-border">
            {head.map((h, i) => <th key={h} className={`py-2 px-2 text-pl-muted font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-pl-border hover:bg-pl-sunken">
              {r.map((c, j) => <td key={j} className={`py-1.5 px-2 font-pl-mono tabular-nums ${j === 0 ? 'text-left whitespace-nowrap' : 'text-right'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {note && <p className="text-[11px] text-pl-muted">{note}</p>}
  </div>
);

const Section = ({ title, children, testId, actions = null }) => (
  <section className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 shadow-pl-sm space-y-3 min-w-0" data-testid={testId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold text-pl-text">{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

const ResultsPanel = ({ downloadCSV, downloadJSON }) => {
  const { inputs, results, errors, u, projectName, organizationName, mc, mcStale, runMonteCarlo } = useWellSpacing();
  const [mcBusy, setMcBusy] = useState(false);
  const model = useMemo(
    () => (results ? buildWellSpacingReportModel(inputs, { results, projectName, organizationName, system: u.system, mc }) : null),
    [inputs, results, projectName, organizationName, u.system, mc],
  );

  if (!results) {
    return (
      <Section title="Spacing cases" testId="ws-no-results">
        <div className="flex gap-2 text-sm text-pl-warning-text">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{errors.length === 1 ? 'One input needs attention' : `${errors.length} inputs need attention`} before the cases can be computed.</p>
            <ul className="list-disc list-inside text-xs mt-1" data-testid="ws-errors">{errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
            <p className="text-xs text-pl-muted mt-2">Or load the example field to see the study on an illustrative case.</p>
          </div>
        </div>
      </Section>
    );
  }

  const rows = results.spacingResults;
  const data = rows.map((r) => ({
    spacing: u.show('spacing', r.spacing),
    wells: r.numberOfWells,
    npv: r.npv,
    npvOther: r.rateLimit?.binding ? (inputs.form?.rateLimit !== 'off' ? r.rateLimit.npvUnlimited : r.rateLimit.npvLimited) : null,
    produced_rate: u.show('rate', r.rateLimit?.limitedStartRateStbd),
    eur: u.show('eur', r.eurPerWell),
    produced: u.show('eur', r.producedPerWell),
    cost: Number.isFinite(r.costPerBarrel) ? r.costPerBarrel : null,
    plan: u.show('rate', r.initialRateBpd),
    deliverable: Number.isFinite(r.drainage.pssRateStbd) ? u.show('rate', r.drainage.pssRateStbd) : null,
  }));
  const hasDeliv = data.some((d) => d.deliverable != null);
  const anyBinding = rows.some((r) => r.rateLimit?.binding);
  const rlOn = inputs.form?.rateLimit !== 'off';
  const rateVals = data.flatMap((d) => [d.plan, d.deliverable]).filter((v) => v > 0);
  const rateLog = hasDeliv && Math.max(...rateVals) / Math.min(...rateVals) > 20;
  const spacingLabel = `Well spacing (${u.label('spacing')})`;

  return (
    <div className="space-y-6" data-testid="ws-results">
      <Section
        title="Spacing cases" testId="ws-cases"
        actions={(
          <div className="flex gap-2">
            <Button onClick={downloadCSV} variant="outline" size="sm" data-testid="ws-csv"><Download className="w-4 h-4 mr-2" />CSV</Button>
            <Button onClick={downloadJSON} variant="outline" size="sm" data-testid="ws-json"><FileText className="w-4 h-4 mr-2" />JSON</Button>
          </div>
        )}
      >
        <div className="bg-pl-warning-bg rounded-lg p-4 border border-pl-warning/40 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-pl-warning-text" />
            <h3 className="text-base font-semibold text-pl-text">How to read this</h3>
          </div>
          <p className="text-pl-warning-text text-sm">
            This model gives every well the recovery factor you entered over the area it drains, and models no interference
            between wells. Under that assumption total field volume barely changes with spacing while capex falls as wells are
            removed, so without a rate limit NPV rises with spacing and the highest NPV is simply the widest spacing that divides
            your area with least waste. <span data-testid="ws-no-optimum">{NO_OPTIMUM_NOTE}</span> The JSON export and the report carry the same sentence and name no case.
          </p>
          <p className="text-pl-warning-text text-sm">
            Each case also assumes an initial rate that grows with the spacing (the last column). With the rate limit on, a well
            whose decline would start above what it can deliver produces at its deliverable rate first, so the same oil arrives
            later and the NPV of the wide cases falls; the rate limit table prints both sides.
          </p>
          {boNote(results) && (
            <p className="text-pl-warning-text text-sm" data-testid="ws-bo-note" data-bo-source={results.boSource}>{boNote(results)}</p>
          )}
        </div>
        {results.npvConvention?.note && <p className="text-xs text-pl-muted" data-testid="ws-npv-convention">{results.npvConvention.note}</p>}
        <Table head={model.cases.head} rows={model.cases.rows} testId="ws-case-table" note={model.cases.note} />
      </Section>

      <Section title="Charts" testId="ws-charts">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartPanel title="NPV against well spacing" subtitle="US$ million, mid-year discounting, Suite screening economics engine.">
            <div className="relative h-64">
              <SpacingChart data={data} xKey="spacing" xLabel={spacingLabel} unit="NPV (US$ MM)" fmt={(v) => Number(v).toFixed(0)} lines={[{ key: 'npv', name: 'NPV', color: '#16a34a' }, ...(anyBinding ? [{ key: 'npvOther', name: rlOn ? 'NPV, unlimited decline' : 'NPV, rate-limited', color: '#dc2626', dash: '3 3' }] : [])]} />
              <ChartLogo style={LOGO_STYLE} />
            </div>
          </ChartPanel>
          <ChartPanel title="EUR and produced per well against spacing" subtitle="The stated recovery factor over each well's area, and what the decline delivers inside the project duration.">
            <div className="relative h-64">
              <SpacingChart data={data} xKey="spacing" xLabel={spacingLabel} unit={`Per well (${u.label('eur')})`} fmt={(v) => Number(v).toFixed(0)}
                lines={[{ key: 'eur', name: 'EUR per well', color: '#2563eb' }, { key: 'produced', name: 'Produced in the duration', color: '#d97706', dash: '5 3' }]} />
              <ChartLogo style={LOGO_STYLE} />
            </div>
          </ChartPanel>
          <ChartPanel title="Cost per barrel against spacing" subtitle="Capex plus opex over the oil produced, undiscounted, before royalty.">
            <div className="relative h-64">
              <SpacingChart data={data} xKey="spacing" xLabel={spacingLabel} unit="US$/STB" fmt={(v) => Number(v).toFixed(2)} lines={[{ key: 'cost', name: 'Cost per barrel', color: '#ea580c' }]} />
              <ChartLogo style={LOGO_STYLE} />
            </div>
          </ChartPanel>
          <ChartPanel title="Plan initial rate and deliverable rate" subtitle={hasDeliv ? `Day-one rate of the decline against the pseudosteady rate a well can deliver${rateLog ? ' (log scale)' : ''}.` : 'Deliverable rate not computed: give the drainage inputs.'}>
            <div className="relative h-64">
              <SpacingChart data={data} xKey="spacing" xLabel={spacingLabel} unit={`Rate (${u.label('rate')})`} fmt={(v) => Number(Number(v).toPrecision(3))} log={rateLog}
                lines={[{ key: 'plan', name: 'Plan initial rate', color: '#dc2626' }, ...(hasDeliv ? [{ key: 'deliverable', name: 'Deliverable', color: '#2563eb' }] : []), ...(rlOn && anyBinding ? [{ key: 'produced_rate', name: 'Rate produced', color: '#16a34a', dash: '5 3' }] : [])]} />
              <ChartLogo style={LOGO_STYLE} />
            </div>
          </ChartPanel>
        </div>
      </Section>

      <Section title="Economics of each case, by part" testId="ws-economics">
        <Table head={model.economics.head} rows={model.economics.rows} testId="ws-economics-table" note={model.economics.note} />
      </Section>
      <Section title="Incremental economics: the added wells" testId="ws-incremental">
        <Table head={model.incremental.head} rows={model.incremental.rows} testId="ws-incremental-table" note={model.incremental.note} />
      </Section>
      {model.calibration.on && (
        <Section title="Recovery against spacing (your calibration)" testId="ws-calibration">
          <Table head={model.calibration.pointsHead} rows={model.calibration.pointsRows} testId="ws-calibration-points" note={model.calibration.note} />
          <Table head={model.calibration.casesHead} rows={model.calibration.casesRows} testId="ws-calibration-cases" />
        </Section>
      )}
      <Section title="Sensitivity: NPV with one input moved" testId="ws-sensitivity">
        <Table head={model.sensitivity.head} rows={model.sensitivity.rows} testId="ws-sensitivity-table" note={model.sensitivity.note} />
      </Section>
      <Section
        title="Uncertainty: NPV of each case" testId="ws-uncertainty"
        actions={(
          <Button size="sm" variant="outline" disabled={mcBusy || !model.uncertainty.given} data-testid="ws-mc-run"
            onClick={() => { setMcBusy(true); setTimeout(() => { try { runMonteCarlo(); } finally { setMcBusy(false); } }, 0); }}>
            {mcBusy ? 'Running' : 'Run'}
          </Button>
        )}
      >
        {mcStale && !mc && <p className="text-xs text-pl-warning-text" data-testid="ws-mc-stale">The inputs changed since the last run; run it again to see the uncertainty of the cases on screen.</p>}
        {model.uncertainty.ok
          ? <Table head={model.uncertainty.head} rows={model.uncertainty.rows} testId="ws-mc-table" note={model.uncertainty.note} />
          : <p className="text-xs text-pl-muted" data-testid="ws-mc-none">{model.uncertainty.note}</p>}
      </Section>
      <Section title="Rate limit: before and after" testId="ws-rate-limit">
        <p className="text-xs text-pl-text" data-testid="ws-rate-limit-state">
          The rate limit is <strong>{rlOn ? 'on' : 'off'}</strong>.{' '}
          {anyBinding ? `It binds at ${rows.filter((r) => r.rateLimit.binding).length} of ${rows.length} spacings.` : 'It binds at no spacing of this study.'}{' '}
          Switch it under Deliverability and drainage to compare.
        </p>
        <Table head={model.rateLimit.head} rows={model.rateLimit.rows} testId="ws-rate-limit-table" note={model.rateLimit.note} />
      </Section>
      <Section title="Drainage geometry, timing and deliverability" testId="ws-drainage">
        <Table head={model.drainage.head} rows={model.drainage.rows} testId="ws-drainage-table" note={model.drainage.note} />
      </Section>
      <Section title="Measurable interference at the neighbour" testId="ws-interference">
        {model.interference.rows.length > 0
          ? <Table head={model.interference.head} rows={model.interference.rows} testId="ws-interference-table" note={model.interference.note} />
          : <p className="text-xs text-pl-muted" data-testid="ws-interference-none">{model.interference.note}</p>}
      </Section>
      <Section title="Cross-checks" testId="ws-cross">
        <Table head={model.cross.head} rows={model.cross.rows} testId="ws-cross-table" note={model.cross.note} />
      </Section>
      {model.limits.flags.length > 0 && (
        <Section title="Flags" testId="ws-flags">
          <ul className="list-disc list-inside text-xs text-pl-warning-text space-y-1">{model.limits.flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Section>
      )}
    </div>
  );
};

export default ResultsPanel;
