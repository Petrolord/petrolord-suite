import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Save, AlertTriangle, Link as LinkIcon } from 'lucide-react';

const RiskForm = ({ open, onOpenChange, project, existingRisk, onSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Subsurface');
  const [probability, setProbability] = useState(3);
  const [impact, setImpact] = useState(3);
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('Open');
  const [description, setDescription] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  // PPFG Fields
  const [linkedWell, setLinkedWell] = useState('');
  const [linkedDepth, setLinkedDepth] = useState('');

  useEffect(() => {
    if (existingRisk) {
      setTitle(existingRisk.title || '');
      setCategory(existingRisk.category || 'Subsurface');
      setProbability(existingRisk.probability || 3);
      setImpact(existingRisk.impact || 3);
      setOwner(existingRisk.owner || '');
      setStatus(existingRisk.status || 'Open');
      setDescription(existingRisk.description || '');
      setMitigation(existingRisk.mitigation_plan || '');
      setDueDate(existingRisk.due_date || '');
      setLinkedWell(existingRisk.linked_well || '');
      setLinkedDepth(existingRisk.linked_depth_interval || '');
    } else {
      // Reset
      setTitle('');
      setCategory('Subsurface');
      setProbability(3);
      setImpact(3);
      setOwner('');
      setStatus('Open');
      setDescription('');
      setMitigation('');
      setDueDate('');
      setLinkedWell('');
      setLinkedDepth('');
    }
  }, [existingRisk, open]);

  const riskScore = probability * impact;

  const getScoreColor = (score) => {
    if (score >= 15) return 'bg-pl-danger text-pl-danger-fg';
    if (score >= 8) return 'bg-pl-warning text-pl-warning-fg';
    return 'bg-pl-success text-pl-success-fg';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project) return;
    setLoading(true);

    const payload = {
        project_id: project.id,
        title,
        category,
        probability,
        impact,
        risk_score: riskScore,
        owner,
        status,
        description,
        mitigation_plan: mitigation,
        due_date: dueDate || null,
        linked_well: linkedWell,
        linked_depth_interval: linkedDepth,
    };

    let error = null;

    if (existingRisk) {
        const { error: updateError } = await supabase
            .from('risks')
            .update({ ...payload, updated_at: new Date() })
            .eq('id', existingRisk.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('risks')
            .insert([payload]);
        error = insertError;
    }

    setLoading(false);

    if (error) {
        toast({ variant: "destructive", title: "Error saving risk", description: error.message });
    } else {
        toast({ title: "Risk Saved", description: "Risk register updated successfully." });
        onSaved();
        onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-pl-muted" />
            {existingRisk ? 'Edit Risk' : 'New Risk'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Risk Title</Label>
                    <Input 
                        placeholder="e.g. Stuck Pipe in Shale" 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        required 
                       
                    />
                </div>
                <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Subsurface">Subsurface</SelectItem>
                            <SelectItem value="Drilling">Drilling</SelectItem>
                            <SelectItem value="Commercial">Commercial</SelectItem>
                            <SelectItem value="HSSE">HSSE</SelectItem>
                            <SelectItem value="Digital">Digital</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-pl-sunken rounded border border-pl-border">
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Probability (1-5)</Label>
                        <span className="font-pl-mono tabular-nums text-pl-text">{probability}</span>
                    </div>
                    <Slider 
                        value={[probability]} 
                        onValueChange={vals => setProbability(vals[0])} 
                        max={5} min={1} step={1} 
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Impact (1-5)</Label>
                        <span className="font-pl-mono tabular-nums text-pl-text">{impact}</span>
                    </div>
                    <Slider 
                        value={[impact]} 
                        onValueChange={vals => setImpact(vals[0])} 
                        max={5} min={1} step={1} 
                    />
                </div>
                <div className="flex flex-col items-center justify-center md:border-l border-pl-border md:pl-4">
                    <Label className="mb-2">Risk Score</Label>
                    <Badge className={`text-lg px-3 py-1 ${getScoreColor(riskScore)}`}>
                        {riskScore}
                    </Badge>
                    <span className="mt-1 text-xs text-pl-muted">{riskScore >= 15 ? 'High' : riskScore >= 8 ? 'Medium' : 'Low'}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Owner</Label>
                    <Input 
                        placeholder="Risk Owner" 
                        value={owner} 
                        onChange={e => setOwner(e.target.value)} 
                       
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
                            <SelectItem value="Mitigating">Mitigating</SelectItem>
                            <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                    placeholder="Detailed description of the risk..." 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="min-h-[80px]"
                />
            </div>

            <div className="space-y-2">
                <Label>Mitigation Plan</Label>
                <Textarea 
                    placeholder="Steps to mitigate..." 
                    value={mitigation} 
                    onChange={e => setMitigation(e.target.value)} 
                    className="min-h-[80px]"
                />
            </div>

            {/* PPFG / Well Links */}
            <div className="space-y-2 pt-2 border-t border-pl-border">
                <div className="flex items-center gap-2 text-sm text-pl-muted mb-2">
                    <LinkIcon className="w-4 h-4" />
                    <span>Technical Links (Optional)</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <Input 
                        placeholder="Well Name" 
                        value={linkedWell}
                        onChange={e => setLinkedWell(e.target.value)}
                        className="text-xs"
                    />
                    <Input 
                        placeholder="Depth (e.g. 3000-3500m)" 
                        value={linkedDepth}
                        onChange={e => setLinkedDepth(e.target.value)}
                        className="text-xs"
                    />
                    <Input 
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="text-xs"
                    />
                </div>
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Risk
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RiskForm;