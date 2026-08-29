import React from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { BarChart, Download, Activity, Lightbulb } from 'lucide-react';
import { exportToCSV } from '@/utils/exportUtils';
import CollapsibleSection from './CollapsibleSection';
import BreakevenPlots from './BreakevenPlots';

const ResultsPanel = ({ results }) => {
  const {
    kpis, plotData, tornadoData, insights, seed, baseBreakeven, excludedIterations,
  } = results;
  const { toast } = useToast();

  // Economics E1: this used to be a toast that said "Generating report"
  // and produced nothing. It writes a real file now, or says why it did
  // not. The sample itself is exported, because a percentile without the
  // sample behind it cannot be checked by anyone.
  const handleExport = () => {
    const sample = plotData?.histogram?.x || [];
    const rows = [
      { field: 'Breakeven P10 ($/bbl)', value: kpis.p10 },
      { field: 'Breakeven P50 ($/bbl)', value: kpis.p50 },
      { field: 'Breakeven P90 ($/bbl)', value: kpis.p90 },
      { field: 'Mean breakeven ($/bbl)', value: kpis.mean },
      { field: 'Deterministic base case ($/bbl)', value: baseBreakeven },
      { field: 'Iterations kept', value: sample.length },
      { field: 'Iterations excluded (no breakeven below $500)', value: excludedIterations ?? 0 },
      { field: 'Run seed', value: seed },
      ...sample.map((v, i) => ({ field: `sample ${i + 1}`, value: v })),
    ];
    const ok = exportToCSV(rows, `breakeven-analysis-seed-${seed}`);
    toast(ok
      ? { title: 'Exported', description: 'The summary and the full sample are in the CSV.' }
      : { variant: 'destructive', title: 'Export failed', description: 'Nothing was written.' });
  };

  const kpiCards = [
    { key: 'p10', label: 'Breakeven (P10)' },
    { key: 'p50', label: 'Breakeven (P50)' },
    { key: 'p90', label: 'Breakeven (P90)' },
    { key: 'mean', label: 'Mean Breakeven' },
  ];

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Breakeven Summary" icon={<BarChart />} defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label }) => (
            <motion.div key={key} className="bg-white/5 p-4 rounded-lg">
              <p className="text-sm text-lime-200">{label}</p>
              <p className="text-3xl font-bold text-white mt-2">
                {typeof kpis[key] === 'number' ? `${kpis[key].toFixed(2)}` : kpis[key]}
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
      </CollapsibleSection>

      <CollapsibleSection title="Probabilistic Distributions & Sensitivity" icon={<Activity />} defaultOpen>
        <BreakevenPlots
          cdfData={plotData.cdf}
          histogramData={plotData.histogram}
          tornadoData={tornadoData}
          kpis={kpis}
        />
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
