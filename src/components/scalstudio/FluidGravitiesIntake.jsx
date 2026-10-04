// The gravities of the saturation-height conversion taken from a Fluid
// Systems Studio project (SCAL-U2-005): choose a saved Fluid project (or
// arrive with ?fluidProject=<id>), state the reservoir pressure or leave it
// at the bubble point, take the densities, and keep the shared PVT intake
// card beside them ("source changed since" by content, "edited after
// intake"). The interfacial tension is not in the pvt-1 block.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { KPA_PER_PSI } from '@/lib/units/registry';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { listFluidProjects, readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { scalPvtIntake, SCAL_PVT_FIELDS, IFT_NOT_IN_PVT } from '@/utils/scalstudio/pvtGravities';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { SectionLabel } from '@/components/waterflooddesign/primitives';

const FluidGravitiesIntake = () => {
  const { height, pvtIntake, takeFluidGravities, addNotification, u } = useScalStudio();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get(PVT_PROJECT_PARAM) || '');
  const [pressure, setPressure] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    listFluidProjects(supabase).then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, []);

  const take = async () => {
    setBusy(true);
    setMessage('');
    const read = await readFluidProjectBlock(readFluidProjectPvt, projectId);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const p = pressure.trim() === '' ? null : Number(pressure);
    const psia = p == null ? null : (u.system === 'si' ? p / KPA_PER_PSI : p);
    const res = scalPvtIntake(read.block, { pressurePsia: Number.isFinite(psia) ? psia : null });
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takeFluidGravities(res.patch, res.intake);
    addNotification(`Water and oil gravities taken from "${read.projectName || 'the Fluid project'}" at ${res.intake.pressure_psia.toFixed(0)} psia. ${IFT_NOT_IN_PVT}`, 'success');
  };

  return (
    <section className="space-y-2" data-testid="scal-fluid-intake">
      <SectionLabel>Gravities from a Fluid Systems Studio project</SectionLabel>
      <div className="space-y-1">
        <Label htmlFor="scal-fluid-project" className="text-xs text-pl-muted">Saved Fluid project</Label>
        <select
          id="scal-fluid-project" data-testid="scal-fluid-project" value={projectId}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => { setProjectId(e.target.value); setMessage(''); }}
        >
          <option value="">{projects == null ? 'Loading the projects' : (projects.length ? 'Choose a project' : 'No saved Fluid Systems Studio project')}</option>
          {projectId && !(projects || []).some((p) => p.id === projectId) && <option value={projectId}>Project named in the address</option>}
          {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="scal-fluid-pressure" className="text-xs text-pl-muted">Reservoir pressure ({u.system === 'si' ? 'kPa' : 'psia'}; blank: the bubble point)</Label>
        <input
          id="scal-fluid-pressure" data-testid="scal-fluid-pressure" inputMode="decimal" value={pressure}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => setPressure(e.target.value)}
        />
      </div>
      <Button size="sm" variant="outline" className="h-8" disabled={!projectId || busy} onClick={take} data-testid="scal-fluid-take">
        Take the water and oil gravities
      </Button>
      {message && <p className="text-xs text-pl-danger-text" data-testid="scal-fluid-message">{message}</p>}
      {pvtIntake && (
        <PvtIntakeCard
          intake={pvtIntake}
          current={{ gammaW: height.gammaW, gammaHc: height.gammaHc }}
          fields={SCAL_PVT_FIELDS}
          readLatest={readFluidProjectPvt}
          title="Gravities taken from Fluid Systems Studio"
        />
      )}
      <p className="text-[11px] text-pl-muted">
        The oil density is the stock-tank oil plus its dissolved gas over Bo, and the brine density the standard density
        for the salinity over Bw, at the pressure above. {IFT_NOT_IN_PVT}
      </p>
    </section>
  );
};

export default FluidGravitiesIntake;
