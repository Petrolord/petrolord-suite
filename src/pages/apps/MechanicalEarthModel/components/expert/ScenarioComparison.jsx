
import React, { useState } from 'react';
import { useExpertMode } from '../../contexts/ExpertModeContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Download, Copy, Trash2, BarChart2 } from 'lucide-react';

const ScenarioComparison = () => {
    const { state, addScenario } = useExpertMode();
    const [newScenarioName, setNewScenarioName] = useState('');
    
    const scenarios = state.scenarios.length > 0 ? state.scenarios : [
        { id: 1, name: 'Base Case', heatFlow: 60, erosion: 500, maturity: 1.2, status: 'Completed' },
        { id: 2, name: 'High Heat Flow', heatFlow: 75, erosion: 500, maturity: 1.5, status: 'Completed' }
    ];

    const handleCreate = () => {
        if (!newScenarioName) return;
        addScenario({
            name: newScenarioName,
            heatFlow: 60,
            erosion: 500,
            maturity: 0,
            status: 'Draft'
        });
        setNewScenarioName('');
    };

    return (
        <div className="h-full flex flex-col bg-slate-950">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200">Scenario Manager</h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700 text-slate-300">
                        <Download className="w-3 h-3 mr-2" /> Export Report
                    </Button>
                </div>
                
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Input 
                            placeholder="New Scenario Name..." 
                            value={newScenarioName}
                            onChange={(e) => setNewScenarioName(e.target.value)}
                            className="h-8 bg-slate-950 border-slate-800 text-xs"
                        />
                    </div>
                    <Button 
                        onClick={handleCreate}
                        disabled={!newScenarioName}
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                        <Plus className="w-3 h-3 mr-2" /> Create
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                    <Label className="text-xs text-slate-400 uppercase tracking-wider">Active Scenarios</Label>
                    {scenarios.map((scenario) => (
                        <Card key={scenario.id} className="bg-slate-900 border-slate-800 p-3 flex items-center justify-between group hover:border-slate-700 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-500/20 p-2 rounded text-indigo-400">
                                    <Copy className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-slate-200">{scenario.name}</div>
                                    <div className="text-[10px] text-slate-500 flex gap-2">
                                        <span>HF: {scenario.heatFlow}</span>
                                        <span>Erosion: {scenario.erosion}m</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] h-5">
                                    {scenario.status}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400">
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <BarChart2 className="w-3 h-3" /> Comparative Analysis
                    </Label>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 h-[250px] relative overflow-hidden flex items-center justify-center text-slate-500">
                         Chart removed
                    </div>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                    <Table>
                        <TableHeader className="bg-slate-950/50">
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="h-8 text-xs text-slate-400">Metric</TableHead>
                                {scenarios.map(s => (
                                    <TableHead key={s.id} className="h-8 text-xs text-slate-400 text-right">{s.name}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableCell className="py-2 text-xs text-slate-300">Max Temp (°C)</TableCell>
                                {scenarios.map(s => (
                                    <TableCell key={s.id} className="py-2 text-xs text-slate-300 text-right font-mono">{(s.heatFlow * 2.5).toFixed(1)}</TableCell>
                                ))}
                            </TableRow>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableCell className="py-2 text-xs text-slate-300">Generation (mg/g)</TableCell>
                                {scenarios.map(s => (
                                    <TableCell key={s.id} className="py-2 text-xs text-slate-300 text-right font-mono">{(s.maturity * 10).toFixed(1)}</TableCell>
                                ))}
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default ScenarioComparison;
