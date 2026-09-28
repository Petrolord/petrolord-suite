import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/components/ui/use-toast';
import { FileText, Download, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const AdvancedReportBuilder = ({ open, onOpenChange, projects, risks = [], resources = [] }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [reportTitle, setReportTitle] = useState('Monthly Portfolio Report');
    const [sections, setSections] = useState({
        executiveSummary: true,
        projectDetails: true,
        financials: true,
        risks: true,
        resources: false
    });

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const doc = new jsPDF();
            const today = new Date().toLocaleDateString();
            let yPos = 20;

            // 1. Header
            doc.setFontSize(22);
            doc.setTextColor(40, 40, 40);
            doc.text(reportTitle, 14, yPos);
            yPos += 10;
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on: ${today}`, 14, yPos);
            yPos += 10;
            doc.setDrawColor(200, 200, 200);
            doc.line(14, yPos, 196, yPos);
            yPos += 15;

            // 2. Executive Summary
            if (sections.executiveSummary) {
                doc.setFontSize(16);
                doc.setTextColor(0, 0, 0);
                doc.text("Executive Summary", 14, yPos);
                yPos += 10;
                
                const totalBudget = projects.reduce((acc, p) => acc + (p.baseline_budget || 0), 0);
                const avgProgress = projects.length ? (projects.reduce((acc, p) => acc + (p.percent_complete || 0), 0) / projects.length).toFixed(1) : 0;
                
                const stats = [
                    ['Total Projects', projects.length],
                    ['Total Budget', `$${(totalBudget / 1000000).toFixed(2)}M`],
                    ['Avg Progress', `${avgProgress}%`],
                    ['Active Risks', risks.length]
                ];

                doc.autoTable({
                    startY: yPos,
                    head: [['Metric', 'Value']],
                    body: stats,
                    theme: 'plain',
                    styles: { fontSize: 12, cellPadding: 2 },
                    columnStyles: { 0: { fontStyle: 'bold' } }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            }

            // 3. Financials
            if (sections.financials) {
                doc.setFontSize(16);
                doc.text("Budget Overview", 14, yPos);
                yPos += 5;
                
                const finData = projects.map(p => [
                    p.name,
                    `$${((p.baseline_budget || 0)/1000000).toFixed(2)}M`,
                    // Assuming actuals would be available, mocking simpler view
                    p.status
                ]);

                doc.autoTable({
                    startY: yPos,
                    head: [['Project', 'Budget', 'Status']],
                    body: finData,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185] }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            }

            // 4. Risks
            if (sections.risks) {
                if (yPos > 250) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.text("Top Critical Risks", 14, yPos);
                yPos += 5;

                const riskData = risks
                    .filter(r => r.risk_score >= 10)
                    .sort((a,b) => b.risk_score - a.risk_score)
                    .slice(0, 10)
                    .map(r => [r.title, r.category, r.risk_score, r.mitigation_plan || 'None']);

                doc.autoTable({
                    startY: yPos,
                    head: [['Risk', 'Category', 'Score', 'Mitigation']],
                    body: riskData,
                    theme: 'grid',
                    headStyles: { fillColor: [192, 57, 43] }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            }

            // 5. Project Details
            if (sections.projectDetails) {
                if (yPos > 250) { doc.addPage(); yPos = 20; }
                doc.setFontSize(16);
                doc.text("Project Status Details", 14, yPos);
                yPos += 5;

                const detailData = projects.map(p => [
                    p.name,
                    p.project_type,
                    p.stage,
                    `${p.percent_complete}%`,
                    p.status
                ]);

                doc.autoTable({
                    startY: yPos,
                    head: [['Project', 'Type', 'Stage', 'Progress', 'Health']],
                    body: detailData,
                    theme: 'striped',
                    headStyles: { fillColor: [46, 204, 113] }
                });
            }

            doc.save(`${reportTitle.replace(/\s+/g, '_')}.pdf`);
            toast({ title: "Report Exported", description: "Your PDF has been generated successfully." });
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Export Failed", description: "Could not generate PDF." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Interim (rollout 6C): a dark island until this file moves to theme roles; remove data-pl-theme then. */}
            <DialogContent data-pl-theme="dark" className="bg-slate-900 border-slate-700 text-white sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-400" />
                        Report Builder
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">Select content to include in your PDF report.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Report Title</Label>
                        <Input 
                            value={reportTitle} 
                            onChange={(e) => setReportTitle(e.target.value)} 
                            className="bg-slate-800 border-slate-700"
                        />
                    </div>

                    <div className="space-y-3">
                        <Label>Sections</Label>
                        <div className="grid grid-cols-2 gap-4">
                            {Object.keys(sections).map(key => (
                                <div key={key} className="flex items-center space-x-2">
                                    <Checkbox 
                                        id={key} 
                                        checked={sections[key]} 
                                        onCheckedChange={(chk) => setSections(prev => ({ ...prev, [key]: chk }))} 
                                    />
                                    <Label htmlFor={key} className="font-normal capitalize cursor-pointer">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleGenerate} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                        Generate PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AdvancedReportBuilder;