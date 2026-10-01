import React, { useMemo, useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, LineChart, Layers, Flame, Droplet, Clock, Camera } from 'lucide-react';
import BurialHistoryPlot from './plots/BurialHistoryPlot';
import TransformationRatioPlot from './plots/TransformationRatioPlot';
import TemperatureHistoryPlot from './plots/TemperatureHistoryPlot';
import MaturityPlot from './plots/MaturityPlot';
import GenerationExpulsionPlot from './plots/GenerationExpulsionPlot';
import ChargeTimingPlot from './plots/ChargeTimingPlot';
import PressurePlot from './plots/PressurePlot';
import { buildBasinPressure, writeBasinPressure } from '@/lib/basinPressure';
import { buildBasinCharge, writeBasinCharge } from '@/lib/basinCharge';
import { eventsChartRows } from '../services/resultsView';
import { kineticsLabel } from '../services/lithologyMix';
import { Link } from 'react-router-dom';
import { Spec } from '../services/PhysicsUtils';
import { appPath } from '@/components/wells/appLinks';
import { useMultiWell } from '../contexts/MultiWellContext';
import { withLayerRoles } from '../services/resultsView';
import ResultsSummaryTab from './ResultsSummaryTab';
import RunNotes from './common/RunNotes';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { ExportEngine } from '../services/ExportEngine';
import html2canvas from 'html2canvas';

