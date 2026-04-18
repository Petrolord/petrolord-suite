
import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Expand, ZoomIn, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import ProbabilisticSummaryTable from './ProbabilisticSummaryTable';
import { ReportGenerator } from '../tools/ReportGenerator';
import { useToast } from '@/components/ui/use-toast';
import html2canvas from 'html2canvas';
import ResultsModal from './ResultsModal';

const RealizationCard = ({ title, realization, unit }) => {
    if (!realization) return null;
    return (
        <div className="bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1 mb-1">{title} Variables</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-slate-300">
                <div className="flex justify-between"><span>Phi:</span> <span className="font-mono">{(realization.inputs.phi).toFixed(3)}</span></div>
                <div className="flex justify-between"><span>Sw:</span> <span className="font-mono">{(realization.inputs.sw).toFixed(3)}</span></div>
                <div className="flex justify-between"><span>Area:</span> <span className="font-mono">{(realization.inputs.area).toFixed(0)}</span></div>
                <div className="flex justify-between"><span>Thick:</span> <span className="font-mono">{(realization.inputs.thickness).toFixed(1)}</span></div>
            </div>
            <div className="pt-1 mt-1 border-t border-slate-800 flex justify-between text-[10px] font-bold text-emerald-400">
                <span>Vol:</span> <span>{(realization.targetVol / 1e6).toFixed(2)} {unit}</span>
            </div>
        </div>
    );
};

