import React, { useState, useEffect } from 'react';
import { healthOf } from './ExecutiveSummary';
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
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

const ProgressUpdateForm = ({ open, onOpenChange, project, kpis, onUpdateSaved }) => {
  const { toast } = useToast();
  const { full } = useFullPrecision();
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
      // Senior test T1: the RAG opened on Green beside an SPI of 0.71. It
      // now opens on the band the measured indexes fall in (the portfolio's
      // health bands), and the user can still override it.
      const band = healthOf(kpis);
      if (band !== 'unmeasured') setStatus({ onTrack: 'Green', atRisk: 'Amber', critical: 'Red' }[band]);
    }
  }, [open, kpis]);

  const money = (v) => (typeof v === 'number' && Number.isFinite(v)
    ? (full ? `$${formatFull(v, 2)}` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-pl-muted" />
            Log Progress Update
          </DialogTitle>
          <DialogDescription className="text-pl-muted">
            Submit a weekly snapshot for {project?.name}. KPIs are auto-filled from current task data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
            {/* Status & Progress Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>RAG Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className={
                            status === 'Green' ? 'text-pl-success-text' :
                            status === 'Amber' ? 'text-pl-warning-text' : 'text-pl-danger-text'
                        }>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Green" className="text-pl-success-text">Green - On Track</SelectItem>
                            <SelectItem value="Amber" className="text-pl-warning-text">Amber - At Risk</SelectItem>
                            <SelectItem value="Red" className="text-pl-danger-text">Red - Critical Issue</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Project % Complete</Label>
                        <span className="text-sm font-bold font-pl-mono tabular-nums text-pl-text">{Math.round(percentComplete)}%</span>
                    </div>
                    <Slider 
                        value={[percentComplete]} 
                        onValueChange={(vals) => setPercentComplete(vals[0])} 
                        max={100} 
                        step={1} 
                        className="py-2"
                    />
                    <p className="text-[10px] text-pl-muted">Auto-calculated from tasks. Adjust if needed.</p>
                </div>
            </div>

            {/* Auto-Calc KPIs Display (Read Only) */}
            <div className="grid grid-cols-3 gap-4 bg-pl-sunken p-4 rounded-lg border border-pl-border">
                <div>
                    <Label className="text-xs text-pl-muted">Planned Value (PV)</Label>
                    <div className="text-lg font-pl-mono tabular-nums">{money(kpis?.pv)}</div>
                </div>
                 <div>
                    <Label className="text-xs text-pl-muted">Earned Value (EV)</Label>
                    <div className="text-lg font-pl-mono tabular-nums text-pl-text">{money(kpis?.ev)}</div>
                </div>
                 <div>
                    <Label className="text-xs text-pl-muted">Schedule Index (SPI)</Label>
                    <div className={`text-lg font-pl-mono tabular-nums ${typeof kpis?.spi !== 'number' ? 'text-pl-muted' : (kpis.spi < 1 ? 'text-pl-danger-text' : 'text-pl-success-text')}`}>
                        {typeof kpis?.spi === 'number' ? (full ? formatFull(kpis.spi, 6) : kpis.spi.toFixed(2)) : 'n/a'}
                    </div>
                    {/* EC6-1: planned value is time-phased to today, so this
                        index says early or late. When it cannot be computed the
                        engine says why. */}
                    <p className="text-[10px] text-pl-muted mt-1">{kpis?.spiBasis || ''}</p>
                </div>
            </div>

            {/* Narrative Fields */}
            <div className="space-y-2">
                <Label>Executive Summary / Narrative</Label>
                <Textarea 
                    placeholder="What was achieved this week? Any major milestones hit?" 
                    className="min-h-[100px]"
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label>Blockers & Risks</Label>
                <Textarea 
                    placeholder="What is holding up progress? Any new risks identified?" 
                   
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label>Decisions Needed</Label>
                <Input 
                    placeholder="e.g. Approval for AFE supplement required by Friday" 
                   
                    value={decisions}
                    onChange={(e) => setDecisions(e.target.value)}
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={loading}>
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