import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Ruler, FileOutput, CheckSquare, CheckCircle } from 'lucide-react';

const GeomechIntegrationPanel = ({ project, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleUpdateGate = async () => {
    setLoading(true);
    const { error } = await supabase.from('pm_deliverables').insert({
        project_id: project.id,
        name: 'MEM Report',
        app_source: '1D Geomech',
        status: 'Draft',
        version: 'v1.0'
    });

    if(!error) {
        toast({ title: 'Deliverable added', description: 'Draft MEM report added; set its status when it is reviewed.' });
        onRefresh();
    }
    setLoading(false);
  };

  // Economics E4: this used to insert a task carrying a mud window of
  // "1.20 - 1.45 SG", a value that was written into the file rather than read
  // from anyone's geomechanical model. The task is still useful; the number
  // has to come from the engineer.
  const handlePushMudWindow = async () => {
      setLoading(true);
      const tasks = [
          { project_id: project.id, name: 'Set and implement the drilling mud window', owner: 'Drilling Engineer', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() }
      ];
      const { error } = await supabase.from('tasks').insert(tasks);
      setLoading(false);
      if(!error) {
          toast({ title: 'Drilling Task Added', description: 'Add the window from your MEM when it is agreed.' });
          onRefresh();
      }
  };

  return (
    <Card>
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-pl-text">
                        <Ruler className="w-5 h-5 text-pl-primary-text" aria-hidden="true" />
                        1D Geomechanics
                    </CardTitle>
                    <CardDescription className="text-pl-muted">
                        Add geomechanics planning items to this project. There is no live link to the app yet, so nothing is read from it.
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
                        <CheckSquare className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Gates
                    </div>
                    <p className="text-xs text-pl-muted">Mark "MEM Completed" gate as achieved.</p>
                    <Button size="sm" variant="secondary" onClick={handleUpdateGate} disabled={loading} className="w-full mt-auto">
                        Complete MEM Gate
                    </Button>
                </div>

                 <div className="p-3 bg-pl-sunken rounded border border-pl-border flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-pl-text font-medium text-sm">
                        <FileOutput className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Parameters
                    </div>
                    <p className="text-xs text-pl-muted">Push mud weight window to drilling plan.</p>
                    <Button size="sm" variant="secondary" onClick={handlePushMudWindow} disabled={loading} className="w-full mt-auto">
                        Push Mud Window
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default GeomechIntegrationPanel;