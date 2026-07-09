import React from 'react';
import { Card } from '@/components/ui/card';
import { Layers, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import DeterministicSummaryTable from './DeterministicSummaryTable';
import { Badge } from '@/components/ui/badge';

const DeterministicResultsDisplay = () => {
    const { state } = useReservoirCalc();
    const results = state.results || {};
    const unit = results.volumeUnit || 'STB';
    const ft = results.fluidType || 'oil';
    const maps = state.maps || [];

    const safeNum = (val) => (val ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

    const showOil = ft === 'oil' || ft === 'oil_gas';
    const showGas = ft === 'gas' || ft === 'oil_gas';

    const warnings = results.warnings || [];
    const quality = results.qualityScore;
    const qualityColor = quality >= 85 ? 'text-emerald-400' : quality >= 60 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="h-full flex flex-col gap-6 p-4 overflow-y-auto">
            {/* Input quality / physical-consistency check */}
            {state.results && (
                <div className={`rounded-lg border p-3 ${warnings.length === 0 ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-amber-800/50 bg-amber-950/20'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                            <ShieldCheck className="w-4 h-4 text-blue-400" /> Input Quality
                            {quality != null && <span className={`font-mono ${qualityColor}`}>{quality}/100</span>}
                        </div>
                        {warnings.length === 0 ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Inputs are physically consistent</span>
                        ) : (
                            <span className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} issue{warnings.length > 1 ? 's' : ''}</span>
                        )}
                    </div>
                    {warnings.length > 0 && (
                        <ul className="mt-2 space-y-1 text-[11px] text-amber-300 list-disc pl-5">
                            {warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    )}
                </div>
            )}

            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {showOil && (
                    <Card className="p-6 bg-slate-900 border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 text-9xl font-bold leading-none text-emerald-100 select-none">O</div>
                        <h3 className="text-sm uppercase text-emerald-500 font-bold mb-2">STOOIP</h3>
                        <div className="text-4xl font-bold text-white tracking-tight">
                            {safeNum(results.stooip)} <span className="text-lg text-slate-500 font-normal">{unit}</span>
                        </div>
                        <p className="text-slate-400 text-sm mt-2">Recoverable: {safeNum(results.recoverableOil)}</p>
                    </Card>
                )}
                
                {showGas && (
                    <Card className="p-6 bg-slate-900 border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 text-9xl font-bold leading-none text-amber-100 select-none">G</div>
                        <h3 className="text-sm uppercase text-amber-500 font-bold mb-2">GIIP</h3>
                        <div className="text-4xl font-bold text-white tracking-tight">
                            {((results.giip || 0) / 1e9).toFixed(3)} <span className="text-lg text-slate-500 font-normal">B{state.unitSystem === 'field' ? 'scf' : 'sm³'}</span>
                        </div>
                        <p className="text-slate-400 text-sm mt-2">Recoverable: {((results.recoverableGas || 0) / 1e9).toFixed(3)} B</p>
                    </Card>
                )}
                
                <Card className="p-6 bg-slate-900 border-slate-800 flex flex-col justify-center gap-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="text-slate-500 text-sm">Gross Vol:</span>
                        <span className="text-white font-mono">{safeNum(results.bulkVolume)} {state.results?.volUnit}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="text-slate-500 text-sm">Net Vol:</span>
                        <span className="text-white font-mono">{safeNum(results.netVolume)} {state.results?.volUnit}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Pore Vol:</span>
                        <span className="text-white font-mono">{safeNum(results.poreVolumeRes)} {state.results?.resVolUnit}</span>
                    </div>
                </Card>
            </div>

            {/* Generated Maps Section */}
            {maps.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" /> Generated Maps ({maps.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {maps.map(m => (
                            <Badge key={m.id} variant="secondary" className="bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-default">
                                {m.name}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Detailed Table */}
            <div className="flex-1 min-h-0">
                <h3 className="text-lg font-bold text-white mb-4">Comprehensive Report</h3>
                <DeterministicSummaryTable />
            </div>
        </div>
    );
};

export default DeterministicResultsDisplay;