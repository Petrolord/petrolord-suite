
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
            <div className="h-full flex flex-col items-center justify-center text-pl-muted">
                <GitBranch className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-pl-muted">No Saved Scenarios</h3>
                <p className="text-sm">Run simulations and save them to compare results.</p>
            </div>
        );
    }

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto">
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card className="flex flex-col max-h-[300px]">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-pl-text text-sm">Scenario List</CardTitle>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveScenariosToDB} title="Sync to DB">
                            <Save className="w-3 h-3" />
                        </Button>
                    </CardHeader>
                    <ScrollArea className="flex-1 px-4">
                        <div className="space-y-2 pb-4">
                            {scenarios.map(s => (
                                <div key={s.id} className={`p-3 rounded border ${s.id === activeScenarioId ? 'bg-pl-sunken border-pl-primary' : 'bg-pl-surface border-pl-border'} cursor-pointer hover:bg-pl-sunken transition-colors group`}>
                                    <div className="flex justify-between items-start">
                                        <div onClick={() => dispatch({type: 'LOAD_SCENARIO', id: s.id})} className="flex-1">
                                            <h4 className="text-sm font-medium text-pl-text group-hover:text-pl-primary-text">{s.name}</h4>
                                            <p className="text-xs text-pl-muted">{new Date(s.timestamp).toLocaleTimeString()}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s.id === activeScenarioId && <Check className="w-4 h-4 text-pl-primary-text" />}
                                            <Trash2 
                                                className="w-3 h-3 text-pl-muted hover:text-pl-danger-text opacity-0 group-hover:opacity-100 transition-opacity" 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteScenario(s.id); }} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
                
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Metrics Comparison</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-pl-border hover:bg-transparent">
                                    <TableHead className="h-8 text-xs">Scenario</TableHead>
                                    <TableHead className="h-8 text-xs text-right">HF</TableHead>
                                    <TableHead className="h-8 text-xs text-right">Max Ro</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonData.map(d => (
                                    <TableRow key={d.id} className="border-pl-border hover:bg-pl-sunken">
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
                <div className="bg-pl-surface border border-pl-border rounded-lg p-1 h-[400px] flex items-center justify-center text-pl-muted">
                    Chart removed
                </div>
                
                <div className="bg-pl-surface border border-pl-border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-pl-text mb-2">Sensitivity Analysis</h4>
                    <p className="text-xs text-pl-muted mb-4">Relative difference from baseline (first scenario)</p>
                    <div className="grid grid-cols-3 gap-4">
                         {comparisonData.length > 1 && comparisonData.slice(1).map((d, i) => {
                             const baseline = comparisonData[0];
                             const diffRo = baseline.maxRo > 0 ? ((d.maxRo - baseline.maxRo) / baseline.maxRo) * 100 : 0;
                             return (
                                 <div key={d.id} className="p-3 bg-pl-sunken rounded border border-pl-border">
                                     <div className="text-xs font-bold text-pl-text mb-1">{d.name} vs {baseline.name}</div>
                                     <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-pl-muted">Max Maturity</span>
                                        <span className="text-sm font-mono font-bold text-pl-text">
                                            {diffRo > 0 ? '+' : ''}{safeFixed(diffRo, 1)}%
                                        </span>
                                     </div>
                                 </div>
                             );
                         })}
                         {comparisonData.length <= 1 && (
                             <div className="col-span-3 text-center text-pl-muted text-xs py-4">
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
