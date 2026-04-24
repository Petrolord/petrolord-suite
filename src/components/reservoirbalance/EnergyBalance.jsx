
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Cpu, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';
import { mbalCalculations } from '@/utils/mbalCalculations';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const EnergyBalance = ({ productionData, pressureData, pvtData, aquiferResults, onResultsChange, mbalResults }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleRunModel = useCallback(() => {
    if (!productionData || !pressureData || !pvtData) {
      toast({
        title: 'Missing Data',
        description: 'Please ensure Production, Pressure, and PVT data are loaded.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      try {
        const results = mbalCalculations({ productionData, pressureData, pvtData, aquiferResults });
        onResultsChange(results);
        
        if (results.warnings && results.warnings.length > 0) {
            results.warnings.forEach(warning => {
                toast({
                    title: 'Analysis Warning',
                    description: warning,
                    variant: 'default',
                    duration: 6000,
                });
            });
        } else {
            toast({
              title: 'Material Balance Calculated',
              description: `OOIP estimated at ${(results.ooip / 1e6).toFixed(2)} MMSTB.`,
            });
        }
      } catch (error) {
        toast({
          title: 'Calculation Error',
          description: error.message,
          variant: 'destructive',
        });
        onResultsChange(null);
      } finally {
        setIsLoading(false);
      }
    }, 500);
  }, [productionData, pressureData, pvtData, aquiferResults, toast, onResultsChange]);

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lime-300">Material Balance Engine</CardTitle>
          <CardDescription>Calculate OOIP and drive mechanisms based on production history and fluid properties.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRunModel} disabled={isLoading} className="w-full">
            <Cpu className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Calculating...' : 'Run Material Balance'}
          </Button>
        </CardContent>
      </Card>

      {mbalResults ? (
        <ResultsDisplay results={mbalResults} />
      ) : (
        <Alert className="bg-slate-900/70 border-slate-600">
          <Info className="h-4 w-4 text-sky-400" />
          <AlertTitle className="text-white">Awaiting Calculation</AlertTitle>
          <AlertDescription className="text-slate-400">
            Click "Run Material Balance" to see the results. This requires data from the Data Hub and PVT & Rock tabs.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

const ResultsDisplay = ({ results }) => {

    const driveIndicesLayout = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Drive Indices Contribution (Final Step)', color: '#E5E7EB' },
          legend: { display: false }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
          y: { stacked: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, max: 1.0 }
        }
    };

    const driveIndicesData = {
        labels: ['Contribution'],
        datasets: [
            { label: 'Depletion Drive', data: [results.driveIndices.DDI], backgroundColor: '#34D399' },
            { label: 'Gas Cap Drive', data: [results.driveIndices.GDI], backgroundColor: '#F87171' },
            { label: 'Water Drive', data: [results.driveIndices.WDI], backgroundColor: '#38BDF8' },
        ]
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text(`Material Balance Analysis Report`, 14, 16);
        doc.setFontSize(12);
    
        const summaryData = [
            ['OOIP (MMSTB)', (results.ooip / 1e6).toFixed(2)],
            ['Gas Cap Size (m)', results.m.toFixed(2)],
            ['R-squared', results.rSquared.toFixed(4)],
            ['Depletion Drive Index', results.driveIndices.DDI.toFixed(2)],
            ['Gas Cap Drive Index', results.driveIndices.GDI.toFixed(2)],
            ['Water Drive Index', results.driveIndices.WDI.toFixed(2)],
        ];
        
        doc.autoTable({
          startY: 25,
          head: [['Parameter', 'Value']],
          body: summaryData,
          theme: 'grid',
        });
    
        const plotData = results.plotData.map(d => [
          d.pressure.toFixed(0), d.Np.toFixed(2), d.F.toFixed(2), d.Et.toFixed(4)
        ]);
    
        doc.addPage();
        doc.text("Time Series Results", 14, 16);
        doc.autoTable({
          startY: 25,
          head: [['Pressure (psi)', 'Np (MMSTB)', 'F (rb)', 'Et (rb/STB)']],
          body: plotData
        });
        
        doc.save(`mbal_report.pdf`);
    };

    const handleExportCSV = () => {
        const headers = ["Pressure", "Np_MMSTB", "Gp_BSCF", "F_rb", "Et_rb_per_STB", "Eo", "Eg", "Ef"];
        const rows = results.plotData.map(d => [d.pressure, d.Np / 1e6, d.Gp / 1e9, d.F, d.Et, d.Eo, d.Eg, d.Ef].join(','));
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-s-8;' });
        saveAs(blob, `mbal_results.csv`);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                    <CardTitle className="text-lime-300">Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <MetricCard title="OOIP (Regression)" value={`${(results.ooip / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}`} unit="MMSTB" />
                        <MetricCard title="Gas Cap Size (m)" value={results.m.toFixed(2)} />
                        <MetricCard title="Correlation (R²)" value={results.rSquared.toFixed(4)} />
                    </div>
                    
                    <Tabs defaultValue="havlena-odeh" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="havlena-odeh">Havlena-Odeh Plot</TabsTrigger>
                            <TabsTrigger value="drive-indices">Drive Indices</TabsTrigger>
                        </TabsList>
                        <TabsContent value="havlena-odeh" className="mt-4 rounded-lg p-4 bg-gray-900/30 border border-white/10 flex items-center justify-center text-slate-500 h-[400px]">
                            Chart removed
                        </TabsContent>
                        <TabsContent value="drive-indices" className="mt-4 rounded-lg p-4 bg-gray-900/30 border border-white/10" style={{ height: '450px' }}>
                            <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                                <MetricCard title="Depletion Drive" value={`${(results.driveIndices.DDI * 100).toFixed(1)}%`} />
                                <MetricCard title="Gas Cap Drive" value={`${(results.driveIndices.GDI * 100).toFixed(1)}%`} />
                                <MetricCard title="Water Drive" value={`${(results.driveIndices.WDI * 100).toFixed(1)}%`} />
                            </div>
                            <div style={{ height: '250px' }}>
                                <Bar data={driveIndicesData} options={driveIndicesLayout} />
                            </div>
                        </TabsContent>
                    </Tabs>

                    <div className="bg-gray-800/50 p-4 rounded-lg border border-slate-700">
                        <h3 className="text-md font-semibold text-gray-300 mb-4">Export Results</h3>
                        <div className="flex space-x-2">
                            <Button onClick={handleExportPDF} variant="outline"><Download className="w-4 h-4 mr-2" /> PDF Report</Button>
                            <Button onClick={handleExportCSV} variant="outline"><Download className="w-4 h-4 mr-2" /> Results (CSV)</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

const MetricCard = ({ title, value, unit }) => (
    <div className="bg-slate-900 border-slate-700 p-4 rounded-lg">
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-lime-300">{value} {unit && <span className="text-lg text-slate-300">{unit}</span>}</p>
    </div>
);

export default EnergyBalance;
