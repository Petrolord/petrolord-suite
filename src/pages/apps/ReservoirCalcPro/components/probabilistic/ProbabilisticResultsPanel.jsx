
import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ProbabilisticResultsPanel = () => {
    const { state } = useReservoirCalc();
    const { probResults } = state;

    if (!probResults) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Run simulation to view results.
            </div>
        );
    }

    const { stats } = probResults;
    const stooipStats = stats.stooip || {};

    return (
        <ScrollArea className="h-full p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4 bg-slate-900 border-slate-800 flex flex-col items-center">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">P90 (Proven)</h4>
                    <div className="text-2xl font-bold text-white">{(stooipStats.p90 / 1e6).toFixed(2)} MM</div>
                </Card>
                <Card className="p-4 bg-emerald-950/30 border-emerald-900/50 flex flex-col items-center border">
                    <h4 className="text-xs font-bold text-emerald-500 uppercase">P50 (Probable)</h4>
                    <div className="text-3xl font-bold text-emerald-400">{(stooipStats.p50 / 1e6).toFixed(2)} MM</div>
                </Card>
                <Card className="p-4 bg-slate-900 border-slate-800 flex flex-col items-center">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">P10 (Possible)</h4>
                    <div className="text-2xl font-bold text-white">{(stooipStats.p10 / 1e6).toFixed(2)} MM</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <Card className="bg-slate-900 border-slate-800 p-4 h-[400px]">
                    <h4 className="text-sm font-bold text-white mb-2">STOOIP Distribution</h4>
                    <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-4 h-[400px]">
                    <h4 className="text-sm font-bold text-white mb-2">Sensitivity (Tornado)</h4>
                    <div className="flex items-center justify-center w-full h-full text-slate-500">Chart removed</div>
                </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-950">
                        <TableRow>
                            <TableHead className="text-slate-300">Statistic</TableHead>
                            <TableHead className="text-right text-slate-300">Value (STB)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell className="font-medium">Mean</TableCell>
                            <TableCell className="text-right font-mono text-slate-400">{(stooipStats.mean).toLocaleString(undefined, {maximumFractionDigits: 0})}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Min</TableCell>
                            <TableCell className="text-right font-mono text-slate-400">{(stooipStats.min).toLocaleString(undefined, {maximumFractionDigits: 0})}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Max</TableCell>
                            <TableCell className="text-right font-mono text-slate-400">{(stooipStats.max).toLocaleString(undefined, {maximumFractionDigits: 0})}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell className="font-medium">Std Dev</TableCell>
                            <TableCell className="text-right font-mono text-slate-400">{(stooipStats.stdDev).toLocaleString(undefined, {maximumFractionDigits: 0})}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </Card>
        </ScrollArea>
    );
};

export default ProbabilisticResultsPanel;
