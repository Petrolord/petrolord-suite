
import React from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info } from 'lucide-react';

const ComparisonAnalyzer = () => {
    const { state } = useReservoirCalc();
    const scenarios = state.comparisonScenarios || [];

    const displayScenarios = scenarios.length > 0 ? scenarios : [
        { id: 1, name: 'Base Case', stooip: 15000000, recoverable: 4500000, porosity: 0.20 },
        { id: 2, name: 'Upside Case', stooip: 22000000, recoverable: 7000000, porosity: 0.25 },
        { id: 3, name: 'Downside Case', stooip: 9000000, recoverable: 2000000, porosity: 0.15 }
    ];

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-4">Scenario Comparison Chart</h3>
                    <div className="flex-1 relative flex items-center justify-center text-slate-500">
                        Chart removed
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white text-sm">Statistics Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                <div className="text-xs text-slate-500 uppercase">Best Case</div>
                                <div className="text-lg font-bold text-emerald-400">
                                    {Math.max(...displayScenarios.map(s => s.stooip)).toLocaleString()}
                                </div>
                                <div className="text-xs text-slate-400">{displayScenarios.find(s => s.stooip === Math.max(...displayScenarios.map(i => i.stooip)))?.name}</div>
                            </div>
                            <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                <div className="text-xs text-slate-500 uppercase">Worst Case</div>
                                <div className="text-lg font-bold text-rose-400">
                                    {Math.min(...displayScenarios.map(s => s.stooip)).toLocaleString()}
                                </div>
                                <div className="text-xs text-slate-400">{displayScenarios.find(s => s.stooip === Math.min(...displayScenarios.map(i => i.stooip)))?.name}</div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-500/10 p-2 rounded">
                                <Info className="w-4 h-4 text-blue-400"/>
                                Add scenarios from the Calculation Results page to compare them here.
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-white">Detailed Comparison Table</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-slate-300">Metric</TableHead>
                                {displayScenarios.map(s => (
                                    <TableHead key={s.id} className="text-slate-300 text-right">{s.name}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="text-slate-400 font-medium">STOOIP</TableCell>
                                {displayScenarios.map(s => (
                                    <TableCell key={s.id} className="text-right font-mono text-white">{s.stooip.toLocaleString()}</TableCell>
                                ))}
                            </TableRow>
                            <TableRow className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="text-slate-400 font-medium">Recoverable</TableCell>
                                {displayScenarios.map(s => (
                                    <TableCell key={s.id} className="text-right font-mono text-emerald-400">{s.recoverable.toLocaleString()}</TableCell>
                                ))}
                            </TableRow>
                            <TableRow className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="text-slate-400 font-medium">Porosity</TableCell>
                                {displayScenarios.map(s => (
                                    <TableCell key={s.id} className="text-right font-mono text-slate-300">{(s.porosity * 100).toFixed(1)}%</TableCell>
                                ))}
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default ComparisonAnalyzer;
