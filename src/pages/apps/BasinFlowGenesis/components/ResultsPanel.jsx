import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, LineChart, Layers, Flame, Droplet, Clock, Camera } from 'lucide-react';
import BurialHistoryPlot from './plots/BurialHistoryPlot';
import TemperatureHistoryPlot from './plots/TemperatureHistoryPlot';
import MaturityPlot from './plots/MaturityPlot';
import GenerationExpulsionPlot from './plots/GenerationExpulsionPlot';
import ChargeTimingPlot from './plots/ChargeTimingPlot';
import ResultsSummaryTab from './ResultsSummaryTab';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const ResultsPanel = () => {
    const { state } = useBasinFlow();
    const { results } = state;
    const [activeTab, setActiveTab] = useState('burial');
    const printRef = useRef(null);

    // Check if we have results
    const hasResults = results && results.data && results.data.timeSteps && results.data.timeSteps.length > 0;

    const handleDownloadImage = async (type = 'png') => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { backgroundColor: '#0f172a' });
        const image = canvas.toDataURL(`image/${type}`);
        const link = document.createElement('a');
        link.href = image;
        link.download = `plot_${activeTab}_${new Date().toISOString()}.${type}`;
        link.click();
    };

    if (!hasResults) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8">
                <LineChart className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-slate-400">No Simulation Results</h3>
                <p className="text-sm text-center max-w-xs mt-2">Run a simulation to generate burial history, thermal, and maturity models.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-950 border-l border-slate-800 w-full overflow-hidden">
            <div className="p-2 border-b border-slate-800 flex justify-between items-center shrink-0 bg-slate-900/50">
                <div className="flex items-center gap-2 px-2">
                    <LineChart className="w-4 h-4 text-blue-400" />
                    <h2 className="font-semibold text-white text-sm">Analysis Results</h2>
                </div>
                <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadImage('png')} title="Download PNG">
                        <Camera className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download Data">
                        <Download className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden w-full">
                <div className="px-4 pt-2 bg-slate-900 shrink-0 overflow-x-auto no-scrollbar">
                    <TabsList className="w-full justify-start h-9 bg-transparent border-b border-slate-800 rounded-none p-0 gap-4 min-w-max">
                        <TabsTrigger value="summary" data-testid="bf-results-tab-summary" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-purple-500 rounded-none h-full px-1 pb-2">Summary</TabsTrigger>
                        <TabsTrigger value="burial" data-testid="bf-results-tab-burial" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none h-full px-1 pb-2">Burial</TabsTrigger>
                        <TabsTrigger value="temperature" data-testid="bf-results-tab-temperature" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-red-500 rounded-none h-full px-1 pb-2">Thermal</TabsTrigger>
                        <TabsTrigger value="maturity" data-testid="bf-results-tab-maturity" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full px-1 pb-2">Maturity</TabsTrigger>
                        <TabsTrigger value="generation" data-testid="bf-results-tab-generation" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-green-500 rounded-none h-full px-1 pb-2">Expulsion</TabsTrigger>
                        <TabsTrigger value="timing" data-testid="bf-results-tab-timing" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-yellow-500 rounded-none h-full px-1 pb-2">Timing</TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-950 p-4 relative w-full" ref={printRef}>
                     <div className="h-full w-full min-h-[400px]">
                         <TabsContent value="summary" className="h-full m-0"><ResultsSummaryTab results={results} /></TabsContent>
                         <TabsContent value="burial" className="h-full m-0"><BurialHistoryPlot results={results} /></TabsContent>
                         <TabsContent value="temperature" className="h-full m-0"><TemperatureHistoryPlot results={results} /></TabsContent>
                         <TabsContent value="maturity" className="h-full m-0"><MaturityPlot results={results} /></TabsContent>
                         <TabsContent value="generation" className="h-full m-0"><GenerationExpulsionPlot results={results} /></TabsContent>
                         <TabsContent value="timing" className="h-full m-0"><ChargeTimingPlot results={results} /></TabsContent>
                     </div>
                </div>
            </Tabs>
        </div>
    );
};

export default ResultsPanel;