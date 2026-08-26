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
    // Simulate verifying MEM completion
    await new Promise(r => setTimeout(r, 500));

    const { error } = await supabase.from('pm_deliverables').insert({
        project_id: project.id,
        name: `MEM Report - Well X-1`,
        app_source: '1D Geomech',
        status: 'Approved',
        version: 'v1.0'
    });

    if(!error) {
        toast({ title: 'Gate Updated', description: 'MEM Completed requirement met.' });
        onRefresh();
    }
    setLoading(false);
  };

  const handlePushMudWindow = async () => {
      setLoading(true);
      // Simulate fetching window
      const safeWindow = "1.20 - 1.45 SG";
      
      const tasks = [
          { project_id: project.id, name: `Implement Mud Window: ${safeWindow}`, owner: 'Drilling Engineer', status: 'To Do', planned_start_date: new Date(), planned_end_date: new Date() }
      ];
      const { error } = await supabase.from('tasks').insert(tasks);
      setLoading(false);
      if(!error) {
          toast({ title: 'Drilling Task Added', description: `Mud window ${safeWindow} pushed to schedule.` });
          onRefresh();
      }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-white">
                        <Ruler className="w-5 h-5 text-orange-400" />
                        1D Geomechanics
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Sync geomechanical models (MEM) and drilling windows.
                    </CardDescription>
                </div>
                <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-800 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Connected
                </Badge>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/50 rounded border border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                        <CheckSquare className="w-4 h-4 text-orange-400" /> Gates
                    </div>
                    <p className="text-xs text-slate-500">Mark "MEM Completed" gate as achieved.</p>
                    <Button size="sm" variant="secondary" onClick={handleUpdateGate} disabled={loading} className="w-full mt-auto">
                        Complete MEM Gate
                    </Button>
                </div>

                 <div className="p-3 bg-slate-800/50 rounded border border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                        <FileOutput className="w-4 h-4 text-orange-400" /> Parameters
                    </div>
                    <p className="text-xs text-slate-500">Push mud weight window to drilling plan.</p>
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