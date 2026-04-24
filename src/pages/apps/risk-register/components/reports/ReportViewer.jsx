import React, { useState } from 'react';
import { useRiskReporting } from '../../contexts/RiskReportingContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Edit2, Save, FileText, FileSpreadsheet, Printer, Share2, Clock, BarChart3, Table as TableIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RiskScoreBadge, RiskStatusBadge } from '../RiskBadges';
import { useToast } from '@/hooks/use-toast';

export const ReportViewer = () => {
  const { activeReport, closeReport, openReportBuilder, getProcessedData, exportReport, saveReport } = useRiskReporting();
  const { toast } = useToast();
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName, setReportName] = useState(activeReport?.name || 'New Report');
  const [viewMode, setViewMode] = useState('table'); // table or chart

  if (!activeReport) return null;

  const data = getProcessedData(activeReport);
  
  // Available columns from config, fallback to defaults
  const cols = activeReport.columns || ['risk_id', 'title', 'category', 'risk_score', 'status'];
  
  const colDefs = cols.map(c => ({
    key: c,
    label: c.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }));

  const handleExport = (format) => {
    exportReport(data, colDefs, activeReport, format);
  };

  const handleSaveAs = async () => {
    const newConfig = { ...activeReport, name: reportName };
    await saveReport(newConfig);
    setSaveModalOpen(false);
  };

  const handleAction = (action) => {
    toast({ title: `${action} Initialized`, description: `The ${action.toLowerCase()} dialog would open here.` });
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
            <p className="text-xs text-slate-400">{data.length} records generated</p>
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
            <Button variant="ghost" size="icon" title="Share" onClick={() => handleAction('Share')} className="text-slate-400 hover:text-indigo-400"><Share2 className="w-4 h-4"/></Button>
            <Button variant="ghost" size="icon" title="Schedule" onClick={() => handleAction('Schedule')} className="text-slate-400 hover:text-amber-400"><Clock className="w-4 h-4"/></Button>
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
                  data.map((row, i) => (
                    <TableRow key={i} className="border-slate-800 hover:bg-slate-800/30">
                      {colDefs.map(col => (
                        <TableCell key={col.key}>
                          {col.key === 'risk_score' ? <RiskScoreBadge score={row[col.key]} /> :
                           col.key === 'status' ? <RiskStatusBadge status={row[col.key]} /> :
                           row[col.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <CardContent className="flex items-center justify-center h-[500px] flex-col text-slate-500">
            <BarChart3 className="w-16 h-16 mb-4 opacity-20" />
            <p>Chart visualization rendering engine initialized.</p>
            <p className="text-sm mt-2 text-slate-600">Select aggregation metrics in Edit Config to generate charts.</p>
          </CardContent>
        )}
      </Card>

      {/* Save Modal */}
      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Save Report Configuration</DialogTitle>
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