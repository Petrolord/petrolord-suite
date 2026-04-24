import React from 'react';
import { useParams } from 'react-router-dom';
import { QAPlanShell } from './components/QAPlanShell';
import { qaPlans } from '@/data/qa-plan/qaPlanSampleData';
import { checkpoints } from '@/data/qa-plan/checkpointSampleData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function QAPlanDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const plan = qaPlans.find(p => p.id === (id || 'QAP-2026-001')) || qaPlans[0];
  const planCheckpoints = checkpoints.filter(c => c.qaPlanId === plan.id);

  return (
    <QAPlanShell title={`${plan.id}: ${plan.title}`} description="QA Plan Details and Checkpoints">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
            <CardHeader>
              <CardTitle className="text-lg">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div><p className="text-[hsl(var(--muted-foreground))]">Status</p><p className="font-medium text-[hsl(var(--primary))]">{plan.status}</p></div>
              <div><p className="text-[hsl(var(--muted-foreground))]">Owner</p><p className="font-medium">{plan.owner}</p></div>
              <div><p className="text-[hsl(var(--muted-foreground))]">Department</p><p className="font-medium">{plan.department}</p></div>
              <div><p className="text-[hsl(var(--muted-foreground))]">Description</p><p className="mt-1 p-3 bg-[hsl(var(--secondary))] rounded border border-[hsl(var(--border))]">{plan.description}</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-lg">Inspection & Test Plan (ITP)</CardTitle>
              <Button size="sm" variant="outline" className="border-[hsl(var(--border))]" onClick={() => toast({description: "Add checkpoint dialog..."})}>
                <Plus className="w-4 h-4 mr-2" /> Add Checkpoint
              </Button>
            </CardHeader>
            <CardContent>
              {planCheckpoints.length > 0 ? (
                <div className="space-y-3">
                  {planCheckpoints.map(chk => (
                    <div key={chk.id} className="p-4 border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {chk.status === 'Passed' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Clock className="w-5 h-5 text-orange-500" />}
                        <div>
                          <p className="font-medium text-sm">{chk.title}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{chk.id} • Type: {chk.type} • Assignee: {chk.assignedTo}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => toast({description: "Viewing checkpoint details..."})}>View</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
                  <p>No checkpoints defined for this plan yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </QAPlanShell>
  );
}