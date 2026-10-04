// PVT from a Fluid Systems Studio project (WF-U1, RL11): choose a saved
// Fluid project (or arrive with ?fluidProject=<id>), state the reservoir
// pressure or leave it at the bubble point, take the viscosities, Bo, Bw,
// Bg and Rs, and keep the shared PVT intake card beside them ("source
// changed since" by content, "edited after intake"). Mounted on the Pattern
// and Surveillance tabs; one intake serves the whole project.
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { listFluidProjects, readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { wfPvtIntake, wfPvtCurrent, wfPvtCardFields } from '@/utils/waterflooddesign/pvtIntake';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { SectionLabel } from './primitives';

const PvtIntakePanel = ({ target = 'pattern' }) => {
  const { pvtIntake, takePvt, addNotification, u, displacementInputs, patternInputs, surveillanceConfig } = useWaterfloodDesign();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get(PVT_PROJECT_PARAM) || pvtIntake?.from?.recordId || '');
  const [pressure, setPressure] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    listFluidProjects(supabase).then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, []);

  const current = useMemo(() => wfPvtCurrent({ displacementInputs, patternInputs, surveillanceConfig }), [displacementInputs, patternInputs, surveillanceConfig]);
  const fields = useMemo(() => wfPvtCardFields(pvtIntake), [pvtIntake]);

  const take = async () => {
    setBusy(true);
    setMessage('');
    const read = await readFluidProjectBlock(readFluidProjectPvt, projectId);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const p = pressure.trim() === '' ? null : Number(pressure.replace(',', '.'));
    const psia = p == null ? null : u.store('pressure', p);
    const res = wfPvtIntake(read.block, { pressurePsia: Number.isFinite(psia) ? psia : null });
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takePvt(res.patch, res.intake);
    addNotification(`Viscosities and formation volume factors taken from "${read.projectName || 'the Fluid project'}" at ${res.intake.pressure_psia.toFixed(0)} psia (${res.intake.pressure_from}).`, 'success');
  };

  return (
    <section className="space-y-2" data-testid={`wds-pvt-intake-${target}`}>
      <SectionLabel>PVT from a Fluid Systems Studio project</SectionLabel>
      <div className="space-y-1">
        <Label htmlFor={`wds-fluid-project-${target}`} className="text-xs text-pl-muted">Saved Fluid project</Label>
        <select
          id={`wds-fluid-project-${target}`} data-testid="wds-fluid-project" value={projectId}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => { setProjectId(e.target.value); setMessage(''); }}
        >
          <option value="">{projects == null ? 'Loading the projects' : (projects.length ? 'Choose a project' : 'No saved Fluid Systems Studio project')}</option>
          {projectId && !(projects || []).some((p) => p.id === projectId) && <option value={projectId}>Project named in the address</option>}
          {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`wds-fluid-pressure-${target}`} className="text-xs text-pl-muted">Reservoir pressure ({u.label('pressure')}a; blank: the bubble point)</Label>
        <input
          id={`wds-fluid-pressure-${target}`} data-testid="wds-fluid-pressure" inputMode="decimal" value={pressure}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => setPressure(e.target.value)}
        />
      </div>
      <Button size="sm" variant="outline" className="h-8" disabled={!projectId || busy} onClick={take} data-testid="wds-fluid-take">
        Take viscosities and FVFs
      </Button>
      {message && <p className="text-xs text-pl-danger-text" data-testid="wds-fluid-message">{message}</p>}
      {pvtIntake && (
        <PvtIntakeCard intake={pvtIntake} current={current} fields={fields} readLatest={readFluidProjectPvt} title="PVT taken from Fluid Systems Studio" />
      )}
      <p className="text-[11px] text-pl-muted">
        One pressure serves the project: oil and water viscosities go to the Displacement tab, Bo and Bw to the Pattern tab,
        and Bo, Bw, Bg and Rs to the Surveillance voidage. All volume factors are reservoir barrels per stock-tank barrel
        (Bg per Mscf). Values are read from the project's own PVT table and are never extrapolated.
      </p>
    </section>
  );
};

export default PvtIntakePanel;
