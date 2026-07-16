import React from 'react';
import { motion } from 'framer-motion';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, BarChart2, Zap } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const ResultsPanel = ({ results }) => {
  const { summary, cdfData, histogramData, tornadoData } = results;

  const chartTextColor = '#334155'; // slate-700
  const chartGridColor = 'rgba(0, 0, 0, 0.1)';

  const cdfChartData = {
    labels: cdfData.map(d => d.npv.toFixed(0)),
    datasets: [{
      label: 'Cumulative Probability',
      data: cdfData.map(d => d.prob),
      fill: true,
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: 'rgba(59, 130, 246, 1)',
      tension: 0.4,
      pointRadius: 0,
    }],
  };

  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { display: false }, 
      title: { 
        display: true, 
        color: chartTextColor, 
        font: { size: 16 } 
      } 
    },
    scales: {
      x: { 
        title: { display: true, color: chartTextColor }, 
        ticks: { color: chartTextColor }, 
        grid: { color: chartGridColor } 
      },
      y: { 
        title: { display: true, color: chartTextColor }, 
        ticks: { color: chartTextColor }, 
        grid: { color: chartGridColor } 
      },
    },
  };

  const cdfChartOptions = {
    ...baseChartOptions,
    plugins: { ...baseChartOptions.plugins, title: { ...baseChartOptions.plugins.title, text: 'NPV Cumulative Distribution (S-Curve)' } },
    scales: {
      ...baseChartOptions.scales,
      x: { ...baseChartOptions.scales.x, title: { ...baseChartOptions.scales.x.title, text: 'NPV ($MM)' } },
      y: { ...baseChartOptions.scales.y, title: { ...baseChartOptions.scales.y.title, text: 'Cumulative Probability (%)' }, ticks: { ...baseChartOptions.scales.y.ticks, callback: (v) => `${v}%` } },
    },
  };

  const histogramChartData = {
    labels: histogramData.map(d => `${d.binStart}-${d.binEnd}`),
    datasets: [{
      label: 'Frequency',
      data: histogramData.map(d => d.count),
      backgroundColor: 'rgba(34, 197, 94, 0.6)',
      borderColor: 'rgba(22, 163, 74, 1)',
      borderWidth: 1,
    }],
  };

  const histogramChartOptions = { 
    ...baseChartOptions, 
    plugins: { ...baseChartOptions.plugins, title: { ...baseChartOptions.plugins.title, text: 'NPV Frequency Distribution' } }, 
    scales: { 
      ...baseChartOptions.scales,
      x: { ...baseChartOptions.scales.x, title: { ...baseChartOptions.scales.x.title, text: 'NPV Bins ($MM)' } }, 
      y: { ...baseChartOptions.scales.y, title: { ...baseChartOptions.scales.y.title, text: 'Frequency' } } 
    } 
  };

  const tornadoChartData = {
    labels: tornadoData.map(d => d.variable),
    datasets: [{
      label: 'NPV Swing ($MM)',
      data: tornadoData.map(d => d.swing),
      backgroundColor: 'rgba(234, 179, 8, 0.6)',
      borderColor: 'rgba(202, 138, 4, 1)',
      borderWidth: 1,
    }],
  };

  const tornadoChartOptions = { 
    ...baseChartOptions, 
    indexAxis: 'y', 
    plugins: { ...baseChartOptions.plugins, title: { ...baseChartOptions.plugins.title, text: 'Sensitivity Analysis (Tornado Plot)' } }, 
    scales: { 
      ...baseChartOptions.scales,
      x: { ...baseChartOptions.scales.x, title: { ...baseChartOptions.scales.x.title, text: 'Impact on NPV ($MM)' } }, 
      y: { ...baseChartOptions.scales.y, title: { ...baseChartOptions.scales.y.title, text: '' } } 
    } 
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(summary).map(([key, value]) => (
          <div key={key} className="bg-white/10 p-4 rounded-xl text-center">
            <p className="text-lime-300 text-sm uppercase">{key}</p>
            <p className="text-2xl font-bold text-white">{value.toFixed(key === 'chanceOfSuccess' ? 1 : 0)}{key === 'chanceOfSuccess' ? '%' : ' $MM'}</p>
          </div>
        ))}
      </div>
      <Tabs defaultValue="cdf" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-black/20">
          <TabsTrigger value="cdf"><TrendingUp className="w-4 h-4 mr-2"/>S-Curve</TabsTrigger>
          <TabsTrigger value="histogram"><BarChart2 className="w-4 h-4 mr-2"/>Histogram</TabsTrigger>
          <TabsTrigger value="sensitivity"><Zap className="w-4 h-4 mr-2"/>Sensitivity</TabsTrigger>
        </TabsList>
        <div className="relative bg-white rounded-xl p-4 mt-4 h-[500px]">
          <TabsContent value="cdf" className="h-full"><Line options={cdfChartOptions} data={cdfChartData} /></TabsContent>
          <TabsContent value="histogram" className="h-full"><Bar options={histogramChartOptions} data={histogramChartData} /></TabsContent>
          <TabsContent value="sensitivity" className="h-full"><Bar options={tornadoChartOptions} data={tornadoChartData} /></TabsContent>
          <ChartLogo />
        </div>
      </Tabs>
    </motion.div>
  );
};

export default ResultsPanel;