const ResultsPanel = () => {
    const { state, units, appPaths } = useBasinFlow();
    const { state: mwState } = useMultiWell();
    // layer roles (deposition ages, source flag) for the events chart and source-layer plots
    const results = useMemo(() => withLayerRoles(state.results, state.stratigraphy || []), [state.results, state.stratigraphy]);
    const [activeTab, setActiveTab] = useState('burial');
    const printRef = useRef(null);

    // Check if we have results
    const hasResults = results && results.data && results.data.timeSteps && results.data.timeSteps.length > 0;

    // BF-U2-015: the pressure column goes to Pore Pressure Studio through
    // src/lib/basinPressure.js (declared units); the link carries its id
    const pressureSend = useMemo(() => {
        try {
            const payload = buildBasinPressure(state.results, { name: mwState?.wellDataMap?.[mwState?.activeWellId]?.name || 'Basin model', settings: state.settings, stratigraphy: state.stratigraphy });
            return { payload, href: `${appPath('pore-pressure-studio', appPaths)}?bfPressure=${payload.id}` };
        } catch { return null; }
    }, [state.results, state.settings, state.stratigraphy, mwState, appPaths]);

    // BF-U2-017: the expelled charge goes to ReservoirCalc Pro's Prospect
    // Risking through src/lib/basinCharge.js
    const chargeSend = useMemo(() => {
        try {
            const payload = buildBasinCharge(results, {
                name: mwState?.wellDataMap?.[mwState?.activeWellId]?.name || 'Basin model', settings: state.settings, stratigraphy: state.stratigraphy,
                criticalMoment: eventsChartRows(results).criticalMoment, kineticsLabel, hcDensityKgM3: Spec.RHO_HC,
            });
            return { payload, href: `${appPath('reservoircalc-pro', appPaths)}?bfCharge=${payload.id}` };
        } catch (e) { return { error: e.message }; }
    }, [results, state.settings, state.stratigraphy, mwState, appPaths]);

    const handleDownloadImage = async (type = 'png') => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { backgroundColor: '#ffffff' });
        const image = canvas.toDataURL(`image/${type}`);
        const link = document.createElement('a');
        link.href = image;
        link.download = `plot_${activeTab}_${new Date().toISOString()}.${type}`;
        link.click();
    };

    if (!hasResults) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-pl-muted p-8">
                <LineChart className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-pl-muted">No Simulation Results</h3>
                <p className="text-sm text-center max-w-xs mt-2">Run a simulation to generate burial history, thermal, and maturity models.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-pl-bg border-l border-pl-border w-full overflow-hidden">
            <div className="p-2 border-b border-pl-border flex justify-between items-center shrink-0 bg-pl-surface">
                <div className="flex items-center gap-2 px-2">
                    <LineChart className="w-4 h-4 text-pl-muted" />
                    <h2 className="font-semibold text-pl-text text-sm">Analysis Results</h2>
                </div>
                <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadImage('png')} title="Download PNG">
                        <Camera className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download the results CSV (SI columns plus the display units)" data-testid="bf-results-csv" onClick={() => ExportEngine.generateCSV(results, units)}>
                        <Download className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <div className="px-3 pt-2 bg-pl-surface shrink-0"><RunNotes /></div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden w-full">
                <div className="px-4 pt-2 bg-pl-surface shrink-0 overflow-x-auto no-scrollbar">
                    <TabsList className="w-full justify-start h-9 bg-transparent border-b border-pl-border rounded-none p-0 gap-4 min-w-max">
                        <TabsTrigger value="summary" data-testid="bf-results-tab-summary" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Summary</TabsTrigger>
                        <TabsTrigger value="burial" data-testid="bf-results-tab-burial" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Burial</TabsTrigger>
                        <TabsTrigger value="temperature" data-testid="bf-results-tab-temperature" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Thermal</TabsTrigger>
                        <TabsTrigger value="maturity" data-testid="bf-results-tab-maturity" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Maturity</TabsTrigger>
                        <TabsTrigger value="generation" data-testid="bf-results-tab-generation" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Expulsion</TabsTrigger>
                        <TabsTrigger value="pressure" data-testid="bf-results-tab-pressure" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Pressure</TabsTrigger>
                        <TabsTrigger value="timing" data-testid="bf-results-tab-timing" className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-pl-primary rounded-none h-full px-1 pb-2">Timing</TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto bg-pl-bg p-4 relative w-full" ref={printRef}>
                     <div className="h-full w-full min-h-[400px]">
                         <TabsContent value="summary" className="h-full m-0"><ResultsSummaryTab results={results} units={units} /></TabsContent>
                         <TabsContent value="burial" className="h-full m-0"><BurialHistoryPlot results={results} units={units} /></TabsContent>
                         <TabsContent value="temperature" className="h-full m-0"><TemperatureHistoryPlot results={results} units={units} /></TabsContent>
                         <TabsContent value="maturity" className="h-full m-0"><MaturityPlot results={results} /></TabsContent>
                         <TabsContent value="generation" className="h-full m-0">
                             <div className="grid grid-rows-2 gap-4 h-full min-h-[820px]">
                                 <GenerationExpulsionPlot results={results} />
                                 <TransformationRatioPlot results={results} />
                             </div>
                         </TabsContent>
                         <TabsContent value="pressure" className="h-full m-0"><PressurePlot results={results} units={units} sendHref={pressureSend?.href || null} onSend={() => pressureSend && writeBasinPressure(pressureSend.payload)} /></TabsContent>
                         <TabsContent value="timing" className="h-full m-0">
                             <div className="flex flex-col h-full gap-2">
                                 <div className="text-[11px] text-pl-muted flex flex-wrap items-center gap-2" data-testid="bf-charge-send-bar">
                                     {chargeSend?.payload ? (
                                         <>
                                             <span>Expelled, present day: {chargeSend.payload.expelledKgM2.toFixed(0)} kg/m2 of source rock.</span>
                                             <Link to={chargeSend.href} onClick={() => writeBasinCharge(chargeSend.payload)} data-testid="bf-send-charge"
                                                 className="px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken">Send the charge to ReservoirCalc Pro</Link>
                                             <span>Open Prospect Risking there: it compares the charge with the prospect and suggests the charge factor of Pg.</span>
                                         </>
                                     ) : <span data-testid="bf-charge-send-none">{chargeSend?.error}</span>}
                                 </div>
                                 <div className="flex-1 min-h-0"><ChargeTimingPlot results={results} /></div>
                             </div>
                         </TabsContent>
                     </div>
                </div>
            </Tabs>
        </div>
    );
};

export default ResultsPanel;