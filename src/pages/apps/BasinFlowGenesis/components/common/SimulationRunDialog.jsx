import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertTriangle, BarChart2 } from 'lucide-react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';

const SimulationRunDialog = ({ isOpen, onClose, onComplete, onCancel }) => {
    const { state, runSimulation, cancelSimulation } = useBasinFlow();
    const [status, setStatus] = useState('idle'); // idle, running, success, error, cancelled
    const [localProgress, setProgress] = useState(0);
    // BF-U2-009: the engine reports its progress (it runs in a worker)
    const progress = status === 'running' ? Math.max(localProgress, state.progress || 0) : localProgress;
    const [logs, setLogs] = useState([]);

    const addLog = (msg) => setLogs(prev => [...prev, msg]);

    // BF1: every open is a fresh run. The dialog used to start only from
    // 'idle', so after the first success a second Simulate showed the
    // stale "Complete" and never recomputed the edited model.
    useEffect(() => {
        if (isOpen) startSimulation();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const startSimulation = async () => {
        setStatus('running');
        setProgress(0);
        setLogs(['Initializing simulation engine...', 'Validating input parameters...']);

        try {
            // BF0: the run is the only wait; the staged delays that used
            // to pad this dialog were theatre
            addLog('Decompacting, solving heat, kinetics and pressure...');
            const res = await runSimulation();
            addLog(res?.meta?.ranIn === 'worker' ? 'Ran in the background worker.' : 'Ran on the page (no background worker here).');
            setProgress(100);
            setStatus('success');
            if(onComplete) onComplete();

        } catch (error) {
            if (error?.cancelled) {
                setStatus('cancelled');
                addLog('Cancelled. The previous result, if any, is kept.');
                return;
            }
            console.error(error);
            setStatus('error');
            addLog(`Error: ${error.message}`);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => { if(status !== 'running') onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Basin Simulation</DialogTitle>
                    <DialogDescription className="text-pl-muted">
                        Running 1D burial, thermal, and maturity history models.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    {/* Status Icon */}
                    <div className="flex justify-center">
                        {status === 'running' && (
                            <div className="relative">
                                <Loader2 className="w-12 h-12 text-pl-primary-text animate-spin relative z-10" />
                            </div>
                        )}
                        {status === 'success' && (
                            <div className="p-4 bg-pl-success-bg rounded-full border border-pl-success/40 animate-in zoom-in">
                                <CheckCircle2 className="w-12 h-12 text-pl-success-text" />
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="p-4 bg-pl-danger-bg rounded-full border border-pl-danger/40 animate-in zoom-in">
                                <AlertTriangle className="w-12 h-12 text-pl-danger-text" />
                            </div>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-pl-muted">
                            <span data-testid="bf-sim-status">{status === 'running' ? 'Processing...' : status === 'success' ? 'Complete' : status === 'cancelled' ? 'Cancelled' : 'Failed'}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className={status === 'error' ? "bg-pl-danger-bg" : ""} indicatorClassName={status === 'success' ? "bg-pl-success" : status === 'error' ? "bg-pl-danger" : "bg-pl-primary"} />
                    </div>

                    {/* Logs */}
                    <div className="bg-pl-bg rounded border border-pl-border p-3 h-32 overflow-y-auto text-xs font-mono text-pl-muted">
                        {logs.map((log, i) => (
                            <div key={i} className="mb-1 border-b border-pl-border pb-1 last:border-0">
                                <span className="text-pl-muted mr-2">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    {status === 'running' ? (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="ghost" onClick={onCancel} className="text-pl-muted hover:text-pl-text" data-testid="bf-sim-background">Keep working</Button>
                            <Button variant="outline" onClick={() => cancelSimulation && cancelSimulation()} data-testid="bf-sim-cancel">Cancel run</Button>
                        </div>
                    ) : (
                        <div className="flex gap-2 w-full justify-end">
                            <Button variant="ghost" onClick={onClose} data-testid="bf-sim-close">Close</Button>
                            {status === 'success' && (
                                <Button onClick={onClose} data-testid="bf-sim-view">
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