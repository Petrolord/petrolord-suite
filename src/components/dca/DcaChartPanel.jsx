
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Download, ZoomIn } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import Papa from 'papaparse';

const DcaChartPanel = ({ results }) => {
  const { toast } = useToast();
  const [isLogScale, setIsLogScale] = useState(true);

  const handleDownload = () => {
    if (!results?.forecast) return;
    const { history_dates, history_rates, forecast_dates, forecast_rates } = results.forecast;
    
    const allData = {};
    history_dates.forEach((date, i) => {
      if (!allData[date]) allData[date] = { date };
      allData[date].q_hist = history_rates[i];
    });
    forecast_dates.forEach((date, i) => {
      if (!allData[date]) allData[date] = { date };
      allData[date].q_forecast = forecast_rates[i];
    });

    const csvData = Object.values(allData).sort((a,b) => new Date(a.date) - new Date(b.date));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'dca_forecast_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "CSV Downloaded", description: "Forecast data has been downloaded." });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-slate-800/50 backdrop-blur-lg border border-white/20 rounded-xl p-4 h-[500px] flex flex-col"
    >
      <div className="flex justify-end items-center mb-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => setIsLogScale(!isLogScale)} className="border-purple-400/50 text-purple-300 hover:bg-purple-500/20">
          <ZoomIn className="w-4 h-4 mr-2" />
          {isLogScale ? 'Linear Scale' : 'Log Scale'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/20">
          <Download className="w-4 h-4 mr-2" />
          CSV
        </Button>
      </div>
      <div id="dca-chart-container" className="w-full flex-grow flex items-center justify-center text-slate-400 border border-white/10 rounded">
        Chart removed
      </div>
    </motion.div>
  );
};

export default DcaChartPanel;
