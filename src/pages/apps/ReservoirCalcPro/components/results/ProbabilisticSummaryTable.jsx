import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { inPlaceScale, runContext } from '../../services/volumeDisplay';

// Detailed Statistics (RCP-U1-001): every row divides by its own stream's
// divisor and says its own unit. The GIIP row used to divide scf by 1e6
// under a "Bscf" header (1000x), and STOOIP read "MMstb" in metric.
// Recoverable rows (RCP-U1-003) are the in-place volume times the recovery
// factor of each realization; oil-equivalent at 6 Mscf per boe.

export function summaryRows(probResults, fluidType, unitSystem) {
    const s = probResults?.stats || {};
    const oil = inPlaceScale('oil', unitSystem);
    const gas = inPlaceScale('gas', unitSystem);
    const showOil = fluidType !== 'gas';
    const showGas = fluidType !== 'oil';
    const rows = [];
    if (showOil && s.stooip) rows.push({ key: 'stooip', label: `STOIIP (${oil.label})`, st: s.stooip, denom: oil.denom });
    if (showGas && s.giip) rows.push({ key: 'giip', label: `GIIP${fluidType === 'oil_gas' ? ', free gas' : ''} (${gas.label})`, st: s.giip, denom: gas.denom });
    if (showOil && s.recoverableOil?.mean !== undefined) rows.push({ key: 'recOil', label: `Recoverable oil (${oil.label})`, st: s.recoverableOil, denom: oil.denom });
    if (showGas && s.recoverableGas?.mean !== undefined) rows.push({ key: 'recGas', label: `Recoverable gas (${gas.label})`, st: s.recoverableGas, denom: gas.denom });
    if (fluidType === 'oil_gas' && s.recoverableBoe?.mean !== undefined) rows.push({ key: 'recBoe', label: 'Recoverable oil equivalent (MMboe)', st: s.recoverableBoe, denom: 1e6 });
    return rows;
}

const ProbabilisticSummaryTable = () => {
    const { state } = useReservoirCalc();
    const { probResults } = state;
    
    if (!probResults?.stats?.stooip) return <div className="text-xs text-pl-muted p-4">No probabilistic results available.</div>;

    const run = runContext(probResults, state);
    const rows = summaryRows(probResults, run.fluidType, run.unitSystem);
    const fmt = (val, denom) => (Number.isFinite(val) ? (val / denom).toFixed(2) : EMPTY_VALUE);

    const projectName = state.currentProjectMeta?.name || 'Untitled Project';
    const reservoirName = state.reservoirName || 'Reservoir 1';

    return (
        <div className="rounded-md border border-pl-border overflow-hidden bg-pl-sunken shadow-sm" data-testid="rcp-mc-summary">
            <div className="px-3 py-2 border-b border-pl-border bg-pl-surface flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
                <span className="text-pl-muted">Project: <span className="text-pl-text font-medium">{projectName}</span></span>
                <span className="text-pl-muted">Reservoir: <span className="text-pl-text font-medium">{reservoirName}</span></span>
                <span className="text-pl-muted">Run: <span className="text-pl-text">{probResults.meta?.ranAt ? new Date(probResults.meta.ranAt).toLocaleString() : EMPTY_VALUE}</span></span>
            </div>
            <Table>
                <TableHeader className="bg-pl-surface">
                    <TableRow>
                        <TableHead className="text-[10px] text-pl-muted h-9 uppercase font-bold">Metric</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">P90 (Low)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold text-pl-primary-text">P50 (Best)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">P10 (High)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Mean</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Std Dev</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Range</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(({ key, label, st, denom }) => (
                        <TableRow key={key} data-testid={`rcp-mc-row-${key}`} className="border-b border-pl-border hover:bg-pl-surface transition-colors">
                            <TableCell className="text-xs font-medium text-pl-text py-3">{label}</TableCell>
                            <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmt(st.p90, denom)}</TableCell>
                            <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums font-bold text-base" data-testid={`rcp-mc-p50-${key}`}>{fmt(st.p50, denom)}</TableCell>
                            <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmt(st.p10, denom)}</TableCell>
                            <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums">{fmt(st.mean, denom)}</TableCell>
                            <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmt(st.stdDev, denom)}</TableCell>
                            <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmt(st.max - st.min, denom)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

export default ProbabilisticSummaryTable;