const ProbabilisticResultsDisplay = ({ isCompact = false }) => {
    const { state } = useReservoirCalc();
    const { probResults, inputs } = state;
    const { toast } = useToast();
    
    const [isFullViewOpen, setIsFullViewOpen] = useState(false);
    
    const histogramRef = useRef(null);
    const cdfRef = useRef(null);
    const tornadoRef = useRef(null);

    const [isExporting, setIsExporting] = useState(false);

    if (!probResults || !probResults.stats) {
        return <div className="flex items-center justify-center h-full text-slate-500">Run a simulation to see results.</div>;
    }

    const ft = inputs.fluidType || 'oil';
    const isGas = ft === 'gas';
    
    const stats = isGas ? probResults.stats.giip : probResults.stats.stooip;
    const rawVolumes = isGas ? probResults.raw.giip : probResults.raw.stooip;
    const baseVal = probResults.stats.baseCaseValue;
    
    const unitLabel = isGas ? (state.unitSystem === 'field' ? 'Bscf' : 'MMsm³') : 'MMstb';
    const denom = isGas ? 1e9 : 1e6; 
    
    const diffBaseP50 = baseVal ? Math.abs(stats.p50 - baseVal) / baseVal * 100 : 0;
    const baseColor = diffBaseP50 < 1 ? '#10b981' : diffBaseP50 < 5 ? '#f59e0b' : '#ef4444';

    const captureChart = async (ref) => {
        if (ref.current) {
            const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#0f172a' }); 
            return canvas.toDataURL('image/png');
        }
        return null;
    };

    const handleExportPDF = async () => {
        setIsExporting(true);
        toast({ title: "Generating Report", description: "Capturing charts and compiling data..." });
        
        try {
            const histImg = await captureChart(histogramRef);
            const cdfImg = await captureChart(cdfRef);
            const tornadoImg = await captureChart(tornadoRef);

            const chartImages = { histogram: histImg, cdf: cdfImg, tornado: tornadoImg };

            await ReportGenerator.generateProbabilisticReport(
                state.reservoirName || 'Project', 
                probResults, 
                state.unitSystem,
                chartImages
            );
            
            toast({ title: "Success", description: "Report downloaded successfully.", className: "bg-emerald-900 text-white border-emerald-800" });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Export Failed", description: "Could not generate PDF report. " + e.message });
        } finally {
            setIsExporting(false);
        }
    };

    const containerClass = isCompact ? "flex flex-col gap-4 p-2" : "grid grid-cols-1 gap-6 p-4";
    const cardClass = isCompact ? "p-3 bg-slate-900 border-slate-800 min-h-[250px]" : "p-4 bg-slate-900 border-slate-800 min-h-[400px]";

    return (
        <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
             {!isCompact && (
                <div className="flex justify-between items-end p-4 border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white">Probabilistic Simulation Results</h2>
                        <div className="text-xs mt-1 flex items-center gap-3">
                            <span className="text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
                                {rawVolumes.length.toLocaleString()} Iterations
                            </span>
                            {probResults.diagnostics.warnings.length > 0 ? (
                                <span className="text-amber-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Warnings Present</span>
                            ) : (
                                <span className="text-blue-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Fully Validated</span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="default" size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={handleExportPDF} disabled={isExporting}>
                            {isExporting ? <span className="animate-pulse">Exporting...</span> : <><Download className="w-4 h-4" /> Export PDF</>}
                        </Button>
                    </div>
                </div>
             )}

            {!isCompact && probResults.diagnostics.warnings.length > 0 && (
                <div className="mx-4 mt-4 space-y-2">
                    {probResults.diagnostics.warnings.map((w, idx) => (
                        <div key={idx} className="mb-diagnostic-warn flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {w}
                        </div>
                    ))}
                </div>
            )}
            
            {!isCompact && baseVal && diffBaseP50 > 5 && (
                <div className="mx-4 mt-4 mb-diagnostic-error flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> P50 Volume deviates {diffBaseP50.toFixed(1)}% from Deterministic Base Case! Investigate inputs.
                </div>
            )}

            <div className={containerClass}>
                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-4`}>
                    {!isCompact && (
                         <Card className="p-4 bg-slate-900 border-slate-800 text-center shadow-md">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">P90 (Proven)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-white">{(stats.p90 / denom).toFixed(2)}</span>
                                <span className="text-xs text-slate-500">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                    <Card className={`${isCompact ? 'p-3' : 'p-4'} bg-emerald-950/20 border-emerald-500/30 text-center shadow-lg relative overflow-hidden`}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-400"></div>
                        <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1">P50 (Probable)</p>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-black text-white`}>{(stats.p50 / denom).toFixed(2)}</span>
                            <span className="text-xs text-emerald-400 font-bold">{unitLabel}</span>
                        </div>
                        {isCompact && (
                             <div className="flex justify-between mt-2 pt-2 border-t border-emerald-900/30 text-[10px]">
                                 <div className="text-slate-400">P90: <span className="text-white">{(stats.p90 / denom).toFixed(1)}</span></div>
                                 <div className="text-slate-400">P10: <span className="text-white">{(stats.p10 / denom).toFixed(1)}</span></div>
                             </div>
                        )}
                    </Card>
                    {!isCompact && (
                        <Card className="p-4 bg-slate-900 border-slate-800 text-center shadow-md">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">P10 (Possible)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-white">{(stats.p10 / denom).toFixed(2)}</span>
                                <span className="text-sm text-slate-500">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                </div>
                
                {isCompact && (
                    <Button variant="outline" size="sm" className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white" onClick={() => setIsFullViewOpen(true)}>
                        <Expand className="w-3 h-3 mr-2" /> Expand All Charts & Diagnostics
                    </Button>
                )}

                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                    <Card className={`${cardClass} flex flex-col`}>
                        <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                <ZoomIn className="w-3 h-3 text-blue-400" /> Volume Distribution
                            </h3>
                        </div>
                        <div className="flex-1 relative min-h-0 flex items-center justify-center text-slate-500" ref={histogramRef}>
                             Chart removed
                        </div>
                    </Card>
                    
                    <Card className={`${cardClass} flex flex-col`}>
                        <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                <Activity className="w-3 h-3 text-purple-400" /> Variance Decomposition (Tornado)
                            </h3>
                        </div>
                        <div className="flex-1 relative min-h-0 flex items-center justify-center text-slate-500" ref={tornadoRef}>
                             Chart removed
                        </div>
                    </Card>
                </div>

                {!isCompact && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                         <Card className="lg:col-span-3 p-4 bg-slate-900 border-slate-800 flex flex-col">
                            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                                <h3 className="text-sm font-bold text-slate-200">Detailed Statistics</h3>
                            </div>
                            <ProbabilisticSummaryTable />
                         </Card>
                         
                         <Card className="lg:col-span-1 p-4 bg-slate-900 border-slate-800 flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">Realization Tracker</h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                                <RealizationCard title="P90" realization={probResults.diagnostics.tracking.P90} unit={unitLabel} />
                                <RealizationCard title="P50" realization={probResults.diagnostics.tracking.P50} unit={unitLabel} />
                                <RealizationCard title="P10" realization={probResults.diagnostics.tracking.P10} unit={unitLabel} />
                            </div>
                         </Card>
                    </div>
                )}
            </div>
            
            <ResultsModal isOpen={isFullViewOpen} onClose={() => setIsFullViewOpen(false)} />
        </div>
    );
};

export default ProbabilisticResultsDisplay;
