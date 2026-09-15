import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Save, TrendingUp } from 'lucide-react';

const ProgressUpdateForm = ({ open, onOpenChange, project, kpis, onUpdateSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [status, setStatus] = useState('Green');
  const [percentComplete, setPercentComplete] = useState(0);
  const [narrative, setNarrative] = useState('');
  const [blockers, setBlockers] = useState('');
  const [decisions, setDecisions] = useState('');

  // Initialize form with calculated KPIs when opened
  useEffect(() => {
    if (open && kpis) {
      // EC6-0: the engine returns numbers now (it used to return strings, and
      // this called .replace on them). A project with no cost-loaded tasks has
      // no earned-value percentage at all, so the field starts empty rather
      // than at a made-up zero.
      setPercentComplete(typeof kpis.percentComplete === 'number' ? kpis.percentComplete : 0);
    }
  }, [open, kpis]);

  const money = (v) => (typeof v === 'number' && Number.isFinite(v)
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : 'No cost data');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project) return;
    
    setLoading(true);

    const payload = {
        project_id: project.id,
        report_date: new Date().toISOString().split('T')[0],
        status,
        percent_complete: percentComplete,
        narrative,
        blockers,
        decisions_needed: decisions,
        // EC6-0: an index that is not defined is stored as null, not as the
        // 1.0 this form used to invent and file as a measurement.
        spi: typeof kpis?.spi === 'number' ? kpis.spi : null,
        cpi: typeof kpis?.cpi === 'number' ? kpis.cpi : null,
        earned_value: typeof kpis?.ev === 'number' ? kpis.ev : null,
        planned_value: typeof kpis?.pv === 'number' ? kpis.pv : null,
        actual_cost: typeof kpis?.ac === 'number' ? kpis.ac : null
    };

    const { error } = await supabase.from('project_updates').insert([payload]);

    setLoading(false);

    if (error) {
        toast({ variant: "destructive", title: "Error saving update", description: error.message });
    } else {
        toast({ title: "Progress Update Saved", description: "Your weekly report has been logged." });
        onUpdateSaved();
        onOpenChange(false);
        // Reset form
        setNarrative('');
        setBlockers('');
        setDecisions('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lime-400" />
            Log Progress Update
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Submit a weekly snapshot for {project?.name}. KPIs are auto-filled from current task data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
            {/* Status & Progress Row */}
            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>RAG Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className={`bg-slate-800 border-slate-700 ${
                            status === 'Green' ? 'text-green-400' : 
                            status === 'Amber' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                            <SelectItem value="Green" className="text-green-400">Green - On Track</SelectItem>
                            <SelectItem value="Amber" className="text-amber-400">Amber - At Risk</SelectItem>
                            <SelectItem value="Red" className="text-red-400">Red - Critical Issue</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Project % Complete</Label>
                        <span className="text-sm font-bold text-blue-400">{Math.round(percentComplete)}%</span>
                    </div>
                    <Slider 
                        value={[percentComplete]} 
                        onValueChange={(vals) => setPercentComplete(vals[0])} 
                        max={100} 
                        step={1} 
                        className="py-2"
                    />
                    <p className="text-[10px] text-slate-500">Auto-calculated from tasks. Adjust if needed.</p>
                </div>
            </div>

            {/* Auto-Calc KPIs Display (Read Only) */}
            <div className="grid grid-cols-3 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div>
                    <Label className="text-xs text-slate-500">Planned Value (PV)</Label>
                    <div className="text-lg font-mono">{money(kpis?.pv)}</div>
                </div>
                 <div>
                    <Label className="text-xs text-slate-500">Earned Value (EV)</Label>
                    <div className="text-lg font-mono text-blue-400">{money(kpis?.ev)}</div>
                </div>
                 <div>
                    <Label className="text-xs text-slate-500">Schedule Index (SPI)</Label>
                    <div className={`text-lg font-mono ${typeof kpis?.spi !== 'number' ? 'text-slate-400' : (kpis.spi < 1 ? 'text-red-400' : 'text-green-400')}`}>
                        {typeof kpis?.spi === 'number' ? kpis.spi.toFixed(2) : 'n/a'}
                    </div>
                    {/* EC6-1: planned value is time-phased to today, so this
                        index says early or late. When it cannot be computed the
                        engine says why. */}
                    <p className="text-[10px] text-slate-600 mt-1">{kpis?.spiBasis || ''}</p>
                </div>
            </div>

            {/* Narrative Fields */}
            <div className="space-y-2">
                <Label>Executive Summary / Narrative</Label>
                <Textarea 
                    placeholder="What was achieved this week? Any major milestones hit?" 
                    className="bg-slate-800 border-slate-700 min-h-[100px]"
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label>Blockers & Risks</Label>
                <Textarea 
                    placeholder="What is holding up progress? Any new risks identified?" 
                    className="bg-slate-800 border-slate-700"
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label>Decisions Needed</Label>
                <Input 
                    placeholder="e.g. Approval for AFE supplement required by Friday" 
                    className="bg-slate-800 border-slate-700"
                    value={decisions}
                    onChange={(e) => setDecisions(e.target.value)}
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-lime-600 hover:bg-lime-700">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Submit Update
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProgressUpdateForm;