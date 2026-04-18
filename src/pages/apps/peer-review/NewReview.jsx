import React, { useState } from 'react';
import { PeerReviewShell } from './components/PeerReviewShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { PeerReviewService } from './services/PeerReviewService';
import { UploadCloud, Users, Calendar, AlertCircle } from 'lucide-react';

const NewReview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({ 
    title: '', 
    review_type: '', 
    project_asset: '',
    department: '',
    discipline: '',
    priority: 'Medium',
    due_date: '',
    scope_description: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (submit = false) => {
    if (!formData.title || !formData.review_type || !formData.project_asset) {
      toast({ title: "Validation Error", description: "Title, Type, and Asset are required.", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const dataToSave = { ...formData, stage: submit ? 'In Review' : 'Draft' };
      await PeerReviewService.saveReview(dataToSave);
      toast({ title: "Success", description: `Review ${submit ? 'initiated' : 'saved as draft'}.` });
      navigate('/dashboard/apps/assurance/peer-review-manager/register');
    } catch(e) {
      toast({ title: "Error", description: "Failed to save review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PeerReviewShell>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
        <div className="border-b border-[hsl(var(--border))] pb-4">
           <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Initiate New Peer Review</h2>
           <p className="text-[hsl(var(--muted-foreground))] mt-1">Define scope, assign team, and upload initial deliverables.</p>
        </div>

        <Card className="bg-panel">
          <CardHeader><CardTitle className="text-[hsl(var(--foreground))] text-lg">1. Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Review Title <span className="text-[hsl(var(--destructive))]">*</span></Label>
              <Input placeholder="e.g. Alpha Field FDP Pre-FID Review" className="bg-[hsl(var(--input))] border-[hsl(var(--border))]" value={formData.title} onChange={e => handleChange('title', e.target.value)} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Review Type <span className="text-[hsl(var(--destructive))]">*</span></Label>
                <Select onValueChange={v => handleChange('review_type', v)}>
                  <SelectTrigger className="bg-[hsl(var(--input))] border-[hsl(var(--border))]"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                    <SelectItem value="FDP">Field Development Plan (FDP)</SelectItem>
                    <SelectItem value="Reserves Audit">Reserves Audit</SelectItem>
                    <SelectItem value="Well Concept">Well Concept Review</SelectItem>
                    <SelectItem value="Facilities Study">Facilities Study</SelectItem>
                    <SelectItem value="Commercial Strategy">Commercial Strategy</SelectItem>
                    <SelectItem value="Production Ops">Production Optimization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project / Asset <span className="text-[hsl(var(--destructive))]">*</span></Label>
                <Input placeholder="e.g. Alpha Field" className="bg-[hsl(var(--input))] border-[hsl(var(--border))]" value={formData.project_asset} onChange={e => handleChange('project_asset', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select onValueChange={v => handleChange('department', v)}>
                  <SelectTrigger className="bg-[hsl(var(--input))] border-[hsl(var(--border))]"><SelectValue placeholder="Select dept" /></SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Exploration">Exploration</SelectItem>
                    <SelectItem value="Drilling">Drilling</SelectItem>
                    <SelectItem value="Production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Discipline</Label>
                <Input placeholder="e.g. Reservoir Engineering" className="bg-[hsl(var(--input))] border-[hsl(var(--border))]" value={formData.discipline} onChange={e => handleChange('discipline', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-panel">
          <CardHeader><CardTitle className="text-[hsl(var(--foreground))] text-lg">2. Scope & Parameters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Detailed Scope & Objectives</Label>
              <Textarea placeholder="Define boundaries and focus areas for reviewers..." className="bg-[hsl(var(--input))] border-[hsl(var(--border))] min-h-[100px]" value={formData.scope_description} onChange={e => handleChange('scope_description', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={v => handleChange('priority', v)}>
                  <SelectTrigger className="bg-[hsl(var(--input))] border-[hsl(var(--border))]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Completion Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  <Input type="date" className="pl-9 bg-[hsl(var(--input))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]" value={formData.due_date} onChange={e => handleChange('due_date', e.target.value)} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <Card className="bg-panel">
              <CardHeader><CardTitle className="text-[hsl(var(--foreground))] text-lg">3. Review Team</CardTitle></CardHeader>
              <CardContent>
                 <div className="p-6 border border-dashed border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--input))]/50 text-center text-[hsl(var(--muted-foreground))]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                    <p className="text-sm">Team assignment becomes available after initial save.</p>
                 </div>
              </CardContent>
           </Card>
           
           <Card className="bg-panel">
              <CardHeader><CardTitle className="text-[hsl(var(--foreground))] text-lg">4. Deliverables</CardTitle></CardHeader>
              <CardContent>
                 <div className="p-6 border border-dashed border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--input))]/50 text-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--input))] transition-colors cursor-pointer" onClick={() => toast({description:"Upload dialog opening..."})}>
                    <UploadCloud className="w-8 h-8 mx-auto mb-2 text-[hsl(var(--primary))]"/>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">Click to upload files</p>
                    <p className="text-xs mt-1">PDF, DOCX, PPTX, max 50MB</p>
                 </div>
              </CardContent>
           </Card>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-[hsl(var(--border))]">
          <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate(-1)} disabled={isSubmitting}>Cancel</Button>
          <Button variant="outline" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => handleSave(false)} disabled={isSubmitting}>Save as Draft</Button>
          <Button className="btn-primary" onClick={() => handleSave(true)} disabled={isSubmitting}>Initiate Review</Button>
        </div>
      </div>
    </PeerReviewShell>
  );
};

export default NewReview;