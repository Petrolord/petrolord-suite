import React, { useState } from 'react';
import { MOCPageShell } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Save, Send, UploadCloud } from 'lucide-react';

export default function NewMOC() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast({ title: "MOC Draft Saved", description: "Record MOC-2026-090 has been created successfully." });
      navigate('/dashboard/apps/assurance/management-of-change/MOC-2026-090');
    }, 800);
  };

  return (
    <MOCPageShell title="Initiate Change Request" description="Create a new Management of Change record">
      <div className="max-w-4xl mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
              <CardTitle className="text-lg">1. Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Change Title <span className="text-[hsl(var(--destructive))]">*</span></Label>
                <Input id="title" placeholder="Brief, descriptive title for the change" required className="bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Change Type <span className="text-[hsl(var(--destructive))]">*</span></Label>
                  <Select required>
                    <SelectTrigger className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category <span className="text-[hsl(var(--destructive))]">*</span></Label>
                  <Select required>
                    <SelectTrigger className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                      <SelectItem value="facility">Facility / Hardware</SelectItem>
                      <SelectItem value="process">Process / Chemistry</SelectItem>
                      <SelectItem value="procedural">Procedural / Documentation</SelectItem>
                      <SelectItem value="organizational">Organizational / Personnel</SelectItem>
                      <SelectItem value="software">Software / IT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Facility / Asset</Label>
                  <Input placeholder="e.g., Platform Alpha, Compressor C-101" className="bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
                </div>
                <div className="space-y-2">
                  <Label>Target Implementation Date</Label>
                  <Input type="date" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
              <CardTitle className="text-lg">2. Description & Justification</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label>Current Situation</Label>
                <Textarea placeholder="Describe the current state before the proposed change..." className="min-h-[100px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
              </div>
              <div className="space-y-2">
                <Label>Proposed Change <span className="text-[hsl(var(--destructive))]">*</span></Label>
                <Textarea required placeholder="Describe exactly what will be changed..." className="min-h-[100px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
              </div>
              <div className="space-y-2">
                <Label>Justification / Reason</Label>
                <Textarea placeholder="Why is this change necessary? (e.g., Safety, Optimization, Regulatory)" className="min-h-[80px] bg-[hsl(var(--background))] border-[hsl(var(--border))]" />
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
              <CardTitle className="text-lg">3. Supporting Documents</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="border-2 border-dashed border-[hsl(var(--border))] rounded-xl p-8 flex flex-col items-center justify-center text-center bg-[hsl(var(--secondary-background))]/50 hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer" onClick={() => toast({description: "File upload dialog would open here."})}>
                <div className="w-12 h-12 bg-[hsl(var(--primary))]/10 rounded-full flex items-center justify-center mb-4">
                  <UploadCloud className="w-6 h-6 text-[hsl(var(--primary))]" />
                </div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">Click to upload or drag and drop</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">P&IDs, datasheets, risk assessments (PDF, Excel, Word)</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3 sticky bottom-0 md:bottom-auto bg-[hsl(var(--background))] p-4 md:p-0 border-t md:border-0 border-[hsl(var(--border))] z-20">
            <Button type="button" variant="outline" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" className="bg-[hsl(var(--secondary))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" /> Save Draft
            </Button>
            <Button type="button" className="btn-primary" disabled={isSubmitting} onClick={handleSubmit}>
              <Send className="w-4 h-4 mr-2" /> Submit for Screening
            </Button>
          </div>

        </form>
      </div>
    </MOCPageShell>
  );
}