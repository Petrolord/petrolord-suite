import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Table, FileJson } from 'lucide-react';
import { ExportEngine } from '../../services/ExportEngine';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useMultiWell } from '../../contexts/MultiWellContext';
import { basinReportPdf } from '../../services/report';
import { modelNotes, chartAgeFlags } from '../../services/honesty';
import { resultState } from './RunNotes';
import { useToast } from '@/components/ui/use-toast';

const ExportDialog = ({ isOpen, onClose }) => {
    const { state, dispatch, units } = useBasinFlow();
    const { state: mw } = useMultiWell();
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const [options, setOptions] = useState({
        pdf: true,
        csv: false,
        json: false,
    });
    const report = state.settings?.report || {};
    const setReport = (patch) => dispatch({ type: 'UPDATE_SETTINGS', payload: { report: { ...report, ...patch } } });
    // BF-U1-016: the model's own name (the PDF printed "Untitled Basin Model" for every model)
    const modelName = mw.wellDataMap?.[mw.activeWellId]?.name || state.name || state.project?.name || '';

    const handleExport = async () => {
        setIsExporting(true);
        try {
            if (options.csv) {
                if (!state.results) throw new Error('Run the model before exporting the results CSV.');
                ExportEngine.generateCSV(state.results, units);
            }
            
            if (options.json) {
                ExportEngine.generateJSON({ ...state, name: modelName });
            }

            if (options.pdf) {
                const [{ jsPDF }, { loadPetrolordLogo }] = await Promise.all([import('jspdf'), import('@/lib/pdfBrand')]);
                const logo = await loadPetrolordLogo().catch(() => null);
                const stale = resultState(state.results, state, mw.activeWellId);
                const notes = modelNotes(state, { chartFlags: chartAgeFlags(state) });
                const doc = basinReportPdf(jsPDF, { modelName, state, results: state.results, units, report, notes, stale }, { logo });
                doc.save(`basin-model-${(modelName || 'model').replace(/[^\w.-]+/g, '_')}.pdf`);
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
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Export Results</DialogTitle>
                    <DialogDescription className="text-pl-muted">
                        Choose formats and contents for your data export.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-between p-3 border border-pl-border rounded bg-pl-surface cursor-pointer hover:border-pl-primary/50 transition-colors" onClick={() => setOptions(o => ({...o, pdf: !o.pdf}))}>
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-pl-muted" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">PDF Report</span>
                                <span className="text-xs text-pl-muted">Reviewer report: inputs, present day, calibration</span>
                            </div>
                        </div>
                        <Checkbox checked={options.pdf} onCheckedChange={(c) => setOptions(o => ({...o, pdf: c}))} />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-pl-border rounded bg-pl-surface cursor-pointer hover:border-pl-primary/50 transition-colors" onClick={() => setOptions(o => ({...o, csv: !o.csv}))}>
                        <div className="flex items-center gap-3">
                            <Table className="w-5 h-5 text-pl-muted" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">CSV Data</span>
                                <span className="text-xs text-pl-muted">Raw simulation time-steps</span>
                            </div>
                        </div>
                        <Checkbox checked={options.csv} onCheckedChange={(c) => setOptions(o => ({...o, csv: c}))} />
                    </div>

                    <div className="flex items-center justify-between p-3 border border-pl-border rounded bg-pl-surface cursor-pointer hover:border-pl-primary/50 transition-colors" onClick={() => setOptions(o => ({...o, json: !o.json}))}>
                        <div className="flex items-center gap-3">
                            <FileJson className="w-5 h-5 text-pl-muted" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium">JSON Project</span>
                                <span className="text-xs text-pl-muted">Full project state backup</span>
                            </div>
                        </div>
                        <Checkbox checked={options.json} onCheckedChange={(c) => setOptions(o => ({...o, json: c}))} />
                    </div>
                    
                    {options.pdf && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-pl-border">
                            <label className="text-xs text-pl-muted">Field
                                <input className="mt-1 h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text" data-testid="bf-report-field" value={report.field || ''} onChange={(e) => setReport({ field: e.target.value })} />
                            </label>
                            <label className="text-xs text-pl-muted">Analyst
                                <input className="mt-1 h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text" data-testid="bf-report-analyst" value={report.analyst || ''} onChange={(e) => setReport({ analyst: e.target.value })} />
                            </label>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleExport} disabled={isExporting}>
                        {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ExportDialog;