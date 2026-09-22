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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label }) => (
            <motion.div key={key} className="bg-white/5 p-4 rounded-lg">
              <p className="text-sm text-lime-200">{label}</p>
              <p className="text-3xl font-bold text-white mt-2">
                {typeof kpis[key] === 'number' ? show(`${kpis[key].toFixed(2)}`, kpis[key], 4) : kpis[key]}
                <span className="text-lg text-lime-300">/STB</span>
              </p>
            </motion.div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Prices are computed through the Suite screening economics engine on the mid-year
          discounting convention. Run seed {seed}: the same inputs and seed reproduce this
          result exactly.
        </p>
        <FullPrecisionNote className="mt-1" />
        {full && Number.isFinite(baseBreakeven) && (
          <p className="text-xs text-slate-300 mt-1" data-testid="breakeven-base-full">
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
          <div className="mt-4 bg-white/5 p-4 rounded-lg" data-testid="breakeven-tornado-table">
            <p className="text-sm text-lime-200 mb-2">Tornado, change in breakeven price vs the base case ($/bbl)</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs">
                  <th className="text-left font-normal py-1">Variable</th>
                  <th className="text-right font-normal py-1">Favourable end</th>
                  <th className="text-right font-normal py-1">Adverse end</th>
                </tr>
              </thead>
              <tbody>
                {tornadoData.y.map((name, i) => (
                  <tr key={name} className="border-t border-white/10 text-white">
                    <td className="py-1">{name}</td>
                    <td className="py-1 text-right font-mono">{formatFull(tornadoData.low?.[i], 4)}</td>
                    <td className="py-1 text-right font-mono">{formatFull(tornadoData.high?.[i], 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-2">
              The favourable end is each variable at the end of its range that lowers the breakeven price; the
              adverse end raises it. A dash means that end has no breakeven below $500 a barrel.
            </p>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Interpretation" icon={<Lightbulb />}>
        <div className="bg-orange-500/10 p-4 rounded-lg border border-orange-500/30">
          <p className="text-orange-200">{insights}</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export Results" icon={<Download />}>
        <div className="bg-white/5 p-6 rounded-lg flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Download your analysis</h3>
            <p className="text-xs text-slate-400 mt-1">
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
