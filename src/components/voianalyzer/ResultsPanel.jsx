import React from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { BarChart, Download, GitMerge, DollarSign, BrainCircuit, CheckCircle, XCircle, Info } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import DecisionTreePlot from './DecisionTreePlot';

const ResultsPanel = ({ results }) => {
  const { kpis, plotData, insights } = results;
  const { toast } = useToast();

  const handleExport = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ['Metric', 'Value ($M)'],
      ['EMV without Information', kpis.emvWithoutInfo],
      ['EMV with Information', kpis.emvWithInfo],
      ['Gross Value of Information (VOI)', kpis.voi],
      ['Net Value of Information (Net VOI)', kpis.netVoi],
      ['Expected Value of Perfect Information (EVPI)', kpis.evpi],
      [],
      ['Decision Guidance'],
      [insights],
    ];
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'voi-analysis.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'VOI analysis downloaded as CSV.' });
  };

  const kpiCards = [
    { key: 'emvWithoutInfo', label: 'EMV without Information', icon: XCircle, color: 'text-red-400' },
    { key: 'emvWithInfo', label: 'EMV with Information', icon: CheckCircle, color: 'text-green-400' },
    { key: 'netVoi', label: 'Net Value of Info (Net VOI)', icon: DollarSign, color: 'text-lime-300' },
    { key: 'evpi', label: 'Value of Perfect Info (EVPI)', icon: Info, color: 'text-sky-400' },
  ];

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Value of Information Summary" icon={<BarChart />} defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label, icon: Icon, color }) => (
            <motion.div key={key} className="bg-white/5 p-4 rounded-lg text-center">
              <Icon className={`w-8 h-8 mx-auto mb-2 ${color}`} />
              <p className="text-sm text-lime-200">{label}</p>
              <p className="text-3xl font-bold text-white mt-2">${kpis[key]}<span className="text-lg text-lime-300">M</span></p>
            </motion.div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Decision Tree Visualization" icon={<GitMerge />} defaultOpen>
        <DecisionTreePlot data={plotData} />
      </CollapsibleSection>
      
      <CollapsibleSection title="Decision Guidance" icon={<BrainCircuit />} defaultOpen>
        <div className="bg-sky-500/10 p-4 rounded-lg border border-sky-500/30">
            <p className="text-sky-200 leading-relaxed">{insights}</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export Results" icon={<Download />}>
        <div className="bg-white/5 p-6 rounded-lg flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Download Your Analysis</h3>
            <div className="flex items-center gap-3">
                <Button onClick={handleExport}><Download className="w-4 h-4 mr-2"/>Export CSV</Button>
            </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default ResultsPanel;