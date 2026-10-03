import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Link2, X } from 'lucide-react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildLabel } from '@/lib/platformBuild';
import { listRrvPortfolioCandidates } from '@/pages/apps/riskedreserves/services/rrvPortfolioService';
import {
  RRV_SOURCE_TYPE, RRV_NPV_LABEL, RRV_NPV_NOTE, RRV_RISK_SCORE_TEXT, RRV_P90_LABEL, RRV_P10_LABEL, RRV_SIZE_NOTE, rrvIntakeProject, readRrvLink, rrvEditedFields, rrvProvenanceRows,
} from './rrvIntake';

// Project form (D4): valuations can be typed manually or pulled from a
// saved EPE Monte Carlo run (NPV percentiles + standard deviation arrive in
// $MM with provenance recorded). Chance of success and failure cost feed
// the risked-EMV objective the optimizer maximizes.
//
// Risked Reserves Valuation U2-009 (2026-10-03): a saved valuation can be
// taken in as a candidate (picked here, or sent by link: `offer`). Its
// success-case MEAN value sits in the NPV slot and is labelled as a mean, the
// well cost is the CAPEX, the chance of success is Pg, and no risk score is
// asked for (owner decisions, rrvIntake.js). A typed project is unchanged.

// pos is kept as a fraction for a Risked Reserves project (Pg is not a whole
// percent) and shown as a percent with one decimal
const pctShown = (pos, rrv) => (pos == null ? 100 : rrv ? Number((pos * 100).toPrecision(10)) : Math.round(pos * 100));

const fromProject = (project) => {
  const rrv = project?.source_type === RRV_SOURCE_TYPE;
  return {
    name: project?.name || '',
    capex: project?.capex ?? '',
    npv_p10: project?.npv_p10 ?? '',
    npv_p50: project?.npv_p50 ?? '',
    npv_p90: project?.npv_p90 ?? '',
    risk_score: project?.risk_score ?? (rrv ? '' : 5),
    pos: pctShown(project?.pos, rrv),
    fail_cost: project?.fail_cost ?? 0,
    npv_stddev: project?.npv_stddev ?? null,
    source_type: project?.source_type || 'manual',
    source_ref: project?.source_ref || null,
    source_label: project?.source_label || null,
  };
};

