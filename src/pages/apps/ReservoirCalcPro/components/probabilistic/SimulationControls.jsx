import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const SimulationControls = ({ onRun, isRunning, progress, iterations, setIterations, hasResults }) => {
    return (
        <div className="bg-pl-surface p-4 border-b border-pl-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-pl-muted uppercase font-bold tracking-wider mb-1">Iterations</span>
                    <Select 
                        value={iterations.toString()} 
                        onValueChange={(val) => setIterations(parseInt(val))}
                        disabled={isRunning}
                    >
                        <SelectTrigger className="h-9 w-[120px] text-xs">
                            <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1000">1,000</SelectItem>
                            <SelectItem value="5000">5,000</SelectItem>
                            <SelectItem value="10000">10,000</SelectItem>
                            <SelectItem value="50000">50,000 (Slow)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button 
                                size="lg" 
                                className={`h-9 px-6 font-bold uppercase tracking-wide transition-all ${
                                    isRunning 
                                    ? 'bg-pl-sunken text-pl-muted' 
                                    : ''
                                }`}
                                onClick={onRun}
                                disabled={isRunning}
                            >
                                {isRunning ? (
                                    <div className="flex items-center gap-2">
                                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-pl-border-strong border-t-transparent"></span>
                                        Running...
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Play className="w-4 h-4 fill-current" /> Run Simulation
                                    </div>
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Run Monte Carlo Simulation (Ctrl + R)</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {isRunning && (
                    <div className="flex flex-col w-48 gap-1">
                         <div className="flex justify-between text-[10px] text-pl-muted">
                            <span>Processing...</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5 bg-pl-sunken" indicatorClassName="bg-pl-primary" />
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-2">
                 {hasResults && !isRunning && (
                    <div className="text-xs text-pl-success-text mr-2 animate-in fade-in slide-in-from-right-4">
                        ✓ Results Ready
                    </div>
                 )}
            </div>
        </div>
    );
};

export default SimulationControls;