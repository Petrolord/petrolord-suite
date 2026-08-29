import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Layers, FileCheck, ListTodo, CheckCircle } from 'lucide-react';

const VelocityIntegrationPanel = ({ project, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSaveModel = async () => {
    setLoading(true);
    const { error } = await supabase.from('pm_deliverables').insert({
        project_id: project.id,
        name: `Velocity Model - Phase 1`,
        app_source: 'Velocity Model',
        status: 'Draft',
        version: 'v2.3'
    });
    setLoading(false);
    if(!error) {
        toast({ title: 'Model Saved', description: 'Velocity model linked as project deliverable.' });
        onRefresh();
    }
  };

  const handleCreateQCTask = async () => {
      setLoading(true);
      const tasks = [
          { project_id: project.id, name: 'QC Velocity Model', owner: 'Geophysicist', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() },
          { project_id: project.id, name: 'Integrate Velocity into Seismic', owner: 'Geophysicist', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() }
      ];
      const { error } = await supabase.from('tasks').insert(tasks);
      setLoading(false);
      if(!error) {
          toast({ title: 'Tasks Created', description: 'QC and Integration tasks added.' });
          onRefresh();
      }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-white">
                        <Layers className="w-5 h-5 text-emerald-400" />
                        Velocity Model Builder
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Add depth-conversion planning items to this project. There is no live link to the app yet, so nothing is read from it.
                    </CardDescription>
                </div>
                <Badge variant="outline" className="text-slate-400 border-slate-700">
                    Planning aid
                </Badge>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/50 rounded border border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                        <FileCheck className="w-4 h-4 text-emerald-400" /> Depth Conversion
                    </div>
                    <p className="text-xs text-slate-500">Save approved model as gate deliverable.</p>
                    <Button size="sm" variant="secondary" onClick={handleSaveModel} disabled={loading} className="w-full mt-auto">
                        Save Model as Deliverable
                    </Button>
                </div>

                 <div className="p-3 bg-slate-800/50 rounded border border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                        <ListTodo className="w-4 h-4 text-emerald-400" /> Task Management
                    </div>
                    <p className="text-xs text-slate-500">Automate QC and integration workflows.</p>
                    <Button size="sm" variant="secondary" onClick={handleCreateQCTask} disabled={loading} className="w-full mt-auto">
                        Generate QC Tasks
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default VelocityIntegrationPanel;