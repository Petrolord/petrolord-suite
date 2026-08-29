import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { BarChart2, FileText, CalendarCheck, CheckCircle } from 'lucide-react';

const LogFaciesIntegrationPanel = ({ project, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleAttachReport = async () => {
    setLoading(true);
    const { error } = await supabase.from('pm_deliverables').insert({
        project_id: project.id,
        name: `Facies Analysis Report`,
        app_source: 'Log Facies',
        status: 'Draft',
        version: 'Final'
    });
    setLoading(false);
    if(!error) {
        toast({ title: 'Deliverable added', description: 'Draft facies report added; set its status when it is reviewed.' });
        onRefresh();
    }
  };

  const handleCreateMilestone = async () => {
      setLoading(true);
      // Fetch max order
      const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', project.id);
      
      const milestone = {
          project_id: project.id,
          name: 'Facies Study Complete',
          type: 'milestone',
          status: 'To Do',
          planned_start_date: new Date(),
          planned_end_date: new Date(),
          display_order: (count || 0) + 1
      };

      const { error } = await supabase.from('tasks').insert(milestone);
      setLoading(false);
      if(!error) {
          toast({ title: 'Milestone Created', description: 'Facies Study Complete milestone added.' });
          onRefresh();
      }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-white">
                        <BarChart2 className="w-5 h-5 text-purple-400" />
                        Log Facies Analysis
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Add facies-study planning items to this project. There is no live link to the app yet, so nothing is read from it.
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
                        <FileText className="w-4 h-4 text-purple-400" /> Reports
                    </div>
                    <p className="text-xs text-slate-500">Attach final facies distribution report.</p>
                    <Button size="sm" variant="secondary" onClick={handleAttachReport} disabled={loading} className="w-full mt-auto">
                        Attach Facies Report
                    </Button>
                </div>

                 <div className="p-3 bg-slate-800/50 rounded border border-slate-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                        <CalendarCheck className="w-4 h-4 text-purple-400" /> Milestones
                    </div>
                    <p className="text-xs text-slate-500">Track study completion in schedule.</p>
                    <Button size="sm" variant="secondary" onClick={handleCreateMilestone} disabled={loading} className="w-full mt-auto">
                        Push "Study Complete" Milestone
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default LogFaciesIntegrationPanel;