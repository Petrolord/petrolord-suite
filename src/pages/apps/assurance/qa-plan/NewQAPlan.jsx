import React from 'react';
import { QAPlanShell } from './components/QAPlanShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export default function NewQAPlan() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSave = () => {
    toast({ title: "QA Plan Draft Created", description: "You can now add checkpoints." });
    navigate('/dashboard/apps/assurance/qa-plan/register');
  };

  return (
    <QAPlanShell title="Create QA Plan" description="Define a new quality assurance and control plan">
      <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Plan Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan Title</label>
              <Input placeholder="e.g. Well Delivery QA" className="bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Input placeholder="e.g. Drilling" className="bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Scope & Description</label>
            <Textarea placeholder="Describe the scope of this QA Plan..." className="bg-[hsl(var(--background))] border-[hsl(var(--border))] min-h-[100px]" />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => navigate(-1)} className="border-[hsl(var(--border))]">Cancel</Button>
            <Button onClick={handleSave} className="btn-primary">Create Plan</Button>
          </div>
        </CardContent>
      </Card>
    </QAPlanShell>
  );
}