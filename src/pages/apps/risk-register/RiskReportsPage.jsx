import React, { useState } from 'react';
import { useRiskReporting } from './contexts/RiskReportingContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PieChart, BarChart2, FileText, Play, Edit, Trash2, Copy, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { reportConfigFromRow } from './utils/reportConfig';

const RiskReportsPage = () => {
  const { TEMPLATES, savedReports, openReportViewer, openReportBuilder, deleteReport, duplicateReport } = useRiskReporting();
  
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

  // AS13: Schedule and Download Again toasted "Action recorded in audit
  // log." and recorded nothing. There is no scheduler and no export
  // archive, so neither control is offered.

  // Map icon strings to actual components
  const iconMap = {
    PieChart, BarChart2, FileText, ShieldAlert: FileText, List: FileText, CheckCircle: FileText, DollarSign: FileText, AlertOctagon: FileText, Truck: FileText, ClipboardList: FileText, Users: FileText, Target: FileText
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-full overflow-y-auto space-y-6 animate-in fade-in duration-300">
      
      <div className="flex justify-between items-center">
          <div>
              <h2 className="text-2xl font-bold text-pl-text mb-1">Risk Analytics & Reports</h2>
              <p className="text-pl-muted text-sm">Generate, customize, and manage your risk intelligence exports.</p>
          </div>
          <Button onClick={() => openReportBuilder()}>
              <Plus className="w-4 h-4 mr-2"/> Custom Report Builder
          </Button>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="border border-pl-border p-1 mb-6">
          <TabsTrigger value="templates">Standard Templates</TabsTrigger>
          <TabsTrigger value="saved">My Saved Reports <Badge variant="secondary" className="ml-2 text-xs">{savedReports.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {TEMPLATES.map((tpl) => {
              const Icon = iconMap[tpl.icon] || FileText;
              return (
                <Card key={tpl.id} className="hover:border-pl-primary/40 transition-colors group flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-start gap-3">
                      <div className="p-2 bg-pl-sunken rounded-lg group-hover:bg-pl-primary/10 group-hover:text-pl-primary-text transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="mt-1">{tpl.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between">
                    <p className="text-sm text-pl-muted mb-6">{tpl.desc}</p>
                    <div className="flex gap-2 w-full">
                      <Button variant="secondary" className="flex-1 h-8 text-xs" onClick={() => openReportViewer(tpl.config)}>
                        <Play className="w-3 h-3 mr-1" /> Generate
                      </Button>
                      <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => openReportBuilder(tpl.config)}>
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
          <Card>
            <CardContent className="p-0">
              {savedReports.length === 0 ? (
                <div className="text-center py-16 text-pl-muted flex flex-col items-center">
                  <FileText className="w-12 h-12 mb-4 opacity-20" />
                  <p>No saved reports found.</p>
                  <Button variant="link" className="mt-2" onClick={() => openReportBuilder()}>Create your first custom report</Button>
                </div>
              ) : (
                <div className="divide-y divide-pl-border">
                  {savedReports.map(report => (
                    <div key={report.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-pl-sunken transition-colors gap-4">
                      <div>
                        <h4 className="font-medium text-pl-text">{report.name}</h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-pl-muted">
                          <span>{new Date(report.created_at).toLocaleDateString()}</span>
                          <Badge variant="outline" className="text-[10px]">{report.type}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openReportViewer(reportConfigFromRow(report))}>Open</Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-pl-muted" onClick={() => openReportBuilder(reportConfigFromRow(report))} title="Edit"><Edit className="w-4 h-4"/></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-pl-muted" onClick={() => duplicateReport(report)} title="Duplicate"><Copy className="w-4 h-4"/></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-pl-muted hover:text-pl-danger-text" onClick={() => confirmDelete(report.id)} title="Delete"><Trash2 className="w-4 h-4"/></Button>
                      </div>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Report?</AlertDialogTitle>
            <AlertDialogDescription className="text-pl-muted">
              This action cannot be undone. This will permanently delete the report configuration from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90" onClick={handleExecuteDelete}>Delete Report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default RiskReportsPage;