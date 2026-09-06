import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertTriangle, BarChart2 } from 'lucide-react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';

const SimulationRunDialog = ({ isOpen, onClose, onComplete, onCancel }) => {
    const { state, runSimulation } = useBasinFlow();
    const [status, setStatus] = useState('idle'); // idle, running, success, error
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState([]);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    // Reset state when opened
    useEffect(() => {
        if (isOpen && status === 'idle') {
            startSimulation();
        }
    }, [isOpen]);

    const startSimulation = async () => {
        setStatus('running');
        setProgress(0);
        setLogs(['Initializing simulation engine...', 'Validating input parameters...']);

        try {
            // BF0: the run is the only wait; the staged delays that used
            // to pad this dialog were theatre
            addLog('Decompacting, solving heat and kinetics...');
            setProgress(20);
            await runSimulation();
            addLog('Finalizing results...');
            setProgress(100);
            setStatus('success');
            if(onComplete) onComplete();

        } catch (error) {
            console.error(error);
            setStatus('error');
            addLog(`Error: ${error.message}`);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => { if(status !== 'running') onClose(); }}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle>Basin Simulation</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Running 1D burial, thermal, and maturity history models.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    {/* Status Icon */}
                    <div className="flex justify-center">
                        {status === 'running' && (
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin relative z-10" />
                            </div>
                        )}
                        {status === 'success' && (
                            <div className="p-4 bg-emerald-900/30 rounded-full border border-emerald-500/30 animate-in zoom-in">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="p-4 bg-red-900/30 rounded-full border border-red-500/30 animate-in zoom-in">
                                <AlertTriangle className="w-12 h-12 text-red-500" />
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span data-testid="bf-sim-status">{status === 'running' ? 'Processing...' : status === 'success' ? 'Complete' : 'Failed'}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className={status === 'error' ? "bg-red-900/20" : ""} indicatorClassName={status === 'success' ? "bg-emerald-500" : status === 'error' ? "bg-red-500" : "bg-indigo-500"} />
                    </div>

                    {/* Logs */}
                    <div className="bg-slate-950 rounded border border-slate-800 p-3 h-32 overflow-y-auto text-xs font-mono text-slate-400">
                        {logs.map((log, i) => (
                            <div key={i} className="mb-1 border-b border-slate-900/50 pb-1 last:border-0">
                                <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    {status === 'running' ? (
                        <Button variant="ghost" onClick={onCancel} className="text-slate-400 hover:text-white">Run in Background</Button>
                    ) : (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="ghost" onClick={onClose} data-testid="bf-sim-close">Close</Button>
                            {status === 'success' && (
                                <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700" data-testid="bf-sim-view">
                                    <BarChart2 className="w-4 h-4 mr-2" /> View Results
                                </Button>
                            )}
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SimulationRunDialog;