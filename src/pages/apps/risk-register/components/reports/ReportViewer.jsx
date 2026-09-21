import React, { useState } from 'react';
import { useRiskReporting } from '../../contexts/RiskReportingContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Edit2, Save, FileText, FileSpreadsheet, Printer, BarChart3, Table as TableIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { RiskScoreBadge, RiskStatusBadge } from '../RiskBadges';
import {
  DEFAULT_CHART_GROUP, columnLabel, countByGroup, groupedRows,
} from '../../utils/reportConfig';

const DEFAULT_COLUMNS = ['risk_id', 'title', 'category', 'risk_score', 'status'];

/**
 * AS13: the Chart view rendered "Chart visualization rendering engine
 * initialized." and nothing else, and Share and Schedule toasted "The
 * share dialog would open here." The chart is real now, on the white
 * Suite chart surface; Share and Schedule are gone, because there is no
 * link to share a report by and nothing to run a schedule.
 */
export const ReportViewer = () => {
  const { activeReport, closeReport, openReportBuilder, openReportViewer, getProcessedData, exportReport, saveReport } = useRiskReporting();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName, setReportName] = useState(activeReport?.name || 'New Report');
  const [viewMode, setViewMode] = useState('table'); // table or chart

  if (!activeReport) return null;

  const data = getProcessedData(activeReport);

  const cols = activeReport.columns && activeReport.columns.length ? activeReport.columns : DEFAULT_COLUMNS;
  const colDefs = cols.map(c => ({ key: c, label: columnLabel(c) }));
  const grouping = activeReport.grouping || null;
  const chartField = grouping || DEFAULT_CHART_GROUP;
  const chartData = countByGroup(data, chartField);

  const handleExport = (format) => {
    exportReport(data, colDefs, activeReport, format);
  };

  // Save As makes a new saved report. It carried the open report's id
  // before, so on a saved report it overwrote the original instead.
  const handleSaveAs = async () => {
    const saved = await saveReport({ ...activeReport, id: null, name: reportName });
    setSaveModalOpen(false);
    if (saved) openReportViewer(saved);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-4 rounded-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={closeReport} className="text-slate-400 hover:text-white px-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white">{activeReport.name}</h2>
            <p className="text-xs text-slate-400">
              {data.length} records{grouping ? `, grouped by ${columnLabel(grouping).toLowerCase()}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-950 p-1 rounded-md border border-slate-800 mr-2">
            <Button variant="ghost" size="sm" className={`px-3 h-7 ${viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400'}`} onClick={() => setViewMode('table')}>
              <TableIcon className="w-4 h-4 mr-1" /> Table
            </Button>
            <Button variant="ghost" size="sm" className={`px-3 h-7 ${viewMode === 'chart' ? 'bg-slate-800 text-white' : 'text-slate-400'}`} onClick={() => setViewMode('chart')}>
              <BarChart3 className="w-4 h-4 mr-1" /> Chart
            </Button>
          </div>

          <Button variant="outline" size="sm" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10" onClick={() => openReportBuilder(activeReport)}>
            <Edit2 className="w-3 h-3 mr-2" /> Edit Config
          </Button>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => setSaveModalOpen(true)}>
            <Save className="w-3 h-3 mr-2" /> Save As
          </Button>

          <div className="flex gap-1 border-l border-slate-800 pl-2">
            <Button variant="ghost" size="icon" title="Export PDF" onClick={() => handleExport('pdf')} className="text-slate-400 hover:text-red-400"><FileText className="w-4 h-4"/></Button>
            <Button variant="ghost" size="icon" title="Export Excel" onClick={() => handleExport('excel')} className="text-slate-400 hover:text-green-400"><FileSpreadsheet className="w-4 h-4"/></Button>
            <Button variant="ghost" size="icon" title="Print" onClick={() => handleExport('print')} className="text-slate-400 hover:text-slate-200"><Printer className="w-4 h-4"/></Button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <Card className="bg-slate-900 border-slate-800 min-h-[500px]">
        {viewMode === 'table' ? (
          <div className="overflow-auto max-h-[600px]">
            <Table className="report-table">
              <TableHeader>
                <TableRow className="border-slate-800">
                  {colDefs.map(col => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols.length} className="h-32 text-center text-slate-500">No data matches the report criteria.</TableCell>
                  </TableRow>
                ) : (
                  groupedRows(data, grouping).map((entry, i) => (entry.heading !== undefined ? (
                    <TableRow key={`g-${entry.heading}`} className="border-slate-800 bg-slate-950/60">
                      <TableCell colSpan={cols.length} className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
                        {entry.heading} ({entry.count})
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={entry.row.id || i} className="border-slate-800 hover:bg-slate-800/30">
                      {colDefs.map(col => (
                        <TableCell key={col.key}>
                          {col.key === 'risk_score' || col.key === 'residual_score' ? <RiskScoreBadge score={entry.row[col.key]} /> :
                           col.key === 'status' ? <RiskStatusBadge status={entry.row[col.key]} /> :
                           entry.row[col.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  )))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-slate-400">
              Risks in this report by {columnLabel(chartField).toLowerCase()}
              {grouping ? '' : '. Set a grouping in Edit Config to count by another field'}.
            </p>
            {data.length === 0 ? (
              <p className="h-[400px] flex items-center justify-center text-slate-500">No data matches the report criteria.</p>
            ) : (
              <div className="relative h-[420px] rounded-lg p-2" style={{ backgroundColor: CHART_COLORS.background }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={CHART_MARGINS.standard}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="name" interval={0} stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                    <YAxis allowDecimals={false} stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART_COLORS.grid }} />
                    <Bar dataKey="count" name="Risks" fill="#0891b2" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Save Modal */}
      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Save as a new report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Report Name</Label>
              <Input value={reportName} onChange={e => setReportName(e.target.value)} className="bg-slate-950 border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveModalOpen(false)} className="border-slate-700">Cancel</Button>
            <Button onClick={handleSaveAs} className="bg-cyan-600 hover:bg-cyan-700 text-white">Save Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