const ProjectForm = ({ project, onSave, onCancel, offer = null }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState(() => fromProject(project || (offer ? rrvIntakeProject(offer, { build: buildLabel() }) : null)));
  const [mcRuns, setMcRuns] = useState(null);
  const [showMcPicker, setShowMcPicker] = useState(false);
  const [rrvList, setRrvList] = useState(null); // null closed; 'loading'; Array; {error}
  const isRrv = formData.source_type === RRV_SOURCE_TYPE;
  const rrvLink = isRrv ? readRrvLink(formData) : null;
  // the slots as they would be saved, to mark what was typed over since intake
  const rrvEdited = rrvLink ? rrvEditedFields({
    ...formData, capex: parseFloat(formData.capex), npv_p50: parseFloat(formData.npv_p50), npv_p90: parseFloat(formData.npv_p90), npv_p10: parseFloat(formData.npv_p10), pos: parseFloat(formData.pos) / 100, fail_cost: parseFloat(formData.fail_cost),
  }) : [];
  const editedNote = (field) => {
    const e = rrvEdited.find((x) => x.field === field);
    if (!e) return null;
    const shown = field === 'pos' ? `${(e.received * 100).toFixed(1)}%` : `${Number(e.received).toFixed(2)} $MM`;
    return <span className="block text-[10px] text-pl-warning-text" data-testid={`cp-rrv-edited-${field}`}>edited after intake (received {shown})</span>;
  };

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

  const openRrvPicker = async () => {
    setRrvList('loading');
    try { setRrvList(await listRrvPortfolioCandidates(supabase, { build: buildLabel() })); } catch (err) { setRrvList({ error: err.message }); }
  };

  const takeRrv = (contract) => {
    setFormData(fromProject(rrvIntakeProject(contract, { build: buildLabel() })));
    setRrvList(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    // a Risked Reserves project sends no spread and no risk score: those stay blank
    const blankable = (v) => (isRrv && (v === '' || v === null || v === undefined) ? null : parseFloat(v));
    const projectData = {
      user_id: user.id,
      name: formData.name,
      capex: parseFloat(formData.capex),
      npv_p10: blankable(formData.npv_p10),
      npv_p50: parseFloat(formData.npv_p50),
      npv_p90: blankable(formData.npv_p90),
      risk_score: blankable(formData.risk_score),
      pos: Math.min(100, Math.max(0, parseFloat(formData.pos))) / 100,
      fail_cost: Math.max(0, parseFloat(formData.fail_cost) || 0),
      npv_stddev: formData.npv_stddev != null ? Number(formData.npv_stddev) : null,
      source_type: formData.source_type,
      source_ref: formData.source_ref,
      source_label: formData.source_label,
    };

    const required = isRrv
      ? [projectData.capex, projectData.npv_p10, projectData.npv_p50, projectData.npv_p90, projectData.pos]
      : [projectData.capex, projectData.npv_p10, projectData.npv_p50, projectData.npv_p90, projectData.risk_score, projectData.pos];
    if (!projectData.name || required.some((v) => isNaN(v))) {
      toast({ variant: 'destructive', title: 'Please fill all fields correctly.' });
      return;
    }
    // EC5-0: the optimizer refuses a negative capex, so refuse it at the door.
    if (projectData.capex < 0) {
      toast({ variant: 'destructive', title: 'CAPEX cannot be negative', description: 'Enter a capital cost of 0 $MM or more.' });
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
      // a database that requires a value Risked Reserves Valuation does not send
      const notNull = isRrv && String(error.code) === '23502';
      toast({
        variant: 'destructive',
        title: 'Failed to save project',
        description: notNull
          ? `This database requires a value in every project for a field Risked Reserves Valuation does not provide (${error.message}). Nothing is filled in for it; the project was not saved.`
          : error.message,
      });
    } else {
      toast({ title: 'Success!', description: `Project ${project?.id ? 'updated' : 'created'}.` });
      onSave();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label htmlFor="name">Project Name</Label><Input id="name" name="name" value={formData.name} onChange={handleChange} required /></div>

      {/* Valuation source */}
      <div className="rounded-lg border border-pl-border p-3">
        <div className="flex items-center justify-between mb-2">
          <Label>Valuation</Label>
          {formData.source_type === 'epe_mc' || isRrv ? (
            <span className="text-xs text-pl-text bg-pl-sunken border border-pl-border rounded px-2 py-0.5 flex items-center gap-1" data-testid="cp-source-chip">
              <Link2 className="w-3 h-3" /> {isRrv ? (rrvLink?.label || 'Risked Reserves valuation') : formData.source_label}
              <button type="button" onClick={unlink} title="Unlink and edit manually" className="ml-1 text-pl-muted hover:text-pl-text" aria-label="Unlink and edit manually"><X className="w-3 h-3" /></button>
            </span>
          ) : (
            <span className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-primary-text hover:text-pl-primary-text-hover" onClick={openMcPicker}>
                <Link2 className="w-3 h-3 mr-1" /> Link EPE Monte Carlo run
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-primary-text hover:text-pl-primary-text-hover" onClick={openRrvPicker} data-testid="cp-rrv-pick">
                <Link2 className="w-3 h-3 mr-1" /> Take a Risked Reserves valuation
              </Button>
            </span>
          )}
        </div>
        {isRrv ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="npv_p90">{RRV_P90_LABEL} ($MM)</Label>
              <Input id="npv_p90" name="npv_p90" type="number" step="any" value={formData.npv_p90} onChange={handleChange} required data-testid="cp-rrv-p90" />
              {editedNote('npv_p90')}
            </div>
            <div>
              <Label htmlFor="npv_p50">{RRV_NPV_LABEL} ($MM)</Label>
              <Input id="npv_p50" name="npv_p50" type="number" step="any" value={formData.npv_p50} onChange={handleChange} required data-testid="cp-rrv-npv" />
              <span className="block text-[10px] text-pl-muted" data-testid="cp-rrv-npv-note">{RRV_NPV_NOTE}</span>
              {editedNote('npv_p50')}
            </div>
            <div>
              <Label htmlFor="npv_p10">{RRV_P10_LABEL} ($MM)</Label>
              <Input id="npv_p10" name="npv_p10" type="number" step="any" value={formData.npv_p10} onChange={handleChange} required data-testid="cp-rrv-p10" />
              {editedNote('npv_p10')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><Label htmlFor="npv_p90">NPV P90 ($MM)</Label><Input id="npv_p90" name="npv_p90" type="number" step="any" value={formData.npv_p90} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} required /></div>
            <div><Label htmlFor="npv_p50">NPV P50 ($MM)</Label><Input id="npv_p50" name="npv_p50" type="number" step="any" value={formData.npv_p50} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} required /></div>
            <div><Label htmlFor="npv_p10">NPV P10 ($MM)</Label><Input id="npv_p10" name="npv_p10" type="number" step="any" value={formData.npv_p10} onChange={handleChange} disabled={formData.source_type === 'epe_mc'} required /></div>
          </div>
        )}
        <p className="text-xs text-pl-muted mt-2">
          {isRrv
            ? `P90 and P10 sizes: ${RRV_SIZE_NOTE}. The portfolio risk summary reads this project's spread from them.`
            : 'Petroleum convention: P90 is the low case. Linked runs also carry the NPV standard deviation into portfolio risk.'}
        </p>
      </div>

      {isRrv && rrvLink && (
        <div className="rounded-lg border border-pl-border bg-pl-sunken p-3 text-xs" data-testid="cp-rrv-intake">
          <p className="font-semibold text-pl-text mb-1">From Risked Reserves Valuation</p>
          <dl className="space-y-0.5">
            {rrvProvenanceRows(rrvLink.contract, rrvLink).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-2"><dt className="w-48 shrink-0 text-pl-muted">{k}</dt><dd className="flex-1 min-w-[180px] text-pl-text">{v}</dd></div>
            ))}
          </dl>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="capex">{isRrv ? 'CAPEX: the well cost ($MM)' : 'CAPEX ($MM)'}</Label><Input id="capex" name="capex" type="number" min="0" step="any" value={formData.capex} onChange={handleChange} required />{isRrv && editedNote('capex')}</div>
        {isRrv ? (
          <div data-testid="cp-rrv-risk-score">
            <Label>Risk Score (1-10)</Label>
            <p className="text-xs text-pl-text mt-2">{RRV_RISK_SCORE_TEXT}</p>
            <p className="text-xs text-pl-muted">Chance of success Pg {rrvLink ? `${(rrvLink.contract.pg * 100).toFixed(1)}%` : EMPTY_VALUE}; commercial chance Pc {rrvLink ? `${(rrvLink.contract.pc * 100).toFixed(1)}%` : EMPTY_VALUE}</p>
          </div>
        ) : (
          <div><Label htmlFor="risk_score">Risk Score (1-10)</Label><Input id="risk_score" name="risk_score" type="number" min="1" max="10" value={formData.risk_score} onChange={handleChange} required /></div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label htmlFor="pos">{isRrv ? 'Chance of success Pg (%)' : 'Chance of success (%)'}</Label><Input id="pos" name="pos" type="number" min="0" max="100" step={isRrv ? 'any' : '1'} value={formData.pos} onChange={handleChange} required />{isRrv && editedNote('pos')}</div>
        <div><Label htmlFor="fail_cost">{isRrv ? 'Loss if it fails: the well ($MM)' : 'Loss if it fails ($MM)'}</Label><Input id="fail_cost" name="fail_cost" type="number" min="0" step="any" value={formData.fail_cost} onChange={handleChange} />{isRrv && editedNote('fail_cost')}</div>
      </div>
      <p className="text-xs text-pl-muted">
        {isRrv
          ? `The optimizer maximizes risked EMV: Pg times the ${RRV_NPV_LABEL.toLowerCase()}, minus the well cost weighted by the chance of a dry hole. As received, that is the valuation's EMV.`
          : 'The optimizer maximizes risked EMV: chance of success times NPV P50, minus the failure loss weighted by the failure chance.'}
      </p>

      {rrvList !== null && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3 max-h-56 overflow-y-auto" data-testid="cp-rrv-list">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-pl-text">Pick a saved Risked Reserves valuation</p>
            <button type="button" onClick={() => setRrvList(null)} className="text-pl-muted hover:text-pl-text" aria-label="Close valuation picker"><X className="w-4 h-4" /></button>
          </div>
          {rrvList === 'loading' && <p className="text-xs text-pl-muted">Reading your valuations.</p>}
          {rrvList?.error && <p className="text-xs text-pl-danger-text">{rrvList.error}</p>}
          {Array.isArray(rrvList) && rrvList.length === 0 && <p className="text-xs text-pl-muted">No saved valuations. Save one in Risked Reserves Valuation first.</p>}
          {Array.isArray(rrvList) && rrvList.map((x) => (
            x.ok ? (
              <button key={x.valuationId} type="button" onClick={() => takeRrv(x.contract)} className="w-full text-left py-1.5 px-2 rounded hover:bg-pl-sunken border-b border-pl-border" data-testid={`cp-rrv-option-${x.name}`}>
                <span className="text-sm text-pl-primary-text">{x.name}{x.contract.sharedFromColleague ? ' (shared with you)' : ''}</span>
                <span className="block text-xs text-pl-muted">
                  Pg {(x.contract.pg * 100).toFixed(1)}%, EMV {x.contract.emvMM.toFixed(1)} $MM, success-case mean {x.contract.successMeanValueMM.toFixed(1)} $MM, well {x.contract.wellCostMM.toFixed(1)} $MM
                </span>
              </button>
            ) : (
              <p key={x.valuationId} className="py-1.5 px-2 text-xs text-pl-muted border-b border-pl-border">{x.name}: {x.reason}</p>
            )
          ))}
        </div>
      )}

      {showMcPicker && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-pl-text">Pick a saved Monte Carlo run</p>
            <button type="button" onClick={() => setShowMcPicker(false)} className="text-pl-muted hover:text-pl-text" aria-label="Close run picker"><X className="w-4 h-4" /></button>
          </div>
          {(mcRuns || []).length === 0 && <p className="text-xs text-pl-muted">No saved runs. Run one from an EPE result's Risk tab first.</p>}
          {(mcRuns || []).map((run) => (
            <button key={run.id} type="button" onClick={() => linkMcRun(run)} className="w-full text-left py-1.5 px-2 rounded hover:bg-pl-sunken border-b border-pl-border">
              <span className="text-sm text-pl-primary-text">{run.epe_run_configs?.config_name || 'EPE run'}</span>
              <span className="block text-xs text-pl-muted">
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
