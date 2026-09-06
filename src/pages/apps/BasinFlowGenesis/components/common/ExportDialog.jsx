import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Table, FileJson } from 'lucide-react';
import { ExportEngine } from '../../services/ExportEngine';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useToast } from '@/components/ui/use-toast';

const ExportDialog = ({ isOpen, onClose, chartRefs = [] }) => {
    const { state, units } = useBasinFlow();
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const [options, setOptions] = useState({
        pdf: true,
        csv: false,
        json: false,
        includeCharts: true
    });

    const handleExport = async () => {
        setIsExporting(true);
        try {
            if (options.csv) {
                ExportEngine.generateCSV(state.results, units);
            }
            
            if (options.json) {
                ExportEngine.generateJSON(state);
            }

            if (options.pdf) {
                // Capture charts if provided and requested
                let charts = [];
                if (options.includeCharts && chartRefs.length > 0) {
                    // In a real implementation, we'd use html2canvas on the refs here
                    // For now, we pass empty or mock, as refs usually need to be DOM nodes passed from parent
                    // Assuming chartRefs contains objects with { title, dataUrl } if pre-captured, 
                    // or we can't easily capture from a dialog that might be covering them.
                    // Ideally, the parent passes pre-generated chart images or the engine handles logic.
                    // We'll assume chartRefs are prepared objects for this phase.
                    charts = chartRefs; 
                }
                
                await ExportEngine.generatePDF(state.project, state.results, charts);
            }

            toast({ title: "Export Complete", description: "Your files have been downloaded." });
            onClose();
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Export Failed", description: error.message });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
                <DialogHeader>
                    <DialogTitle>Export Results</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Choose formats and contents for your data export.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-between p-3 border border-slate-800 rounded bg-slate-950/50 cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => setOptions(o => ({...o, pdf: !o.pdf}))}>
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-red-400" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">PDF Report</span>
                                <span className="text-xs text-slate-500">Formatted report with plots</span>
                            </div>
                        </div>
                        <Checkbox checked={options.pdf} onCheckedChange={(c) => setOptions(o => ({...o, pdf: c}))} />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-slate-800 rounded bg-slate-950/50 cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => setOptions(o => ({...o, csv: !o.csv}))}>
                        <div className="flex items-center gap-3">
                            <Table className="w-5 h-5 text-green-400" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">CSV Data</span>
                                <span className="text-xs text-slate-500">Raw simulation time-steps</span>
                            </div>
                        </div>
                        <Checkbox checked={options.csv} onCheckedChange={(c) => setOptions(o => ({...o, csv: c}))} />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-slate-800 rounded bg-slate-950/50 cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => setOptions(o => ({...o, json: !o.json}))}>
                        <div className="flex items-center gap-3">
                            <FileJson className="w-5 h-5 text-yellow-400" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">JSON Project</span>
                                <span className="text-xs text-slate-500">Full project state backup</span>
                            </div>
                        </div>
                        <Checkbox checked={options.json} onCheckedChange={(c) => setOptions(o => ({...o, json: c}))} />
                    </div>
                    
                    {options.pdf && (
                        <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                            <Checkbox id="charts" checked={options.includeCharts} onCheckedChange={(c) => setOptions(o => ({...o, includeCharts: c}))} />
                            <Label htmlFor="charts" className="text-xs text-slate-400">Include Charts in PDF</Label>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleExport} disabled={isExporting} className="bg-indigo-600 hover:bg-indigo-700">
                        {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ExportDialog;