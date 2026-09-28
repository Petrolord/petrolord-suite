import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

const WeeklyReportPreview = ({ project, latestUpdate, tasks, kpis }) => {
  if (!project) return <div className="text-pl-muted text-center p-8">No project selected.</div>;

  const upcomingTasks = tasks
    .filter(t => t.status !== 'Done' && t.type === 'task')
    .sort((a, b) => new Date(a.planned_end_date) - new Date(b.planned_end_date))
    .slice(0, 5);

  const milestones = tasks
    .filter(t => t.type === 'milestone')
    .sort((a, b) => new Date(a.planned_end_date) - new Date(b.planned_end_date));

  const handlePrint = () => {
      window.print();
  };

  // The report is a printable white page in both themes, so it sits in a
  // data-canvas="chart" region (light roles, white paper).
  return (
    <div data-canvas="chart" className="max-w-4xl mx-auto bg-white text-black p-4 sm:p-8 rounded-lg shadow-xl my-6 print:my-0 print:shadow-none print:w-full print:max-w-none">
      {/* Report Header */}
      <div className="flex flex-wrap gap-4 justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">{project.company_name || 'Petrolord'}</h1>
            <h2 className="text-xl text-slate-700 mt-1">Project Weekly Status Report</h2>
        </div>
        <div className="text-right">
            <div className="text-sm text-slate-500">Report Date</div>
            <div className="font-bold">{latestUpdate ? format(new Date(latestUpdate.report_date), 'MMMM dd, yyyy') : format(new Date(), 'MMMM dd, yyyy')}</div>
            <Badge className={`mt-2 ${
                (latestUpdate?.status || 'Green') === 'Green' ? 'bg-green-600' :
                (latestUpdate?.status || 'Green') === 'Amber' ? 'bg-amber-500' : 'bg-red-600'
            }`}>
                Status: {latestUpdate?.status || 'Green'}
            </Badge>
        </div>
      </div>

      {/* Project Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-8">
        <div>
            <span className="block text-xs font-bold uppercase text-slate-500">Project Name</span>
            <span className="text-lg font-semibold">{project.name}</span>
        </div>
        <div>
            <span className="block text-xs font-bold uppercase text-slate-500">Project Manager</span>
            <span className="text-lg font-semibold">{project.owner_name || 'Unassigned'}</span>
        </div>
        <div>
            <span className="block text-xs font-bold uppercase text-slate-500">Phase / Stage</span>
            <span className="text-lg">{project.stage}</span>
        </div>
        <div>
            <span className="block text-xs font-bold uppercase text-slate-500">Percent Complete</span>
            <span className="text-lg">{latestUpdate?.percent_complete || kpis?.percentComplete || '0%'}</span>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="mb-8 bg-slate-50 p-4 rounded border border-slate-200">
        <h3 className="text-sm font-bold uppercase text-slate-600 mb-2">Executive Summary</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {latestUpdate?.narrative || "No update narrative provided for this reporting period."}
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-8">
        <h3 className="text-sm font-bold uppercase text-slate-600 mb-4">Key Performance Indicators</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
             <div className="p-3 bg-slate-100 rounded text-center">
                <div className="text-xs text-slate-500">Schedule Variance</div>
                <div className="font-bold text-slate-800">{kpis?.sv || '$0'}</div>
             </div>
             <div className="p-3 bg-slate-100 rounded text-center">
                <div className="text-xs text-slate-500">Cost Variance</div>
                <div className="font-bold text-slate-800">{kpis?.cv || '$0'}</div>
             </div>
             <div className="p-3 bg-slate-100 rounded text-center">
                <div className="text-xs text-slate-500">SPI</div>
                <div className="font-bold text-slate-800">{kpis?.spi || '1.0'}</div>
             </div>
             <div className="p-3 bg-slate-100 rounded text-center">
                <div className="text-xs text-slate-500">CPI</div>
                <div className="font-bold text-slate-800">{kpis?.cpi || '1.0'}</div>
             </div>
        </div>
      </div>

      {/* Issues & Decisions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
        <div>
            <h3 className="text-sm font-bold uppercase text-red-600 mb-2 border-b border-red-200 pb-1">Blockers / Issues</h3>
             <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {latestUpdate?.blockers || "No critical blockers reported."}
            </p>
        </div>
        <div>
            <h3 className="text-sm font-bold uppercase text-blue-600 mb-2 border-b border-blue-200 pb-1">Key Decisions Required</h3>
             <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {latestUpdate?.decisions_needed || "No pending decisions."}
            </p>
        </div>
      </div>

      {/* Upcoming Tasks */}
      <div className="mb-8">
         <h3 className="text-sm font-bold uppercase text-slate-600 mb-2">Upcoming Deliverables (Next 5 Tasks)</h3>
         <Table className="border border-slate-200">
            <TableHeader className="bg-slate-100">
                <TableRow>
                    <TableHead className="text-slate-700 h-8">Task Name</TableHead>
                    <TableHead className="text-slate-700 h-8">Due Date</TableHead>
                    <TableHead className="text-slate-700 h-8">Owner</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {upcomingTasks.length > 0 ? upcomingTasks.map(task => (
                    <TableRow key={task.id} className="border-b border-slate-100">
                        <TableCell className="py-2">{task.name}</TableCell>
                        <TableCell className="py-2">{format(new Date(task.planned_end_date), 'MMM dd')}</TableCell>
                        <TableCell className="py-2">{task.owner || '-'}</TableCell>
                    </TableRow>
                )) : (
                    <TableRow><TableCell colSpan="3" className="text-center py-4 text-slate-400">No upcoming tasks.</TableCell></TableRow>
                )}
            </TableBody>
         </Table>
      </div>

      {/* Milestone Tracker */}
       <div>
         <h3 className="text-sm font-bold uppercase text-slate-600 mb-2">Key Milestones</h3>
         <Table className="border border-slate-200">
            <TableHeader className="bg-slate-100">
                <TableRow>
                    <TableHead className="text-slate-700 h-8">Milestone</TableHead>
                    <TableHead className="text-slate-700 h-8">Planned Date</TableHead>
                    <TableHead className="text-slate-700 h-8">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {milestones.length > 0 ? milestones.map(ms => (
                    <TableRow key={ms.id} className="border-b border-slate-100">
                        <TableCell className="py-2 font-medium">{ms.name}</TableCell>
                        <TableCell className="py-2">{format(new Date(ms.planned_end_date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className="py-2">
                            <Badge variant="outline" className={
                                ms.percent_complete === 100 ? "text-green-600 border-green-200 bg-green-50" :
                                new Date(ms.planned_end_date) < new Date() ? "text-red-600 border-red-200 bg-red-50" : 
                                "text-slate-500 border-slate-200"
                            }>
                                {ms.percent_complete === 100 ? 'Completed' : new Date(ms.planned_end_date) < new Date() ? 'Overdue' : 'Pending'}
                            </Badge>
                        </TableCell>
                    </TableRow>
                )) : (
                    <TableRow><TableCell colSpan="3" className="text-center py-4 text-slate-400">No milestones defined.</TableCell></TableRow>
                )}
            </TableBody>
         </Table>
      </div>
      
      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap gap-2 justify-between items-center print:hidden">
         <p className="text-xs text-slate-400">Generated by Petrolord Project Management Pro</p>
         <Button onClick={handlePrint} className="bg-slate-900 text-white hover:bg-slate-800">
            <Printer className="w-4 h-4 mr-2" />
            Print / Save as PDF
         </Button>
      </div>
    </div>
  );
};

export default WeeklyReportPreview;