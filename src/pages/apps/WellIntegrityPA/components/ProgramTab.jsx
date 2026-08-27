// Program tab: flow zones, per-zone two-barrier compliance, the phased
// abandonment step list with the material takeoff, the Economics
// decommissioning cross-link and the immutable run history.

import React from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Save, ExternalLink } from 'lucide-react';
import { depthDisp, depthStore, depthLabel } from '../services/wiRun';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

const PHASE_LABELS = { 1: 'Phase 1: reservoir/zone barriers', 2: 'Phase 2: intermediate', 3: 'Phase 3: surface' };

export default function ProgramTab({
  caseDraft, onCaseChange, res, depthUnit, onSaveRun, savingRun, runs, onDeleteRun,
}) {
  const zones = caseDraft.pa.zones || [];
  const program = res?.program || null;
  const unit = depthLabel(depthUnit);

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title={`Zones with flow potential (MD, ${unit})`} testId="wi-zones-card">
          <div className="flex flex-col gap-1">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input className="h-7 flex-1 text-xs" value={z.name}
                  onChange={(e) => onCaseChange((d) => { d.pa.zones[i].name = e.target.value; })} />
                <Input className="h-7 w-20 text-right text-xs" type="number" step={10} title={`top MD (${unit})`}
                  value={Math.round(depthDisp(z.topMdM, depthUnit))} data-testid={`wi-zone-top-${i}`}
                  onChange={(e) => onCaseChange((d) => { d.pa.zones[i].topMdM = depthStore(num(e.target.value), depthUnit); })} />
                <Input className="h-7 w-20 text-right text-xs" type="number" step={10} title={`bottom MD (${unit})`}
                  value={Math.round(depthDisp(z.bottomMdM, depthUnit))}
                  onChange={(e) => onCaseChange((d) => { d.pa.zones[i].bottomMdM = depthStore(num(e.target.value), depthUnit); })} />
                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                  <input type="checkbox" checked={!!z.flowPotential}
                    onChange={(e) => onCaseChange((d) => { d.pa.zones[i].flowPotential = e.target.checked; })} />
                  flow
                </label>
                <button type="button" className="text-slate-500 hover:text-red-400"
                  onClick={() => onCaseChange((d) => { d.pa.zones.splice(i, 1); })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" data-testid="wi-add-zone"
            className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
            onClick={() => onCaseChange((d) => {
              d.pa.zones.push({ name: `Zone ${d.pa.zones.length + 1}`, topMdM: 1500, bottomMdM: 1550, flowPotential: true });
            })}>
            <Plus className="h-3 w-3" /> Add zone
          </button>
        </Card>

        {program && (
          <Card title="Two-barrier compliance" testId="wi-compliance-card">
            <div className="mb-2 flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${program.pass ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}
                data-testid="wi-program-pass">
                {program.pass ? 'PROGRAM COMPLIANT' : 'GAPS IN THE PROGRAM'}
              </span>
            </div>
            {program.zoneCompliance.map((z, i) => (
              <div key={z.zone} className="mb-2 text-xs" data-testid={`wi-zone-comp-${i}`}>
                <div className="flex items-center gap-2">
                  <span className={z.pass ? 'text-emerald-400' : 'text-red-400'}>{z.pass ? 'PASS' : 'FAIL'}</span>
                  <span className="font-semibold text-slate-300">{z.zone}</span>
                </div>
                <div className="ml-6 text-slate-400">
                  Primary (covers the source): {z.primaryQualifying.length ? z.primaryQualifying.join(', ') : 'none'}
                </div>
                <div className="ml-6 text-slate-400">
                  Secondary (backs up from above): {z.secondaryQualifying.length ? z.secondaryQualifying.join(', ') : 'none'}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <span className={program.surfacePlug.pass ? 'text-emerald-400' : 'text-red-400'}>
                {program.surfacePlug.pass ? 'PASS' : 'FAIL'}
              </span>
              <span className="text-slate-400">Surface/environmental plug</span>
            </div>
          </Card>
        )}

        <Card title="Decommissioning cost" testId="wi-econ-card">
          <div className="text-xs text-slate-400">
            Cost the abandonment program (rig days, plugs, logistics) in Petroleum Economics
            Studio with its decommissioning template.
          </div>
          <Link to="/dashboard/apps/economics/epe/cases"
            className="mt-2 inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300 hover:bg-slate-700">
            <ExternalLink className="h-3 w-3" /> Open Economics Studio
          </Link>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {program && (
          <Card title="Abandonment program (planning checklist)" testId="wi-steps-card">
            {[1, 2, 3].map((phase) => (
              <div key={phase} className="mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{PHASE_LABELS[phase]}</div>
                <ol className="ml-4 list-decimal text-xs text-slate-300">
                  {program.steps.filter((s) => s.phase === phase).map((s) => (
                    <li key={s.step} className="py-0.5">{s.description}</li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="border-t border-slate-800 pt-2 text-xs text-slate-300">
              Designed slurry total
              <span className="float-right font-mono" data-testid="wi-takeoff-slurry">
                {program.takeoff.slurryM3.toFixed(2)} m3
              </span>
            </div>
            {program.takeoff.undesignedPlugs.length > 0 && (
              <div className="mt-1 text-[10px] text-amber-400" data-testid="wi-undesigned">
                No placement geometry yet: {program.takeoff.undesignedPlugs.join(', ')}.
              </div>
            )}
            <div className="mt-2 text-[10px] text-slate-500">
              A planning checklist in the well programme tradition, not an operational procedure;
              verification (tag, pressure test, logs) is stated per step and recorded by operations.
            </div>
          </Card>
        )}

        <Card title="Run history (immutable)" testId="wi-runs-card">
          <Button size="sm" variant="outline" className="mb-2 h-7 text-xs" disabled={savingRun || !res}
            onClick={onSaveRun} data-testid="wi-save-run">
            <Save className="mr-1 h-3 w-3" /> {savingRun ? 'Saving...' : 'Save run'}
          </Button>
          {(runs || []).map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-t border-slate-800 py-1 text-xs text-slate-400"
              data-testid="wi-run-row">
              <span>{new Date(r.created_at).toLocaleString()}</span>
              <span className="font-mono">{r.summary?.category}</span>
              <span className="font-mono">{r.summary?.status}</span>
              <button type="button" className="ml-auto text-slate-500 hover:text-red-400"
                onClick={() => onDeleteRun(r.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {(runs || []).length === 0 && <div className="text-xs text-slate-500">No saved runs yet.</div>}
        </Card>
      </div>
    </div>
  );
}
