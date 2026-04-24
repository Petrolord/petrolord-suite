import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function NewLesson() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Draft Saved",
      description: "Lesson draft has been saved successfully.",
    });
    navigate('/dashboard/apps/assurance/lessons-learned');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-[hsl(var(--secondary))]">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Capture New Lesson</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm">Document an observation, event, or optimization.</p>
        </div>
      </div>

      <Card className="panel-elevation">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Lesson Title *</label>
              <Input placeholder="E.g., Pump failure during startup..." className="bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Project / Asset</label>
                <select className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] ring-offset-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2">
                  <option>Select Project...</option>
                  <option>Subsea Tie-back Alpha</option>
                  <option>Well X-15 Development</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Category</label>
                <select className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] ring-offset-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2">
                  <option>Select Category...</option>
                  <option>Equipment Failure</option>
                  <option>Optimization</option>
                  <option>HSE</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Description of Event/Observation *</label>
              <Textarea placeholder="Describe what happened in detail..." className="min-h-[120px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Root Cause / Analysis</label>
              <Textarea placeholder="Why did it happen? What was the underlying cause?" className="min-h-[80px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[hsl(var(--foreground))]">Recommendation / Action</label>
              <Textarea placeholder="What should be done differently next time?" className="min-h-[80px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[hsl(var(--border))]">
            <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate(-1)}>Cancel</Button>
            <Button className="btn-primary" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> Save Draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}