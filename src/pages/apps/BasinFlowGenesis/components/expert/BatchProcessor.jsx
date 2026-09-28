import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle, XCircle, AlertCircle, Layers, Loader2 } from 'lucide-react';
import { useMultiWell } from '../../contexts/MultiWellContext';
import { BatchEngine } from '../../services/BatchEngine';
import { useToast } from '@/components/ui/use-toast';

const BatchProcessor = () => {
    const { state: mwState } = useMultiWell();
    const { toast } = useToast();
    
    const [selectedWells, setSelectedWells] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ completed: 0, total: 0, current: '' });
    const [results, setResults] = useState(null);

    const handleToggleWell = (id) => {
        setSelectedWells(prev => 
            prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedWells.length === mwState.wells.length) {
            setSelectedWells([]);
        } else {
            setSelectedWells(mwState.wells.map(w => w.id));
        }
    };

    const handleRunBatch = async () => {
        if (selectedWells.length === 0) return;
        
        setIsRunning(true);
        setResults(null);
        setProgress({ completed: 0, total: selectedWells.length, current: 'Starting...' });

        try {
            // Filter full well objects using the map
            const wellsToRun = selectedWells.map(id => mwState.wellDataMap[id]).filter(Boolean);
            
            const batchResults = await BatchEngine.runBatch(wellsToRun, (completed, total, current) => {
                setProgress({ completed, total, current });
            });

            setResults(batchResults);
            toast({ title: "Batch Complete", description: `Processed ${batchResults.length} wells.` });
        } catch (e) {
            toast({ variant: "destructive", title: "Batch Failed", description: e.message });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-pl-bg overflow-y-auto">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-pl-text">Batch Simulation</h2>
                    <Button variant="outline" size="sm" onClick={handleSelectAll} className="text-xs">
                        {selectedWells.length === mwState.wells.length ? "Deselect All" : "Select All"}
                    </Button>
                </div>

                <Card className="flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-pl-muted">Available Wells ({mwState.wells.length})</CardTitle>
                    </CardHeader>
                    <ScrollArea className="h-[400px]">
                        <div className="p-2 space-y-1">
                            {mwState.wells.map(well => (
                                <div 
                                    key={well.id} 
                                    className={`flex items-center space-x-3 p-3 rounded border transition-colors cursor-pointer ${selectedWells.includes(well.id) ? 'bg-pl-sunken border-pl-primary/50' : 'bg-pl-bg border-pl-border hover:border-pl-border'}`}
                                    onClick={() => handleToggleWell(well.id)}
                                >
                                    <Checkbox checked={selectedWells.includes(well.id)} />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-pl-text">{well.name}</div>
                                        <div className="text-xs text-pl-muted flex gap-2">
                                            <span className={`capitalize ${well.status === 'calibrated' ? 'text-pl-primary-text' : ''}`}>{well.status}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>

                <Button 
                    className="w-full h-12 text-lg"
                    onClick={handleRunBatch}
                    disabled={isRunning || selectedWells.length === 0}
                >
                    {isRunning ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}
                    Run Batch ({selectedWells.length})
                </Button>
            </div>

            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-pl-text mb-2">Results</h2>
                    {isRunning && (
                        <div className="space-y-2 bg-pl-surface p-4 rounded border border-pl-border">
                            <div className="flex justify-between text-sm text-pl-text">
                                <span>Processing: {progress.current || '...'}</span>
                                <span>{progress.completed}/{progress.total}</span>
                            </div>
                            <Progress value={(progress.completed / progress.total) * 100} className="h-2" />
                        </div>
                    )}
                </div>

                {results && (
                    <Card>
                        <ScrollArea className="h-[500px]">
                            <div className="p-4 space-y-2">
                                {results.map((res, i) => {
                                    const wellName = mwState.wellDataMap[res.wellId]?.name || 'Unknown Well';
                                    return (
                                        <div key={i} className="p-3 bg-pl-bg rounded border border-pl-border flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                {res.status === 'success' ? <CheckCircle className="w-5 h-5 text-pl-primary-text"/> : <XCircle className="w-5 h-5 text-pl-danger-text"/>}
                                                <div>
                                                    <div className="text-sm font-medium text-pl-text">{wellName}</div>
                                                    {res.status === 'success' ? (
                                                        <div className="text-xs text-pl-muted">Max Ro: {res.maxRo.toFixed(2)}% | Max Temp: {res.maxTemp.toFixed(0)}°C</div>
                                                    ) : (
                                                        <div className="text-xs text-pl-danger-text">{res.error}</div>
                                                    )}
                                                </div>
                                            </div>
                                            {res.status === 'success' && <Badge variant="outline" className="border-pl-primary/50 text-pl-primary-text">Success</Badge>}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </Card>
                )}
                
                {!results && !isRunning && (
                    <div className="h-[400px] flex flex-col items-center justify-center text-pl-muted border-2 border-dashed border-pl-border rounded-lg">
                        <Layers className="w-12 h-12 mb-4 opacity-20" />
                        <p>Run a batch to view results summary here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BatchProcessor;