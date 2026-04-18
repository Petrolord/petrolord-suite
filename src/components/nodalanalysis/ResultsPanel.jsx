import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart, Download, GitBranch, TrendingUp, DollarSign, Zap, AlertTriangle, ChevronsUp, Droplets, Search, Clock } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import NodalPlot from './NodalPlot';
import ArtificialLiftDesign from './ArtificialLiftDesign';
import ProblemDiagnosis from './ProblemDiagnosis';
import ForecastingPanel from './ForecastingPanel';
import { exportToExcel, exportToPDF } from '@/utils/exportUtils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ResultsPanel = ({ results, inputs }) => {
  const { kpis, plotsData, recommendations, liftDesign, diagnosis, forecast } = results;

  const handleExportData = () => {
    const dataToExport = [
      { Category: "KPIs", ...kpis },
      { Category: "Recommendations", ...recommendations },
      { Category: "Diagnosis", Title: diagnosis.title, Details: diagnosis.details, Action: diagnosis.action },
      { Category: "Forecast Summary", EUR_MMSTB: forecast.eur, Final_Rate_STB_d: forecast.finalRate },
    ];
    exportToExcel(dataToExport, `${inputs.projectName}_summary`);
  };

  const handleExportReport = () => {
    // Using manual jsPDF generation since exportToPDF expects generic data array
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${inputs.projectName} - Nodal Analysis Report`, 14, 20);
    
    doc.autoTable({
      startY: 25,
      head: [['Metric', 'Value', 'Unit']],
      body: [
        ['Predicted Rate', kpis.currentRate, 'STB/day'],
        ['Potential Rate', kpis.potentialRate, 'STB/day'],
        ['Incremental Gain', recommendations.incrementalRate, 'STB/day'],
        ['Revenue Uplift', recommendations.revenueUplift, '$/day'],
        ['Operating Status', kpis.status, ''],
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    doc.text("Diagnosis & Recommendations", 14, finalY);
    doc.autoTable({
      startY: finalY + 5,
      body: [
        { content: 'Diagnosis', styles: { fontStyle: 'bold' } },
        { content: diagnosis.details },
        { content: 'Recommendation', styles: { fontStyle: 'bold' } },
        { content: recommendations.action },
      ],
      theme: 'plain',
    });
    
    doc.save(`${inputs.projectName}_report.pdf`);
  };

  const kpiCards = [
    { key: 'currentRate', label: 'Predicted Rate', unit: 'STB/day', icon: TrendingUp },
    { key: 'currentRevenue', label: 'Predicted Revenue', unit: '$/day', icon: DollarSign },
    { key: 'potentialRate', label: 'Potential Rate', unit: 'STB/day', icon: ChevronsUp },
    { key: 'status', label: 'Operating Status', unit: '', icon: AlertTriangle },
  ];
  
  const recommendationCards = [
    { key: 'incrementalRate', label: 'Incremental Gain', unit: 'STB/day', icon: TrendingUp },
    { key: 'revenueUplift', label: 'Revenue Uplift', unit: '$/day', icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Performance Dashboard" icon={<BarChart />} defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label, unit, icon: Icon }) => (
            <motion.div key={key} className={`bg-white/5 p-4 rounded-lg ${key === 'status' && kpis[key] === 'Bottlenecked' ? 'bg-red-500/20' : ''}`}>
              <div className="flex items-center space-x-3">
                <Icon className={`w-6 h-6 ${key === 'status' && kpis[key] === 'Bottlenecked' ? 'text-red-400' : 'text-lime-300'}`} />
                <p className="text-sm text-lime-200">{label}</p>
              </div>
              <p className="text-3xl font-bold text-white mt-2">{kpis[key]} <span className="text-lg text-lime-300">{unit}</span></p>
            </motion.div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Interactive Nodal Analysis Plot" icon={<GitBranch />} defaultOpen>
        <NodalPlot data={plotsData} />
      </CollapsibleSection>

      <CollapsibleSection title="Production Forecast" icon={<Clock />} defaultOpen>
        <ForecastingPanel data={forecast} />
      </CollapsibleSection>

      <CollapsibleSection title="Problem Diagnosis" icon={<Search />}>
        <ProblemDiagnosis data={diagnosis} />
      </CollapsibleSection>
      
      <CollapsibleSection title="Optimization & Recommendations" icon={<Zap />}>
        <div className="flex flex-col lg:flex-row gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-grow">
                {recommendationCards.map(({ key, label, unit, icon: Icon }) => (
                    <motion.div key={key} className="bg-green-500/10 p-4 rounded-lg border border-green-500/30">
                    <div className="flex items-center space-x-3">
                        <Icon className="w-6 h-6 text-green-300" />
                        <p className="text-sm text-green-200">{label}</p>
                    </div>
                    <p className="text-3xl font-bold text-white mt-2">{recommendations[key]} <span className="text-lg text-green-300">{unit}</span></p>
                    </motion.div>
                ))}
            </div>
            <div className="bg-white/5 p-4 rounded-lg lg:w-1/3">
                <h4 className="font-semibold text-lime-300">Primary Bottleneck</h4>
                <p className="text-white mt-1">{recommendations.bottleneck}</p>
                <h4 className="font-semibold text-lime-300 mt-3">Recommended Action</h4>
                <p className="text-white mt-1">{recommendations.action}</p>
            </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Artificial Lift Design" icon={<Droplets />}>
        <ArtificialLiftDesign data={liftDesign} />
      </CollapsibleSection>

      <CollapsibleSection title="Export Results" icon={<Download />}>
        <div className="bg-white/5 p-6 rounded-lg flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Download Your Analysis</h3>
            <div className="flex items-center gap-3">
                <Button onClick={handleExportData}><Download className="w-4 h-4 mr-2"/>Export Data (XLSX)</Button>
                <Button onClick={handleExportReport}><Download className="w-4 h-4 mr-2"/>Export Report (PDF)</Button>
            </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default ResultsPanel;