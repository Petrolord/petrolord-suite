
import React from 'react';
import { motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { saveAs } from 'file-saver';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const ResultsPanel = ({ results, settings }) => {
  const driveIndicesLayout = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: true, text: 'Drive Indices Contribution', color: '#E5E7EB' },
      legend: { labels: { color: '#E5E7EB' } }
    },
    scales: {
      x: { stacked: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
      y: { stacked: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
    }
  };
  
  const handleExportCSV = () => {
    const headers = ["Date", "Pressure", "F", "Et", "DDI", "GDI", "WDI"];
    const rows = results.timeSeriesData.map(d => [d.date, d.pressure, d.F, d.Et, d.DDI, d.GDI, d.WDI].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-s-8;' });
    saveAs(blob, `${settings.projectName}_mbal_results.csv`);
  };
  
  const handleExportJSON = () => {
    const jsonContent = JSON.stringify({ settings, resultsSummary: results.summary }, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    saveAs(blob, `${settings.projectName}_mbal_settings.json`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Material Balance Analysis: ${settings.projectName}`, 14, 16);
    doc.setFontSize(12);

    const summaryData = Object.entries(results.summary).map(([key, value]) => [
      key, typeof value === 'number' ? value.toFixed(2) : value
    ]);
    
    doc.autoTable({
      startY: 25,
      head: [['Parameter', 'Value']],
      body: summaryData,
      theme: 'grid',
    });

    const timeSeriesData = results.timeSeriesData.map(d => [
      d.date, d.pressure.toFixed(0), d.F.toFixed(3), d.Et.toFixed(3), d.DDI.toFixed(2), d.GDI.toFixed(2), d.WDI.toFixed(2)
    ]);

    doc.addPage();
    doc.text("Time Series Results", 14, 16);
    doc.autoTable({
      startY: 25,
      head: [['Date', 'Pressure', 'F', 'Et', 'DDI', 'GDI', 'WDI']],
      body: timeSeriesData
    });
    
    doc.save(`${settings.projectName}_mbal_report.pdf`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-1">OOIP (MMSTB)</h3>
          <p className="text-2xl font-bold text-teal-300">{results.summary.N.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
           <h3 className="text-sm font-semibold text-gray-400 mb-1">Gas Cap (m)</h3>
          <p className="text-2xl font-bold text-teal-300">{results.summary.m.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
           <h3 className="text-sm font-semibold text-gray-400 mb-1">R-squared</h3>
          <p className="text-2xl font-bold text-teal-300">{results.diagnostics.rSquared.toFixed(3)}</p>
        </div>
        <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
           <h3 className="text-sm font-semibold text-gray-400 mb-1">Dominant Drive</h3>
          <p className="text-xl font-bold text-teal-300">{results.summary.dominantDrive}</p>
        </div>
      </div>
       <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
          <h3 className="text-md font-semibold text-gray-300 mb-2">Interpretation</h3>
          <p className="text-sm text-slate-200">{results.interpretation}</p>
        </div>

      <Tabs defaultValue="havlena-odeh" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="havlena-odeh">Havlena-Odeh</TabsTrigger>
          <TabsTrigger value="pressure-prod">Pressure vs Prod</TabsTrigger>
          <TabsTrigger value="drive-indices">Drive Indices</TabsTrigger>
        </TabsList>
        <TabsContent value="havlena-odeh" className="mt-4 rounded-lg p-4 bg-gray-900/30 border border-white/10">
          <div className="w-full h-[400px] flex items-center justify-center text-slate-500">Chart removed</div>
        </TabsContent>
        <TabsContent value="pressure-prod" className="mt-4 rounded-lg p-4 bg-gray-900/30 border border-white/10">
          <div className="w-full h-[400px] flex items-center justify-center text-slate-500">Chart removed</div>
        </TabsContent>
        <TabsContent value="drive-indices" className="mt-4 rounded-lg p-4 bg-gray-900/30 border border-white/10" style={{ height: '450px' }}>
          <Bar data={results.plots.driveIndices} options={driveIndicesLayout} />
        </TabsContent>
      </Tabs>
      
      <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
        <h3 className="text-md font-semibold text-gray-300 mb-4">Export Results</h3>
        <div className="flex space-x-2">
          <Button onClick={handleExportPDF} variant="outline"><Download className="w-4 h-4 mr-2" /> PDF Report</Button>
          <Button onClick={handleExportCSV} variant="outline"><Download className="w-4 h-4 mr-2" /> Results (CSV)</Button>
          <Button onClick={handleExportJSON} variant="outline"><Download className="w-4 h-4 mr-2" /> Settings (JSON)</Button>
        </div>
      </div>
    </motion.div>
  );
};

export default ResultsPanel;
