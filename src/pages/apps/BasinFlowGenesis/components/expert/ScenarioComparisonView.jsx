
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { GitBranch, Check, Trash2, Download, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const ScenarioComparisonView = () => {
    const { state, dispatch } = useBasinFlow();
    const { updateWell, state: mwState } = useMultiWell();
    const { scenarios, activeScenarioId } = state;
    const { toast } = useToast();

    const comparisonData = useMemo(() => {
        if (scenarios.length === 0) return [];

        return scenarios.map((s) => {
            if (!s.results?.burial || s.results.burial.length === 0) return null;
            const layerIdx = s.results.burial.length - 1;
            const history = s.results.burial[layerIdx];
            const maxRo = Math.max(...(s.results.maturity?.[layerIdx]?.map(m => m.value) || [0]));
            
            return {
                id: s.id,
                name: s.name,
                history,
                maxRo: maxRo || 0,
                heatFlow: s.heatFlow?.value || 0
            };
        }).filter(Boolean);
    }, [scenarios]);

    const handleSaveScenariosToDB = async () => {
        if (mwState.activeWellId) {
            await updateWell(mwState.activeWellId, { scenarios });
            toast({ title: "Scenarios Saved", description: "All scenarios persisted to database." });
        } else {
            toast({ variant: "destructive", title: "Error", description: "No active well." });
        }
    };

    const handleDeleteScenario = (id) => {
        dispatch({ type: 'DELETE_SCENARIO', id });
    };

    const safeFixed = (num, digits) => {
        if (typeof num !== 'number' || isNaN(num)) return '-';
        return num.toFixed(digits);
    };

    if (scenarios.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <GitBranch className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-slate-400">No Saved Scenarios</h3>
                <p className="text-sm">Run simulations and save them to compare results.</p>
            </div>
        );
    }

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto">
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card className="bg-slate-900 border-slate-800 flex flex-col max-h-[300px]">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-white text-sm">Scenario List</CardTitle>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveScenariosToDB} title="Sync to DB">
                            <Save className="w-3 h-3" />
                        </Button>
                    </CardHeader>
                    <ScrollArea className="flex-1 px-4">
                        <div className="space-y-2 pb-4">
                            {scenarios.map(s => (
                                <div key={s.id} className={`p-3 rounded border ${s.id === activeScenarioId ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-slate-950 border-slate-800'} cursor-pointer hover:bg-slate-800 transition-colors group`}>
                                    <div className="flex justify-between items-start">
                                        <div onClick={() => dispatch({type: 'LOAD_SCENARIO', id: s.id})} className="flex-1">
                                            <h4 className="text-sm font-medium text-white group-hover:text-indigo-300">{s.name}</h4>
                                            <p className="text-xs text-slate-500">{new Date(s.timestamp).toLocaleTimeString()}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s.id === activeScenarioId && <Check className="w-4 h-4 text-indigo-400" />}
                                            <Trash2 
                                                className="w-3 h-3 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteScenario(s.id); }} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
                
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Metrics Comparison</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-transparent">
                                    <TableHead className="h-8 text-xs">Scenario</TableHead>
                                    <TableHead className="h-8 text-xs text-right">HF</TableHead>
                                    <TableHead className="h-8 text-xs text-right">Max Ro</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonData.map(d => (
                                    <TableRow key={d.id} className="border-slate-800 hover:bg-slate-800/50">
                                        <TableCell className="font-medium text-xs py-2">{d.name}</TableCell>
                                        <TableCell className="text-xs text-right py-2">{d.heatFlow}</TableCell>
                                        <TableCell className="text-xs text-right py-2">{safeFixed(d.maxRo, 2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                
                <Button variant="outline" className="w-full text-xs">
                    <Download className="w-3 h-3 mr-2" /> Export Comparison Report
                </Button>
            </div>
            
            <div className="col-span-12 lg:col-span-9 grid grid-cols-1 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 h-[400px] flex items-center justify-center text-slate-500">
                    Chart removed
                </div>
                
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-white mb-2">Sensitivity Analysis</h4>
                    <p className="text-xs text-slate-400 mb-4">Relative difference from baseline (first scenario)</p>
                    <div className="grid grid-cols-3 gap-4">
                         {comparisonData.length > 1 && comparisonData.slice(1).map((d, i) => {
                             const baseline = comparisonData[0];
                             const diffRo = baseline.maxRo > 0 ? ((d.maxRo - baseline.maxRo) / baseline.maxRo) * 100 : 0;
                             return (
                                 <div key={d.id} className="p-3 bg-slate-950 rounded border border-slate-800">
                                     <div className="text-xs font-bold text-slate-300 mb-1">{d.name} vs {baseline.name}</div>
                                     <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-slate-500">Max Maturity</span>
                                        <span className={`text-sm font-mono font-bold ${diffRo > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                            {diffRo > 0 ? '+' : ''}{safeFixed(diffRo, 1)}%
                                        </span>
                                     </div>
                                 </div>
                             );
                         })}
                         {comparisonData.length <= 1 && (
                             <div className="col-span-3 text-center text-slate-500 text-xs py-4">
                                 Add more scenarios to see sensitivity analysis.
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScenarioComparisonView;
