import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ProbabilisticSummaryTable = () => {
    const { state } = useReservoirCalc();
    const { probResults } = state;
    
    if (!probResults?.stats?.stooip) return <div className="text-xs text-pl-muted p-4">No probabilistic results available.</div>;

    const stats = probResults.stats;
    const stooip = stats.stooip;
    const giip = stats.giip;
    
    const fmt = (val) => val ? (val / 1000000).toFixed(2) : '-';
    const fmtLarge = (val) => val ? (val / 1000000).toFixed(2) : '-';

    const projectName = state.currentProjectMeta?.name || 'Untitled Project';
    const reservoirName = state.reservoirName || 'Reservoir 1';

    return (
        <div className="rounded-md border border-pl-border overflow-hidden bg-pl-sunken shadow-sm">
            <div className="px-3 py-2 border-b border-pl-border bg-pl-surface flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
                <span className="text-pl-muted">Project: <span className="text-pl-text font-medium">{projectName}</span></span>
                <span className="text-pl-muted">Reservoir: <span className="text-pl-text font-medium">{reservoirName}</span></span>
                <span className="text-pl-muted">Date: <span className="text-pl-text">{new Date().toLocaleString()}</span></span>
            </div>
            <Table>
                <TableHeader className="bg-pl-surface">
                    <TableRow>
                        <TableHead className="text-[10px] text-pl-muted h-9 uppercase font-bold">Metric</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">P90 (Low)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold text-pl-primary-text">P50 (Base)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">P10 (High)</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Mean</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Std Dev</TableHead>
                        <TableHead className="text-[10px] text-pl-muted h-9 text-right uppercase font-bold">Range</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow className="border-b border-pl-border hover:bg-pl-surface transition-colors">
                        <TableCell className="text-xs font-medium text-pl-text py-3">STOOIP (MMstb)</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmtLarge(stooip.p90)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums font-bold text-base">{fmtLarge(stooip.p50)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmtLarge(stooip.p10)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums">{fmtLarge(stooip.mean)}</TableCell>
                        <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmtLarge(stooip.stdDev)}</TableCell>
                        <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmtLarge(stooip.max - stooip.min)}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-pl-border hover:bg-pl-surface transition-colors">
                        <TableCell className="text-xs font-medium text-pl-text py-3">GIIP (Bscf)</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmtLarge(giip.p90)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums font-bold text-base">{fmtLarge(giip.p50)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-mono">{fmtLarge(giip.p10)}</TableCell>
                        <TableCell className="text-xs text-pl-text text-right py-3 font-pl-mono tabular-nums">{fmtLarge(giip.mean)}</TableCell>
                        <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmtLarge(giip.stdDev)}</TableCell>
                        <TableCell className="text-xs text-pl-muted text-right py-3 font-mono">{fmtLarge(giip.max - giip.min)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
};

export default ProbabilisticSummaryTable;