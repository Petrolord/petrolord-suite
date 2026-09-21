import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, FileSpreadsheet, FileCode } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FDPExportService } from '@/services/fdp/FDPExportService';
import { useToast } from '@/components/ui/use-toast';

const ExportOption = ({ title, icon: Icon, description, onClick, loading }) => (
    <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 cursor-pointer transition-all hover:bg-slate-800/80" onClick={onClick}>
        <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="p-4 rounded-full bg-slate-900 mb-4">
                {loading ? <div className="animate-spin w-6 h-6 border-2 border-slate-500 border-t-white rounded-full" /> : <Icon className="w-6 h-6 text-blue-400" />}
            </div>
            <h3 className="font-bold text-white mb-1">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
        </CardContent>
    </Card>
);

const FDPExport = ({ state }) => {
    const { toast } = useToast();
    const [generating, setGenerating] = useState(false);

    const handlePDFExport = async () => {
        setGenerating(true);
        try {
            const doc = await FDPExportService.generatePDF(state, { version: '1.0' });
            doc.save(`FDP_${state.fieldData?.fieldName || 'Project'}.pdf`);
            toast({ title: "Export Complete", description: "FDP PDF document downloaded successfully." });
        } catch (e) {
            console.error(e);
            toast({ title: "Export Failed", description: "Could not generate PDF.", variant: "destructive" });
        } finally {
            setGenerating(false);
        }
    };

    // EC6-0: the Excel and JSON tiles used to toast "(Simulation)" and then
    // "file downloaded" with no file. Both write a real file now.
    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const baseName = `FDP_${(state.fieldData?.fieldName || 'Project').replace(/[^A-Za-z0-9_-]+/g, '_')}`;

    const handleJSONExport = () => {
        try {
            downloadBlob(
                new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
                `${baseName}.json`,
            );
            toast({ title: 'JSON exported', description: 'The plan as it stands, exactly as the studio holds it.' });
        } catch (e) {
            console.error(e);
            toast({ title: 'Export failed', description: 'Could not write the JSON file.', variant: 'destructive' });
        }
    };

    const handleExcelExport = () => {
        try {
            const wb = XLSX.utils.book_new();
            const sheets = [
                ['Reserves', state.subsurface?.reserves?.breakdown || []],
                ['Wells', state.wells?.list || []],
                ['Facilities', state.facilities?.list || []],
                ['Concepts', state.concepts?.list || []],
                ['Scenarios', state.scenarios?.list || []],
                ['Costs', state.costs?.items || []],
                ['Schedule', state.schedule?.activities || []],
                ['Risks', state.risks || []],
            ];
            let written = 0;
            sheets.forEach(([name, rows]) => {
                if (!rows.length) return;
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
                written += 1;
            });
            if (written === 0) {
                toast({
                    title: 'Nothing to export yet',
                    description: 'The plan has no rows in any table.',
                    variant: 'destructive',
                });
                return;
            }
            XLSX.writeFile(wb, `${baseName}.xlsx`);
            toast({ title: 'Excel exported', description: `${written} sheet${written === 1 ? '' : 's'} of the plan's own rows.` });
        } catch (e) {
            console.error(e);
            toast({ title: 'Export failed', description: 'Could not write the workbook.', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <ExportOption 
                    title="Full PDF Report" 
                    icon={FileText} 
                    description="Complete FDP document with all sections and tables."
                    onClick={handlePDFExport}
                    loading={generating}
                />
                {/* EC6-0: the Executive Summary tile called the full PDF export
                    and was labelled a five page summary. It is gone; one PDF, one
                    description of what it is. */}
                <ExportOption 
                    title="Excel Data Pack" 
                    icon={FileSpreadsheet} 
                    description="One sheet per table: reserves, wells, facilities, costs, schedule, risks."
                    onClick={handleExcelExport}
                />
                <ExportOption 
                    title="JSON Data Model" 
                    icon={FileCode} 
                    description="Machine-readable export for system integration."
                    onClick={handleJSONExport}
                />
            </div>

            {/* EC6-0: "Share Live Link" offered a Generate Link button with no
                handler behind it. There is no sharing in this studio; exporting a
                file and sending it is the whole story. */}
            <p className="text-xs text-slate-500">
                Exports are written in your browser from the plan in front of you. Nothing is
                uploaded, and there is no share link.
            </p>
        </div>
    );
};

export default FDPExport;