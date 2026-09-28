import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Save, AlertCircle } from 'lucide-react';

const IssueForm = ({ open, onOpenChange, project, existingIssue, onSaved, risks = [] }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('Open');
  const [occurredDate, setOccurredDate] = useState('');
  const [resolution, setResolution] = useState('');
  const [linkedRiskId, setLinkedRiskId] = useState('');

  useEffect(() => {
    if (existingIssue) {
      setTitle(existingIssue.title || '');
      setDescription(existingIssue.description || '');
      setOwner(existingIssue.owner || '');
      setStatus(existingIssue.status || 'Open');
      setOccurredDate(existingIssue.occurred_date || '');
      setResolution(existingIssue.resolution || '');
      setLinkedRiskId(existingIssue.linked_risk_id || '');
    } else {
      setTitle('');
      setDescription('');
      setOwner('');
      setStatus('Open');
      setOccurredDate(new Date().toISOString().split('T')[0]);
      setResolution('');
      setLinkedRiskId('');
    }
  }, [existingIssue, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project) return;
    setLoading(true);

    const payload = {
        project_id: project.id,
        title,
        description,
        owner,
        status,
        occurred_date: occurredDate || null,
        resolution,
        linked_risk_id: linkedRiskId || null,
    };

    if (status === 'Resolved' && !payload.resolved_date) {
        payload.resolved_date = new Date().toISOString().split('T')[0];
    }

    let error = null;

    if (existingIssue) {
        const { error: updateError } = await supabase
            .from('project_issues')
            .update({ ...payload, updated_at: new Date() })
            .eq('id', existingIssue.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('project_issues')
            .insert([payload]);
        error = insertError;
    }

    setLoading(false);

    if (error) {
        toast({ variant: "destructive", title: "Error saving issue", description: error.message });
    } else {
        toast({ title: "Issue Saved", description: "Issue log updated successfully." });
        onSaved();
        onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-pl-muted" />
            {existingIssue ? 'Edit Issue' : 'Log New Issue'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
                <Label>Issue Title</Label>
                <Input 
                    placeholder="What happened?" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    required 
                   
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Date Occurred</Label>
                    <Input 
                        type="date"
                        value={occurredDate} 
                        onChange={e => setOccurredDate(e.target.value)} 
                       
                    />
                </div>
                <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Resolved">Resolved</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                    placeholder="Details of the issue..." 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="min-h-[80px]"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Owner</Label>
                    <Input 
                        value={owner} 
                        onChange={e => setOwner(e.target.value)} 
                       
                    />
                </div>
                <div className="space-y-2">
                    <Label>Linked Risk (Optional)</Label>
                    <Select value={linkedRiskId} onValueChange={setLinkedRiskId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select existing risk..." />
                        </SelectTrigger>
                        <SelectContent>
                            {risks.map(r => (
                                <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Resolution / Action Taken</Label>
                <Textarea 
                    placeholder="How was this resolved?" 
                    value={resolution} 
                    onChange={e => setResolution(e.target.value)} 
                    className="min-h-[60px]"
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Issue
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default IssueForm;