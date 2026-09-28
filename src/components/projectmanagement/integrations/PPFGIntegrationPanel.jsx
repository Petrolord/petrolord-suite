import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Activity, AlertTriangle, FileText, CheckCircle, RefreshCw, ArrowRight } from 'lucide-react';

const PPFGIntegrationPanel = ({ project, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const handleCreateDeliverable = async () => {
      setLoading(true);
      const { error } = await supabase.from('pm_deliverables').insert({
          project_id: project.id,
          name: `PPFG Prognosis Report - ${new Date().toISOString().split('T')[0]}`,
          app_source: 'PPFG',
          status: 'Draft',
          version: 'v1.0'
      });
      setLoading(false);
      if(!error) {
          toast({ title: 'Deliverable Created', description: 'Prognosis report added to deliverables.' });
          onRefresh();
      }
  };

  const handleCreateTasks = async () => {
      setLoading(true);
      const tasks = [
          { project_id: project.id, name: 'Calibrate Eaton Model', owner: 'Pore Pressure Specialist', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() },
          { project_id: project.id, name: 'Update Pre-drill Risk Chart', owner: 'Drilling Engineer', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() }
      ];
      const { error } = await supabase.from('tasks').insert(tasks);
      setLoading(false);
      if(!error) {
          toast({ title: 'Tasks Created', description: 'Two standard pore-pressure tasks added.' });
          onRefresh();
      }
  };

  return (
    <Card>
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-pl-text">
                        <Activity className="w-5 h-5 text-pl-primary-text" aria-hidden="true" />
                        Pore Pressure (PPFG) Integration
                    </CardTitle>
                    <CardDescription className="text-pl-muted">
                        Add pore-pressure planning items to this project. There is no live link to the app yet, so nothing is read from it.
                    </CardDescription>
                </div>
                <Badge variant="neutral">
                    Planning aid
                </Badge>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                <div className="p-3 bg-pl-sunken rounded border border-pl-border flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-pl-text font-medium text-sm">
                        <FileText className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Deliverables
                    </div>
                    <p className="text-xs text-pl-muted">Create a draft prognosis deliverable to fill in and track.</p>
                    <Button size="sm" variant="secondary" onClick={handleCreateDeliverable} disabled={loading} className="w-full mt-auto">
                        Add draft deliverable
                    </Button>
                </div>

                 <div className="p-3 bg-pl-sunken rounded border border-pl-border flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-pl-text font-medium text-sm">
                        <RefreshCw className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Workflows
                    </div>
                    <p className="text-xs text-pl-muted">Add the standard calibration and update tasks.</p>
                    <Button size="sm" variant="secondary" onClick={handleCreateTasks} disabled={loading} className="w-full mt-auto">
                        Create Tasks
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default PPFGIntegrationPanel;