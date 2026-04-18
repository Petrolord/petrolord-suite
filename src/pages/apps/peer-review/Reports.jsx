import React, { useState } from 'react';
import { PeerReviewShell } from './components/PeerReviewShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, PieChart, BarChart2, Activity, ShieldAlert, ListChecks, ArrowRight, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ReportDetailModal } from './components/ReportDetailModal';
import { exportToCSV } from './utils/exportToCSV';
import { getMockReportData } from './data/mockReportsData';

const Reports = () => {
  const { toast } = useToast();
  
  const [modalState, setModalState] = useState({
    isOpen: false,
    report: null,
    data: [],
    isLoading: false
  });

  const reports = [
    { id: 1, title: "Comments by Status", desc: "Breakdown of Open vs Closed vs Responded comments across all active reviews.", icon: PieChart },
    { id: 2, title: "Comments by Severity", desc: "Distribution of Critical, Major, and Minor comments to identify systemic risks.", icon: ShieldAlert },
    { id: 3, title: "Comments by Discipline", desc: "Volume of feedback categorized by engineering or commercial discipline.", icon: BarChart2 },
    { id: 4, title: "Review Cycle Duration", desc: "Analysis of average time spent in Draft, Review, and Verification stages.", icon: Activity },
    { id: 5, title: "Reviews by Project", desc: "List of all reviews grouped by target Project or Asset.", icon: ListChecks },
    { id: 6, title: "Reviews by Stage", desc: "Current snapshot of the pipeline distribution of all reviews.", icon: PieChart },
    { id: 7, title: "Reviewer Workload", desc: "Current and forecasted task assignment volumes per Technical Authority.", icon: BarChart2 },
    { id: 8, title: "Overdue Reviews", desc: "Exception report highlighting reviews past their target completion dates.", icon: ShieldAlert },
    { id: 9, title: "Overdue Verifications", desc: "List of resolved comments waiting for reviewer sign-off past SLA.", icon: Activity },
    { id: 10, title: "Close-out Performance", desc: "KPIs on how quickly comments are addressed by authors after issuance.", icon: BarChart2 },
    { id: 11, title: "Critical Trends", desc: "Historical trend analysis of 'Critical' showstopper findings over time.", icon: Activity },
    { id: 12, title: "Full System Audit", desc: "Complete FDA CFR 21 Part 11 compliant extract of all system actions.", icon: ListChecks }
  ];

  const handleViewReport = (report) => {
    setModalState({ isOpen: true, report, data: [], isLoading: true });
    
    // Simulate API fetch delay
    setTimeout(() => {
      try {
        const data = getMockReportData(report.id);
        setModalState({ isOpen: true, report, data, isLoading: false });
      } catch (err) {
        setModalState({ isOpen: true, report, data: [], isLoading: false });
        toast({ title: "Error loading report", description: "Failed to fetch report data.", variant: "destructive" });
      }
    }, 600);
  };

  const handleExportCSV = (e, report) => {
    e.stopPropagation(); // Prevent card click
    toast({ description: "Preparing export..." });
    
    setTimeout(() => {
      const data = getMockReportData(report.id);
      exportToCSV(report.title, data);
    }, 300);
  };

  const handlePrintAll = () => {
    toast({ description: "🚧 Full dashboard print formatting is being prepared." });
  };

  return (
    <PeerReviewShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[hsl(var(--border))] pb-4 gap-4">
           <div>
             <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Reporting & Analytics</h2>
             <p className="text-[hsl(var(--muted-foreground))] mt-1">Exportable metrics, decision quality KPIs, and compliance reports.</p>
           </div>
           <div className="flex gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="w-[180px] bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                  <SelectValue placeholder="Timeframe" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="q3">Q3 2026</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={handlePrintAll}>
                 <Printer className="w-4 h-4" />
              </Button>
           </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {reports.map((r) => (
            <Card 
              key={r.id} 
              className="bg-panel hover:border-[hsl(var(--primary))] transition-all duration-200 group flex flex-col h-full cursor-pointer hover:shadow-md" 
              onClick={() => handleViewReport(r)}
            >
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 rounded-lg">
                    <r.icon className="w-5 h-5 text-[hsl(var(--primary))]"/>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
                      <ArrowRight className="w-4 h-4 text-[hsl(var(--primary))]"/>
                  </div>
                </div>
                <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-1.5">{r.title}</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed flex-grow">{r.desc}</p>
                <div className="mt-4 pt-3 border-t border-[hsl(var(--border))] flex justify-between gap-2">
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-xs text-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))] w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleViewReport(r); }}
                   >
                     View Report
                   </Button>
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-xs text-[hsl(var(--primary))] hover:text-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary))]/10 w-full bg-[hsl(var(--primary))]/5 border border-transparent transition-colors"
                    onClick={(e) => handleExportCSV(e, r)}
                   >
                     <Download className="w-3 h-3 mr-1.5"/> CSV
                   </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <ReportDetailModal 
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        reportType={modalState.report?.id}
        reportTitle={modalState.report?.title}
        reportIcon={modalState.report?.icon}
        data={modalState.data}
        isLoading={modalState.isLoading}
        onExport={exportToCSV}
      />
    </PeerReviewShell>
  );
};

export default Reports;