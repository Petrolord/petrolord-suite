// The Model Builder's two intakes (SIM-U1-003/004, RL11): PVT from a saved
// Fluid Systems Studio project and kr with Pc from a saved SCAL Studio
// project, both read by id. `?fluidProject=<id>` and `?scalProject=<id>` in
// the address preselect a project (a send from the other app, or a reload).
// The shared cards say where the values came from, "source changed since"
// (by content) and "edited after intake".
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { readScalProjectKr, KR_PROJECT_PARAM } from '@/lib/krSource';
import { listFluidProjects, readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import { listScalProjects } from '@/lib/simService';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import KrIntakeCard from '@/lib/inputProvenance/KrIntakeCard';
import {
  takePvtIntoForm, dropPvtIntake, takeKrIntoForm, dropKrIntake, SIM_PVT_FIELDS, SIM_KR_FIELDS, krCurrentValues,
} from '@/utils/simstudio/builderIntakes';

const selectCls = 'h-8 w-full rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text';

function ProjectPicker({ id, label, projects, value, onChange, addressNamed }) {
  return (
    <div className="space-y-1 min-w-[220px] flex-1">
      <Label htmlFor={id} className="text-[11px] text-pl-muted">{label}</Label>
      <select id={id} data-testid={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        <option value="">{projects == null ? 'Loading the projects' : (projects.length ? 'Choose a project' : 'No saved project')}</option>
        {value && addressNamed && !(projects || []).some((p) => p.id === value) && <option value={value}>Project named in the address</option>}
        {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
      </select>
    </div>
  );
}

/** PVT source: the builder's typed correlation inputs, or a Fluid Systems Studio block. */
export function FluidIntake({ form, setForm, canWrite, addNotification }) {
  const [searchParams] = useSearchParams();
  const named = searchParams.get(PVT_PROJECT_PARAM);
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(named || form.pvtSource?.intake?.from?.recordId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mode = form.pvtSource?.mode === 'fluid' ? 'fluid' : 'correlation';
  useEffect(() => {
    let alive = true;
    listFluidProjects(supabase).then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, []);

  const take = async (id = projectId) => {
    setBusy(true); setMessage('');
    const read = await readFluidProjectBlock(readFluidProjectPvt, id);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const res = takePvtIntoForm(form, read.block);
    if (!res.ok) { setMessage(res.errors.join(' ')); return; }
    setForm(res.form);
    addNotification(`PVT taken from "${read.projectName || 'the Fluid project'}": ${res.rows.pvtoRecords.length} PVTO records, ${res.rows.pvdg.length} PVDG rows, PVTW at ${Math.round(res.rows.pvtw.pref)} psia.`, 'success');
  };

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-pl-border" data-testid="sim-fluid-intake">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 w-64">
          <Label htmlFor="sim-pvt-source" className="text-[11px] text-pl-muted">PVT source</Label>
          <select id="sim-pvt-source" data-testid="sim-pvt-source" className={selectCls} value={mode} disabled={!canWrite}
            onChange={(e) => { if (e.target.value === 'correlation') setForm((f) => dropPvtIntake(f)); }}>
            <option value="correlation">Typed inputs, correlations in the builder</option>
            <option value="fluid" disabled={mode !== 'fluid'}>Fluid Systems Studio project (take one below)</option>
          </select>
        </div>
        <ProjectPicker id="sim-fluid-project" label="Saved Fluid Systems Studio project" projects={projects} value={projectId}
          onChange={(v) => { setProjectId(v); setMessage(''); }} addressNamed={!!named} />
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!projectId || busy || !canWrite} onClick={() => take()} data-testid="sim-fluid-take">
          Take the PVT table
        </Button>
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid="sim-fluid-message">{message}</p>}
      {mode === 'fluid' && form.pvtSource.intake && (
        <PvtIntakeCard
          intake={form.pvtSource.intake}
          current={{ ...form.fluid, pb: form.pvtSource.intake.values?.pb }}
          fields={SIM_PVT_FIELDS}
          readLatest={readFluidProjectPvt}
          onReread={canWrite ? () => take(form.pvtSource.intake.from?.recordId) : null}
          title="PVT taken from Fluid Systems Studio"
        />
      )}
      <p className="text-[11px] text-pl-muted">
        {mode === 'fluid'
          ? 'PVTO, PVDG and PVTW are the rows of the project\'s PVT table, written as Fluid Systems Studio exports them; the oil and gas surface densities use its gravities. The typed fluid and water fields above show what was received and are not used.'
          : 'PVTO and PVDG are computed in the builder from the typed oil API, gas gravity, temperature and GOR with the black-oil correlations of Fluid Systems Studio (Standing for Pb, Rs and Bo; Beggs-Robinson viscosity; Dranchuk-Abou-Kassem Z); the bubble point is solved from the GOR. PVTW is typed.'}
      </p>
    </div>
  );
}

/** kr source: typed Corey numbers, or a SCAL Studio kr-1 block. */
export function ScalIntake({ form, setForm, canWrite, addNotification }) {
  const [searchParams] = useSearchParams();
  const named = searchParams.get(KR_PROJECT_PARAM);
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(named || form.krSource?.intake?.from?.recordId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mode = form.krSource?.mode === 'scal' ? 'scal' : 'typed';
  useEffect(() => {
    let alive = true;
    listScalProjects().then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, []);

  const take = async (id = projectId) => {
    setBusy(true); setMessage('');
    const read = await readScalProjectKr(id);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const res = takeKrIntoForm(form, { ...read.contract, project_id: read.contract.project_id ?? id, project_name: read.contract.project_name ?? read.projectName });
    if (!res.ok) { setMessage(res.errors.join(' ')); return; }
    setForm(res.form);
    addNotification(`Relative permeability taken from "${read.projectName || 'the SCAL project'}".${res.warnings.length ? ` ${res.warnings.join(' ')}` : ''}`, res.warnings.length ? 'info' : 'success');
  };

  return (
    <div className="space-y-2 mb-3 pb-3 border-b border-pl-border" data-testid="sim-scal-intake">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 w-64">
          <Label htmlFor="sim-kr-source" className="text-[11px] text-pl-muted">Saturation function source</Label>
          <select id="sim-kr-source" data-testid="sim-kr-source" className={selectCls} value={mode} disabled={!canWrite}
            onChange={(e) => { if (e.target.value === 'typed') setForm((f) => dropKrIntake(f)); }}>
            <option value="typed">Typed Corey parameters</option>
            <option value="scal" disabled={mode !== 'scal'}>SCAL Studio project (take one below)</option>
          </select>
        </div>
        <ProjectPicker id="sim-scal-project" label="Saved SCAL Studio project" projects={projects} value={projectId}
          onChange={(v) => { setProjectId(v); setMessage(''); }} addressNamed={!!named} />
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!projectId || busy || !canWrite} onClick={() => take()} data-testid="sim-scal-take">
          Take the curves
        </Button>
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid="sim-scal-message">{message}</p>}
      {mode === 'scal' && form.krSource.intake && (
        <KrIntakeCard
          intake={form.krSource.intake}
          current={krCurrentValues(form)}
          fields={SIM_KR_FIELDS}
          readLatest={readScalProjectKr}
          title="Saturation functions taken from SCAL Studio"
        />
      )}
      {mode === 'scal' && form.krSource.intake?.goSwcAdjusted && (
        <p className="text-[11px] text-pl-warning-text" data-testid="sim-go-swc-adjusted">
          The gas-oil set was saved at Swc {form.krSource.intake.goSwcAdjusted.from}; the deck writes it at the oil-water Swc {form.krSource.intake.goSwcAdjusted.to} (the simulator takes one connate water), so its curves move. Make the two equal in SCAL Studio to keep them.
        </p>
      )}
      <p className="text-[11px] text-pl-muted">
        {mode === 'scal'
          ? 'SWOF and SGOF are written as SCAL Studio exports them: the Corey sets below (editable; an edit is marked on the card and in the report) and Pcow from the Leverett J with its own Swirr. Pcog is zero.'
          : 'SWOF and SGOF are built from the typed Corey parameters. With capillary pressure on, Pcow comes from the typed Leverett J; a blank Swirr is taken as Swc.'}
      </p>
    </div>
  );
}
