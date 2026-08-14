import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Link2, X } from 'lucide-react';

// Project form (D4): valuations can be typed manually or pulled from a
// saved EPE Monte Carlo run (NPV percentiles + standard deviation arrive in
// $MM with provenance recorded). Chance of success and failure cost feed
// the risked-EMV objective the optimizer maximizes.

const ProjectForm = ({ project, onSave, onCancel }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: project?.name || '',
    capex: project?.capex ?? '',
    npv_p10: project?.npv_p10 ?? '',
    npv_p50: project?.npv_p50 ?? '',
    npv_p90: project?.npv_p90 ?? '',
    risk_score: project?.risk_score ?? 5,
    pos: project?.pos != null ? Math.round(project.pos * 100) : 100,
    fail_cost: project?.fail_cost ?? 0,
    npv_stddev: project?.npv_stddev ?? null,
    source_type: project?.source_type || 'manual',
    source_ref: project?.source_ref || null,
    source_label: project?.source_label || null,
  });
  const [mcRuns, setMcRuns] = useState(null);
  const [showMcPicker, setShowMcPicker] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openMcPicker = async () => {
    if (mcRuns === null) {
      const { data } = await supabase.from('epe_mc_runs')
        .select('id, created_at, results, epe_run_configs(config_name)')
        .order('created_at', { ascending: false })
        .limit(25);
      setMcRuns(data || []);
    }
    setShowMcPicker(true);
  };

  const linkMcRun = (run) => {
    const npv = run?.results?.npv;
    if (!npv) return;
    // EPE NPVs are USD; this app works in $MM.
    setFormData(prev => ({
      ...prev,
      npv_p90: (npv.p90 / 1e6).toFixed(1),
      npv_p50: (npv.p50 / 1e6).toFixed(1),
      npv_p10: (npv.p10 / 1e6).toFixed(1),
      npv_stddev: npv.stdDev / 1e6,
      source_type: 'epe_mc',
      source_ref: run.id,
      source_label: run.epe_run_configs?.config_name || 'EPE MC run',
    }));
    setShowMcPicker(false);
  };

  const unlink = () => setFormData(prev => ({
    ...prev, source_type: 'manual', source_ref: null, source_label: null, npv_stddev: null,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    const projectData = {
      user_id: user.id,
      name: formData.name,
      capex: parseFloat(formData.capex),
      npv_p10: parseFloat(formData.npv_p10),
      npv_p50: parseFloat(formData.npv_p50),
      npv_p90: parseFloat(formData.npv_p90),
      risk_score: parseFloat(formData.risk_score),
      pos: Math.min(100, Math.max(0, parseFloat(formData.pos))) / 100,
      fail_cost: Math.max(0, parseFloat(formData.fail_cost) || 0),
      npv_stddev: formData.npv_stddev != null ? Number(formData.npv_stddev) : null,
      source_type: formData.source_type,
      source_ref: formData.source_ref,
      source_label: formData.source_label,
    };

    if (!projectData.name || [projectData.capex, projectData.npv_p10, projectData.npv_p50, projectData.npv_p90, projectData.risk_score, projectData.pos].some((v) => isNaN(v))) {
      toast({ variant: 'destructive', title: 'Please fill all fields correctly.' });
      return;
    }

    let error;
    if (project?.id) {
      const { error: updateError } = await supabase.from('portfolio_projects').update(projectData).eq('id', project.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('portfolio_projects').insert(projectData);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to save project', description: error.message });
    } else {
      toast({ title: 'Success!', description: `Project ${project?.id ? 'updated' : 'created'}.` });
      onSave();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label htmlFor="name">Project Name</Label><Input id="name" name="name" value={formData.name} onChange={handleChange} className="bg-white/5 border-white/20" required /></div>

      {/* Valuation source */}
      <div className="rounded-lg border border-white/15 p-3">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-slate-200">Valuation</Label>
          {formData.source_type === 'epe_mc' ? (
            <span className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-500/30 rounded px-2 py-0.5 flex items-center gap-1">
              <Link2 className="w-3 h-3" /> {formData.source_label}
              <button type="button" onClick={unlink} title="Unlink and edit manually" className="ml-1 text-slate-300 hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-sky-300 hover:text-sky-200" onClick={openMcPicker}>
              <Link2 className="w-3 h-3 mr-1" /> Link EPE Monte Carlo run
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><Label htmlFor="npv_p90">NPV P90 ($MM)</Label><Input id="npv_p90" name="npv_p90" type="number" step="any" value={formData.npv_p90} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} className="bg-white/5 border-white/20 disabled:opacity-60" required /></div>
          <div><Label htmlFor="npv_p50">NPV P50 ($MM)</Label><Input id="npv_p50" name="npv_p50" type="number" step="any" value={formData.npv_p50} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} className="bg-white/5 border-white/20 disabled:opacity-60" required /></div>
          <div><Label htmlFor="npv_p10">NPV P10 ($MM)</Label><Input id="npv_p10" name="npv_p10" type="number" step="any" value={formData.npv_p10} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} className="bg-white/5 border-white/20 disabled:opacity-60" required /></div>
        </div>
        <p className="text-xs text-slate-400 mt-2">Petroleum convention: P90 is the low case. Linked runs also carry the NPV standard deviation into portfolio risk.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="capex">CAPEX ($MM)</Label><Input id="capex" name="capex" type="number" step="any" value={formData.capex} onChange={handleChange} className="bg-white/5 border-white/20" required /></div>
        <div><Label htmlFor="risk_score">Risk Score (1-10)</Label><Input id="risk_score" name="risk_score" type="number" min="1" max="10" value={formData.risk_score} onChange={handleChange} className="bg-white/5 border-white/20" required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="pos">Chance of success (%)</Label><Input id="pos" name="pos" type="number" min="0" max="100" step="1" value={formData.pos} onChange={handleChange} className="bg-white/5 border-white/20" required /></div>
        <div><Label htmlFor="fail_cost">Loss if it fails ($MM)</Label><Input id="fail_cost" name="fail_cost" type="number" min="0" step="any" value={formData.fail_cost} onChange={handleChange} className="bg-white/5 border-white/20" /></div>
      </div>
      <p className="text-xs text-slate-400">The optimizer maximizes risked EMV: chance of success times NPV P50, minus the failure loss weighted by the failure chance.</p>

      {showMcPicker && (
        <div className="rounded-lg border border-slate-600 bg-slate-900 p-3 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">Pick a saved Monte Carlo run</p>
            <button type="button" onClick={() => setShowMcPicker(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {(mcRuns || []).length === 0 && <p className="text-xs text-slate-400">No saved runs. Run one from an EPE result's Risk tab first.</p>}
          {(mcRuns || []).map((run) => (
            <button key={run.id} type="button" onClick={() => linkMcRun(run)} className="w-full text-left py-1.5 px-2 rounded hover:bg-slate-800 border-b border-white/5">
              <span className="text-sm text-sky-300">{run.epe_run_configs?.config_name || 'EPE run'}</span>
              <span className="block text-xs text-slate-400">
                NPV mean {(run.results?.npv?.mean / 1e6).toFixed(1)} $MM · {new Date(run.created_at).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{project?.id ? 'Update' : 'Create'} Project</Button>
      </DialogFooter>
    </form>
  );
};

export default ProjectForm;
