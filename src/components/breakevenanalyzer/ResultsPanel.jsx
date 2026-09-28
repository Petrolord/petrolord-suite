import React from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { BarChart, Download, Activity, Lightbulb } from 'lucide-react';
import { exportToCSV } from '@/utils/exportUtils';
import CollapsibleSection from './CollapsibleSection';
import BreakevenPlots from './BreakevenPlots';
import { breakevenPercentileLabel } from './percentileLabels';
import { useFullPrecision, FullPrecisionNote } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell } from '@/components/ui/numeric-table';

const ResultsPanel = ({ results }) => {
  const {
    kpis, plotData, tornadoData, insights, seed, baseBreakeven, excludedIterations,
  } = results;
  const { toast } = useToast();
  // W3 (D3): Full precision prints the breakeven prices at 4 decimals and adds
  // the tornado as a table; off, the cards print as they always did.
  const { full, show } = useFullPrecision();

  // Economics E1: this used to be a toast that said "Generating report"
  // and produced nothing. It writes a real file now, or says why it did
  // not. The sample itself is exported, because a percentile without the
  // sample behind it cannot be checked by anyone.
  const handleExport = () => {
    const sample = plotData?.histogram?.x || [];
    const rows = [
      { field: `${breakevenPercentileLabel('q10')} ($/bbl)`, value: kpis.p10 },
      { field: `${breakevenPercentileLabel('q50')} ($/bbl)`, value: kpis.p50 },
      { field: `${breakevenPercentileLabel('q90')} ($/bbl)`, value: kpis.p90 },
      { field: 'Mean breakeven ($/bbl)', value: kpis.mean },
      { field: 'Deterministic base case ($/bbl)', value: baseBreakeven },
      { field: 'Iterations kept', value: sample.length },
      { field: 'Iterations excluded (no breakeven below $500)', value: excludedIterations ?? 0 },
      { field: 'Run seed', value: seed },
      // EC3-5 and EC3-8: which belief the base case and tornado used, and how
      // many draws were held at a physical limit.
      ...Object.entries(results.beliefs || {}).flatMap(([key, b]) => [
        { field: `${key} belief used for the base case and tornado`, value: b.source },
        { field: `${key} median used ($MM or percent)`, value: b.p50 },
      ]),
      ...Object.entries(results.clippedDraws || {}).map(([key, n]) => ({
        field: `${key} draws held at a physical limit`, value: n,
      })),
      ...sample.map((v, i) => ({ field: `sample ${i + 1}`, value: v })),
    ];
    const ok = exportToCSV(rows, `breakeven-analysis-seed-${seed}`);
    toast(ok
      ? { title: 'Exported', description: 'The summary and the full sample are in the CSV.' }
      : { variant: 'destructive', title: 'Export failed', description: 'Nothing was written.' });
  };

  // A breakeven price is a quantity where more is worse, so under the Suite
  // percentile convention it never carries a P-label: the engine's p10, p50
  // and p90 keys are its 10th, 50th and 90th percentiles and say so (EC3-0).
  const kpiCards = [
    { key: 'p10', label: breakevenPercentileLabel('q10') },
    { key: 'p50', label: breakevenPercentileLabel('q50') },
    { key: 'p90', label: breakevenPercentileLabel('q90') },
    { key: 'mean', label: 'Mean breakeven price' },
  ];

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Breakeven Summary" icon={<BarChart />} defaultOpen>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label }) => (
            <motion.div key={key} className="rounded-lg border border-pl-border bg-pl-sunken/60 p-4">
              <p className="text-sm text-pl-muted">{label}</p>
              <p className="mt-2 font-pl-mono text-3xl font-semibold tabular-nums text-pl-text">
                {typeof kpis[key] === 'number' ? show(`${kpis[key].toFixed(2)}`, kpis[key], 4) : kpis[key]}
                <span className="font-pl-sans text-lg font-normal text-pl-muted">/STB</span>
              </p>
            </motion.div>
          ))}
        </div>
        <p className="text-xs text-pl-muted mt-3">
          Prices are computed through the Suite screening economics engine on the mid-year
          discounting convention. Run seed {seed}: the same inputs and seed reproduce this
          result exactly.
        </p>
        <FullPrecisionNote className="mt-1" />
        {full && Number.isFinite(baseBreakeven) && (
          <p className="text-xs text-pl-text mt-1" data-testid="breakeven-base-full">
            Deterministic base case: {formatFull(baseBreakeven, 4)} $/bbl
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Probabilistic Distributions & Sensitivity" icon={<Activity />} defaultOpen>
        <BreakevenPlots
          cdfData={plotData.cdf}
          histogramData={plotData.histogram}
          tornadoData={tornadoData}
          kpis={kpis}
        />
        {full && tornadoData?.y?.length > 0 && (
          <div className="mt-4" data-testid="breakeven-tornado-table">
            <NumericTable title="Tornado, change in breakeven price vs the base case ($/bbl)">
              <thead>
                <tr>
                  <NumTh sticky>Variable</NumTh>
                  <NumTh numeric>Favourable end</NumTh>
                  <NumTh numeric>Adverse end</NumTh>
                </tr>
              </thead>
              <tbody>
                {tornadoData.y.map((name, i) => (
                  <NumRow key={name}>
                    <RowLabel>{name}</RowLabel>
                    <NumCell signed={false}>{formatFull(tornadoData.low?.[i], 4)}</NumCell>
                    <NumCell signed={false}>{formatFull(tornadoData.high?.[i], 4)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
            <p className="text-[11px] text-pl-muted mt-2">
              The favourable end is each variable at the end of its range that lowers the breakeven price; the
              adverse end raises it. A dash means that end has no breakeven below $500 a barrel.
            </p>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Interpretation" icon={<Lightbulb />}>
        <div className="bg-pl-info-bg p-4 rounded-lg border border-pl-info/40">
          <p className="text-pl-info-text">{insights}</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export Results" icon={<Download />}>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-pl-border bg-pl-sunken/60 p-4 sm:p-6">
          <div>
            <h3 className="text-lg font-semibold text-pl-text">Download your analysis</h3>
            <p className="text-xs text-pl-muted mt-1">
              Summary, base case, seed and every sampled breakeven price, as CSV.
            </p>
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />Export data
          </Button>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default ResultsPanel;
