import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, FileText, Table } from 'lucide-react';
import { exportToPDF, exportDataAsCSV } from '@/utils/exportUtils';

const ExportControls = ({ data, columns, fileName, title }) => {
  if (!data || !data.length) return null;

  const handlePdfExport = () => {
    exportToPDF(title || 'Project Report', data, fileName || 'Project_Export');
  };

  const handleCsvExport = () => {
    const exportData = data.map(row => {
      const simplified = {};
      columns.forEach(col => {
        simplified[col.header] = row[col.accessor];
      });
      return simplified;
    });
    exportDataAsCSV(exportData, fileName || 'Project_Export');
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="bg-slate-900 border-slate-800 text-slate-300">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-300">
          <DropdownMenuItem onClick={handlePdfExport} className="cursor-pointer hover:bg-slate-800">
            <FileText className="w-4 h-4 mr-2" /> Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCsvExport} className="cursor-pointer hover:bg-slate-800">
            <Table className="w-4 h-4 mr-2" /> Export as CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// Senior test T1 (2026-09-27): the Report button on the field development,
// brownfield and decommissioning dashboards had no handler. It now exports
// the task register the stage table and earned value are measured from.
const TASK_COLUMNS = ['Task', 'Stage', 'Planned start', 'Planned end', 'Planned cost', 'Actual cost', 'Percent complete', 'Status'];
export const taskReportRows = (tasks = []) => tasks
  .filter((t) => !t.is_archived)
  .map((t) => ({
    Task: t.name,
    Stage: t.task_category || '',
    'Planned start': t.planned_start_date || '',
    'Planned end': t.planned_end_date || '',
    'Planned cost': t.planned_cost ?? '',
    'Actual cost': t.actual_cost ?? '',
    'Percent complete': t.percent_complete ?? '',
    Status: t.status || '',
  }));

export const TaskReportControls = ({ tasks, projectName }) => (
  <ExportControls
    data={taskReportRows(tasks)}
    columns={TASK_COLUMNS.map((c) => ({ header: c, accessor: c }))}
    fileName={`${(projectName || 'Project').replace(/[^\w-]+/g, '_')}_Tasks`}
    title={`${projectName || 'Project'}: task register`}
  />
);

export default ExportControls;