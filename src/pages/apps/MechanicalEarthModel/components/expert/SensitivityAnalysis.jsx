
import React, { useState } from 'react';
import { useExpertMode } from '../../contexts/ExpertModeContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Play, Loader2, BarChart2 } from 'lucide-react';

const SensitivityAnalysis = () => {
    const { runSensitivityAnalysis } = useExpertMode();
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState(null);

    const handleRun = async () => {
        setIsRunning(true);
        const data = await runSensitivityAnalysis();
        setResults(data);
        setIsRunning(false);
    };

    return (
        <div className="h-full flex flex-col bg-slate-950">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-200 mb-4">Sensitivity Analysis</h3>
                
                <div className="flex items-end gap-4 p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="flex-1 space-y-2">
                         <Label className="text-xs text-slate-400">Parameter to Vary</Label>
                         <Select defaultValue="heatFlow">
                            <SelectTrigger className="h-8 bg-slate-950 border-slate-800 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="heatFlow">Basal Heat Flow</SelectItem>
                                <SelectItem value="erosion">Erosion Amount</SelectItem>
                                <SelectItem value="conductivity">Thermal Conductivity</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-24 space-y-2">
                         <Label className="text-xs text-slate-400">Min Value</Label>
                         <Input className="h-8 bg-slate-950 border-slate-800 text-xs font-mono" defaultValue="40" />
                    </div>
                    <div className="w-24 space-y-2">
                         <Label className="text-xs text-slate-400">Max Value</Label>
                         <Input className="h-8 bg-slate-950 border-slate-800 text-xs font-mono" defaultValue="80" />
                    </div>
                    <Button 
                        onClick={handleRun} 
                        disabled={isRunning}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs w-32"
                    >
                        {isRunning ? <Loader2 className="w-3 h-3 animate-spin mr-2"/> : <Play className="w-3 h-3 mr-2"/>}
                        Run Analysis
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                {!results ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                        <BarChart2 className="w-16 h-16 mb-4 text-slate-700"/>
                        <p className="text-sm">Configure parameters and run analysis to view results.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 h-[300px] relative overflow-hidden flex items-center justify-center text-slate-500">
                            <div className="absolute top-2 left-2 z-10 bg-slate-950/80 px-2 py-1 rounded text-xs font-bold text-slate-400">Parameter Impact (Tornado)</div>
                            Chart removed
                        </div>
                        
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 h-[300px] relative overflow-hidden flex items-center justify-center text-slate-500">
                            <div className="absolute top-2 left-2 z-10 bg-slate-950/80 px-2 py-1 rounded text-xs font-bold text-slate-400">Sensitivity Results</div>
                            Chart removed
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SensitivityAnalysis;
