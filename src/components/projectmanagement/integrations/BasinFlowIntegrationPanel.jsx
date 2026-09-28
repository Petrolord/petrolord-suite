import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Globe, ShieldAlert, FileText, CheckCircle } from 'lucide-react';

const BasinFlowIntegrationPanel = ({ project, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleAddChargeGate = async () => {
    setLoading(true);
    
    // Create a milestone for Charge Risk Assessment
    const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', project.id);
    
    const milestone = {
          project_id: project.id,
          name: 'Charge Risk Assessment Approved',
          type: 'milestone',
          status: 'To Do',
          planned_start_date: new Date(),
          planned_end_date: new Date(),
          display_order: (count || 0) + 1
    };

    const { error } = await supabase.from('tasks').insert(milestone);
    
    setLoading(false);
    if(!error) {
        toast({ title: 'Gate Added', description: 'Charge Risk Assessment milestone added to schedule.' });
        onRefresh();
    }
  };

  const handleAttachBasinReport = async () => {
      setLoading(true);
      const { error } = await supabase.from('pm_deliverables').insert({
          project_id: project.id,
          name: `Basin Modeling Final Report`,
          app_source: 'BasinFlow',
          status: 'Draft',
          version: 'v1.0'
      });
      setLoading(false);
      if(!error) {
          toast({ title: 'Report Linked', description: 'Basin modeling report attached to project.' });
          onRefresh();
      }
  };

  return (
    <Card>
        <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="text-base flex items-center gap-2 text-pl-text">
                        <Globe className="w-5 h-5 text-pl-primary-text" aria-hidden="true" />
                        BasinFlow Genesis
                    </CardTitle>
                    <CardDescription className="text-pl-muted">
                        Add charge-modelling planning items to this project. There is no live link to the app yet, so nothing is read from it.
                    </CardDescription>
                </div>
                <Badge variant="neutral" className="shrink-0 whitespace-nowrap">
                    Planning aid
                </Badge>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-pl-sunken rounded border border-pl-border flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-pl-text font-medium text-sm">
                        <ShieldAlert className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Risk Gates
                    </div>
                    <p className="text-xs text-pl-muted">Add "Charge Risk" approval gate.</p>
                    <Button size="sm" variant="secondary" onClick={handleAddChargeGate} disabled={loading} className="w-full mt-auto">
                        Add Assessment Gate
                    </Button>
                </div>

                 <div className="p-3 bg-pl-sunken rounded border border-pl-border flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-pl-text font-medium text-sm">
                        <FileText className="w-4 h-4 text-pl-muted" aria-hidden="true" /> Reporting
                    </div>
                    <p className="text-xs text-pl-muted">Attach basin modeling summary.</p>
                    <Button size="sm" variant="secondary" onClick={handleAttachBasinReport} disabled={loading} className="w-full mt-auto">
                        Attach Report
                    </Button>
                </div>
            </div>
        </CardContent>
    </Card>
  );
};

export default BasinFlowIntegrationPanel;