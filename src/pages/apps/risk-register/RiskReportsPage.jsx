import React, { useState } from 'react';
import { useRiskReporting } from './contexts/RiskReportingContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PieChart, BarChart2, FileText, Download, Play, Edit, Trash2, Clock, Copy, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const RiskReportsPage = () => {
  const { TEMPLATES, savedReports, reportHistory, openReportViewer, openReportBuilder, deleteReport, duplicateReport, loading } = useRiskReporting();
  const { toast } = useToast();
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);

  const confirmDelete = (id) => {
    setReportToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (reportToDelete) {
      await deleteReport(reportToDelete);
    }
    setDeleteConfirmOpen(false);
  };

  const handleMockAction = (action) => {
    toast({ title: `${action} Initialized`, description: "Action recorded in audit log." });
  };

  // Map icon strings to actual components
  const iconMap = {
    PieChart, BarChart2, FileText, ShieldAlert: FileText, List: FileText, CheckCircle: FileText, DollarSign: FileText, AlertOctagon: FileText, Truck: FileText, ClipboardList: FileText, Users: FileText, Target: FileText
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-full overflow-y-auto space-y-6 animate-in fade-in duration-300">
      
      <div className="flex justify-between items-center">
          <div>
              <h2 className="text-2xl font-bold text-white mb-1">Risk Analytics & Reports</h2>
              <p className="text-slate-400 text-sm">Generate, customize, and manage your risk intelligence exports.</p>
          </div>
          <Button onClick={() => openReportBuilder()} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              <Plus className="w-4 h-4 mr-2"/> Custom Report Builder
          </Button>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 p-1 mb-6">
          <TabsTrigger value="templates" className="data-[state=active]:bg-slate-800 data-[state=active]:text-cyan-400">Standard Templates</TabsTrigger>
          <TabsTrigger value="saved" className="data-[state=active]:bg-slate-800 data-[state=active]:text-cyan-400">My Saved Reports <Badge variant="secondary" className="ml-2 bg-slate-800 text-xs">{savedReports.length}</Badge></TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-slate-800 data-[state=active]:text-cyan-400">Export History</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {TEMPLATES.map((tpl) => {
              const Icon = iconMap[tpl.icon] || FileText;
              return (
                <Card key={tpl.id} className="bg-slate-900 border-slate-800 hover:border-cyan-500/30 transition-colors group flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-slate-200 flex items-start gap-3">
                      <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-cyan-900/30 group-hover:text-cyan-400 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="mt-1">{tpl.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between">
                    <p className="text-sm text-slate-400 mb-6">{tpl.desc}</p>
                    <div className="flex gap-2 w-full">
                      <Button variant="secondary" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white h-8 text-xs" onClick={() => openReportViewer(tpl.config)}>
                        <Play className="w-3 h-3 mr-1" /> Generate
                      </Button>
                      <Button variant="outline" className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-8 text-xs" onClick={() => openReportBuilder(tpl.config)}>
                        <Edit className="w-3 h-3 mr-1" /> Customize
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="saved" className="m-0">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-0">
              {savedReports.length === 0 ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center">
                  <FileText className="w-12 h-12 mb-4 opacity-20" />
                  <p>No saved reports found.</p>
                  <Button variant="link" className="text-cyan-400 mt-2" onClick={() => openReportBuilder()}>Create your first custom report</Button>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {savedReports.map(report => (
                    <div key={report.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-slate-800/30 transition-colors gap-4">
                      <div>
                        <h4 className="font-medium text-slate-200">{report.name}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span>{new Date(report.created_at).toLocaleDateString()}</span>
                          <Badge variant="outline" className="bg-slate-950 border-slate-700 text-[10px]">{report.type}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 border-cyan-900 text-cyan-400 hover:bg-cyan-900/30" onClick={() => openReportViewer(report.config)}>Open</Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400" onClick={() => openReportBuilder(report.config)} title="Edit"><Edit className="w-4 h-4"/></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400" onClick={() => duplicateReport(report)} title="Duplicate"><Copy className="w-4 h-4"/></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-amber-400" onClick={() => handleMockAction('Schedule')} title="Schedule"><Clock className="w-4 h-4"/></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-400" onClick={() => confirmDelete(report.id)} title="Delete"><Trash2 className="w-4 h-4"/></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="m-0">
           <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-0">
              {reportHistory.length === 0 ? (
                <div className="text-center py-16 text-slate-500">No export history found.</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {reportHistory.map(hist => (
                    <div key={hist.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-slate-950 rounded border border-slate-800">
                          <Download className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-200">{hist.name}</h4>
                          <p className="text-xs text-slate-500">{new Date(hist.date).toLocaleString()} • {hist.format}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={() => handleMockAction('Download Archive')}>
                        Download Again
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Report?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. This will permanently delete the report configuration from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleExecuteDelete}>Delete Report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default RiskReportsPage;