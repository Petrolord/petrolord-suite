import React, { useState } from 'react';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Maximize2, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ResultsModal from './results/ResultsModal';

const ExpertResultsPanel = () => {
    const { state, calculate } = useReservoirCalc(); 
    const { results, isCalculating, calcMethod, probResults, error } = state;
    const [isModalOpen, setModalOpen] = useState(false);
    const { toast } = useToast();

    const handleRecalculate = () => {
        if (typeof calculate === 'function') {
            calculate();
        }
    };

    if (isCalculating) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center space-y-4 border-l border-slate-800">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                <h3 className="text-sm font-bold text-slate-200">Processing Data...</h3>
                <p className="text-[10px] text-slate-400">Please wait while the simulation runs.</p>
            </div>
        );
    }

    if (calcMethod === 'probabilistic') {
         const isGas = state.inputs?.fluidType === 'gas';
         const stats = isGas ? probResults?.stats?.giip : probResults?.stats?.stooip;
         const denom = isGas ? 1e9 : 1e6;
         const unitStr = isGas ? (state.unitSystem === 'field' ? 'Bscf' : 'MMsm³') : 'MMstb';
         const titleStr = isGas ? 'GIIP' : 'STOOIP';

         return (
            <div className="h-full flex flex-col bg-slate-950 p-2 overflow-hidden space-y-3">
                <div className="px-2 py-1 border-b border-slate-800 flex justify-between items-end">
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">SIMULATION RESULTS</h3>
                        <div className="text-[10px] text-slate-400 font-mono">Monte Carlo Analysis</div>
                    </div>
                </div>
                
                {error && (
                    <div className="bg-red-900/20 border border-red-900/50 p-3 rounded-md text-xs text-red-300 flex items-start gap-2 mx-1 mt-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-800 px-1">
                    {stats ? (
                        <>
                             <Card className="bg-slate-900 border-slate-800 p-4 text-center relative overflow-hidden shadow-lg shadow-emerald-900/10">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-blue-500"></div>
                                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">P50 (Probable) {titleStr}</div>
                                <div className="text-3xl font-black text-white mb-1 tracking-tight">
                                    {(stats.p50 / denom).toFixed(2)}
                                </div>
                                <div className="text-[9px] text-slate-500 uppercase">{unitStr}</div>
                            </Card>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <Card className="bg-slate-900 border-slate-800 p-2 text-center">
                                     <div className="text-[9px] text-slate-500 uppercase font-bold">P90 (Proven)</div>
                                     <div className="text-lg font-bold text-slate-200">{(stats.p90 / denom).toFixed(2)}</div>
                                </Card>
                                <Card className="bg-slate-900 border-slate-800 p-2 text-center">
                                     <div className="text-[9px] text-slate-500 uppercase font-bold">P10 (Possible)</div>
                                     <div className="text-lg font-bold text-slate-200">{(stats.p10 / denom).toFixed(2)}</div>
                                </Card>
                            </div>

                            <div className="bg-slate-900/50 p-2 rounded border border-slate-800/50 text-[10px] text-slate-500 space-y-1">
                                <div className="flex justify-between"><span>Mean:</span> <span className="text-slate-300">{(stats.mean / denom).toFixed(2)} {unitStr}</span></div>
                                <div className="flex justify-between"><span>Range:</span> <span className="text-slate-300">{((stats.max - stats.min) / denom).toFixed(2)} {unitStr}</span></div>
                            </div>

                            <Button 
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2 shadow-lg shadow-emerald-900/20 h-9 text-xs"
                                onClick={() => setModalOpen(true)}
                            >
                                <BarChart3 className="w-3 h-3 mr-2" /> View Full Analysis
                            </Button>
                        </>
                    ) : (
                        <div className="text-center text-slate-500 mt-10 flex flex-col items-center justify-center h-40">
                            <BarChart3 className="w-10 h-10 mb-3 opacity-20" />
                            <p className="text-xs">Configure distributions in the Probabilistic tab and run the simulation.</p>
                        </div>
                    )}
                </div>
                 <ResultsModal 
                    isOpen={isModalOpen} 
                    onClose={() => setModalOpen(false)}
                />
            </div>
         );
    }

    // Render Deterministic View
    return (
        <div className="h-full flex flex-col bg-slate-950 p-2 overflow-hidden space-y-3">
            <div className="px-2 py-1 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-200">DETERMINISTIC</h3>
                <div className="text-[10px] text-slate-400 font-mono truncate">{state.reservoirName || 'Single Scenario'}</div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-800 px-1">
                
                {error && (
                    <div className="bg-red-900/20 border border-red-900/50 p-3 rounded-md text-xs text-red-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                
                {/* Main KPI Card */}
                <Card className="bg-slate-900 border-slate-800 p-4 text-center relative overflow-hidden shadow-lg shadow-blue-900/10">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-emerald-500"></div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {state.inputs?.fluidType === 'gas' ? 'GIIP' : 'STOOIP'}
                    </div>
                    <div className="text-3xl font-black text-white mb-1 tracking-tight">
                        {results ? (
                            state.inputs?.fluidType === 'gas' ? (
                                ((results.giip || 0) / 1e9).toFixed(3) + " B"
                            ) : (
                                (results.stooip / 1e6).toFixed(2) + " MM"
                            )
                        ) : "---"}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase">
                        {state.inputs?.fluidType === 'gas' ? (state.unitSystem === 'field' ? 'scf' : 'sm³') : 'STB'}
                    </div>
                </Card>

                {/* Quick Stats */}
                {results && (
                    <div className="space-y-2 bg-slate-900/30 p-2 rounded border border-slate-800/50">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Bulk Vol:</span>
                            <span className="font-mono text-slate-300">
                                {results.bulkVolume ? results.bulkVolume.toLocaleString(undefined, {maximumFractionDigits:0}) : 0} {results.volUnit || ''}
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Net Vol:</span>
                            <span className="font-mono text-slate-300">
                                {results.netVolume ? results.netVolume.toLocaleString(undefined, {maximumFractionDigits:0}) : 0} {results.volUnit || ''}
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">HC Area:</span>
                            <span className="font-mono text-slate-300">
                                {results.hcArea ? results.hcArea.toLocaleString(undefined, {maximumFractionDigits:0}) : 0} {state.unitSystem === 'field' ? 'acres' : 'km²'}
                            </span>
                        </div>
                    </div>
                )}

                {results && (
                    <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-xs h-8 text-slate-300" onClick={() => setModalOpen(true)}>
                        <Maximize2 className="w-3 h-3 mr-2" /> View Full Results
                    </Button>
                )}

                {/* Action Button */}
                <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-900/20 h-10 text-xs mt-4"
                    onClick={handleRecalculate}
                >
                    <Play className="w-3 h-3 mr-2 fill-current" /> Recalculate
                </Button>
            </div>
            
            <ResultsModal 
                isOpen={isModalOpen} 
                onClose={() => setModalOpen(false)}
            />
        </div>
    );
};

export default ExpertResultsPanel;