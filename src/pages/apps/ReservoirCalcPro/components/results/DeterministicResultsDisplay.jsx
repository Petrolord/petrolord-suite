import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Layers, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import DeterministicSummaryTable from './DeterministicSummaryTable';
import ContactSweepChart from './ContactSweepChart';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    OIL_RESULT_UNITS, GAS_RESULT_UNITS, convertResultVolume,
    resultUnitLabel, defaultResultUnits
} from '../../services/unitsCatalog';
import { describeGridding } from '../../services/reportInfo';

// Compact selector rendered inside a result card header.
const ResultUnitSelect = ({ value, onChange, options }) => (
    <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-6 w-[92px] text-[10px]">
            <SelectValue />
        </SelectTrigger>
        <SelectContent>
            {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
        </SelectContent>
    </Select>
);

const DeterministicResultsDisplay = () => {
    const { state } = useReservoirCalc();
    const results = state.results || {};
    const ft = results.fluidType || 'oil';
    const maps = state.maps || [];

    // Results echo the unit system they were computed under; convert for
    // display only, from that canonical (STB/scf field, sm³ metric).
    const rSystem = results.unitSystem || state.unitSystem;
    const oilCanon = rSystem === 'field' ? 'STB' : 'sm³';
    const gasCanon = rSystem === 'field' ? 'scf' : 'sm³';
    const [oilUnit, setOilUnit] = useState(defaultResultUnits(rSystem).oil);
    const [gasUnit, setGasUnit] = useState(defaultResultUnits(rSystem).gas);
    useEffect(() => {
        setOilUnit(defaultResultUnits(rSystem).oil);
        setGasUnit(defaultResultUnits(rSystem).gas);
    }, [rSystem]);

    const safeNum = (val) => (val ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
    // Aggregated units (MMSTB, Bscf…) need decimals; raw units read as integers.
    const fmtVol = (val) => {
        const v = val ?? 0;
        return Math.abs(v) >= 1000
            ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
    };
    const oilVol = (v) => fmtVol(convertResultVolume(v, oilCanon, oilUnit, 'oil'));
    const gasVol = (v) => fmtVol(convertResultVolume(v, gasCanon, gasUnit, 'gas'));

    const showOil = ft === 'oil' || ft === 'oil_gas';
    const showGas = ft === 'gas' || ft === 'oil_gas';

    const warnings = results.warnings || [];
    const quality = results.qualityScore;
    const qualityColor = quality >= 85 ? 'text-pl-success-text' : quality >= 60 ? 'text-pl-warning-text' : 'text-pl-danger-text';

    return (
        <div className="h-full flex flex-col gap-6 p-4 overflow-y-auto">
            {/* Input quality / physical-consistency check */}
            {state.results && (
                <div className={`rounded-lg border p-3 ${warnings.length === 0 ? 'border-pl-success/40 bg-pl-success-bg' : 'border-pl-warning/40 bg-pl-warning-bg'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-pl-text">
                            <ShieldCheck className="w-4 h-4 text-pl-muted" /> Input Quality
                            {quality != null && <span className={`font-mono ${qualityColor}`}>{quality}/100</span>}
                        </div>
                        {warnings.length === 0 ? (
                            <span className="text-xs text-pl-success-text flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Inputs are physically consistent</span>
                        ) : (
                            <span className="text-xs text-pl-warning-text flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {warnings.length} issue{warnings.length > 1 ? 's' : ''}</span>
                        )}
                    </div>
                    {warnings.length > 0 && (
                        <ul className="mt-2 space-y-1 text-[11px] text-pl-warning-text list-disc pl-5">
                            {warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    )}
                </div>
            )}

            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {showOil && (
                    <Card className="p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 text-9xl font-bold leading-none text-pl-muted select-none">O</div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm uppercase text-pl-muted font-bold tracking-wider">STOOIP</h3>
                            <ResultUnitSelect value={oilUnit} onChange={setOilUnit} options={OIL_RESULT_UNITS} />
                        </div>
                        <div className="text-4xl font-bold font-pl-mono tabular-nums text-pl-text tracking-tight" data-testid="rcp-stooip-full" data-value={results.stooip}>
                            {oilVol(results.stooip)} <span className="text-lg text-pl-muted font-normal">{resultUnitLabel(oilUnit, 'oil')}</span>
                        </div>
                        <p className="text-pl-muted text-sm mt-2">Recoverable: {oilVol(results.recoverableOil)} {resultUnitLabel(oilUnit, 'oil')}</p>
                        {Number.isFinite(results.solutionGas) && (
                            <p className="text-pl-muted text-sm mt-1" data-testid="rcp-solution-gas" data-value={results.solutionGas}>
                                Solution gas in place: {fmtVol(results.solutionGas / 1e9)} {rSystem === 'field' ? 'Bscf' : 'billion sm³'} (Rs {results.rs}); recoverable {fmtVol(results.recoverableSolutionGas / 1e9)} at the oil RF
                            </p>
                        )}
                        {results.saturationHeight && (
                            <p className="text-pl-muted text-xs mt-1" data-testid="rcp-shm-used">Sw from saturation height: oil leg {Number.isFinite(results.saturationHeight.swOil) ? results.saturationHeight.swOil.toFixed(3) : 'n/a'}</p>
                        )}
                    </Card>
                )}
                
                {showGas && (
                    <Card className="p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 text-9xl font-bold leading-none text-pl-muted select-none">G</div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm uppercase text-pl-muted font-bold tracking-wider" title={ft === 'oil_gas' ? 'Free gas in the gas cap; solution gas in the oil leg is not included' : undefined}>{ft === 'oil_gas' ? 'GIIP (free gas)' : 'GIIP'}</h3>
                            <ResultUnitSelect value={gasUnit} onChange={setGasUnit} options={GAS_RESULT_UNITS} />
                        </div>
                        <div className="text-4xl font-bold font-pl-mono tabular-nums text-pl-text tracking-tight">
                            {gasVol(results.giip)} <span className="text-lg text-pl-muted font-normal">{resultUnitLabel(gasUnit, 'gas')}</span>
                        </div>
                        <p className="text-pl-muted text-sm mt-2">Recoverable: {gasVol(results.recoverableGas)} {resultUnitLabel(gasUnit, 'gas')}</p>
                        {Number.isFinite(results.condensate) && (
                            <p className="text-pl-muted text-sm mt-1" data-testid="rcp-condensate">
                                {results.condensateKind === 'vaporised oil' ? 'Vaporised oil in the gas cap' : 'Condensate in place'}: {fmtVol(results.condensate / 1e6)} {rSystem === 'field' ? 'MMSTB' : 'MMsm³'} ({results.condensateKind === 'vaporised oil' ? 'Rv' : 'CGR'} {results.cgr}); recoverable {fmtVol(results.recoverableCondensate / 1e6)} at the gas RF
                            </p>
                        )}
                    </Card>
                )}
                
                <Card className="p-6 flex flex-col justify-center gap-2">
                    <div className="flex justify-between items-center border-b border-pl-border pb-2">
                        <span className="text-pl-muted text-sm">Gross Vol:</span>
                        <span className="text-pl-text font-mono">{safeNum(results.bulkVolume)} {state.results?.volUnit}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-pl-border pb-2">
                        <span className="text-pl-muted text-sm">Net Vol:</span>
                        <span className="text-pl-text font-mono">{safeNum(results.netVolume)} {state.results?.volUnit}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-pl-muted text-sm">Pore Vol:</span>
                        <span className="text-pl-text font-mono">{safeNum(results.poreVolumeRes)} {state.results?.resVolUnit}</span>
                    </div>
                </Card>
            </div>

            {results.gridding && (
                <p className="text-[11px] text-pl-muted -mt-3" data-testid="rcp-gridding">{describeGridding(results)}</p>
            )}

            <ContactSweepChart />

            {/* Generated Maps Section */}
            {maps.length > 0 && (
                <div className="bg-pl-surface border border-pl-border rounded-lg p-4">
                    <h3 className="text-sm font-bold text-pl-text mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-pl-muted" /> Generated Maps ({maps.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {maps.map(m => (
                            <Badge key={m.id} variant="neutral" className="cursor-default">
                                {m.name}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Detailed Table */}
            <div className="flex-1 min-h-0">
                <h3 className="text-lg font-bold text-pl-text mb-4">Comprehensive Report</h3>
                <DeterministicSummaryTable />
            </div>
        </div>
    );
};

export default DeterministicResultsDisplay;