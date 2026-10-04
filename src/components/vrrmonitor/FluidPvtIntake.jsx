// The FVFs taken from a Fluid Systems Studio project (VRR-U1, RL11): choose a
// saved Fluid project (or arrive with ?fluidProject=<id>), state the pressure
// the constant set is read at (blank: the bubble point), take the table.
// The periods then follow the pressure history through the table (PVT mode
// "Fluid project table"); the shared PVT intake card says "source changed
// since" (content) and "edited after intake".
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { listFluidProjects, readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { vrrPvtIntake, vrrPvtCardFields } from '@/utils/vrr/pvtIntake';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const FluidPvtIntake = () => {
  const { inputs, takePvt, clearPvt, addNotification, u, canWrite } = useVrrMonitor();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get(PVT_PROJECT_PARAM) || inputs.pvtIntake?.from?.recordId || '');
  const [pressure, setPressure] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const intake = inputs.pvtIntake;

  useEffect(() => {
    let alive = true;
    listFluidProjects(supabase).then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, []);

  const take = async (id = projectId) => {
    setBusy(true);
    setMessage('');
    const read = await readFluidProjectBlock(readFluidProjectPvt, id);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const p = pressure.trim() === '' ? null : Number(pressure);
    const psia = p == null ? null : u.store('pressure', p);
    const res = vrrPvtIntake(read.block, { pressurePsia: Number.isFinite(psia) ? psia : null });
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takePvt(res.intake, res.constant);
    addNotification(`PVT table taken from "${read.projectName || 'the Fluid project'}": ${res.intake.table.length} pressures; the constant set read at ${Math.round(u.show('pressure', res.intake.pressure_psia))} ${u.label('pressure')}.`, 'success');
  };

  return (
    <section className="space-y-2 rounded-md border border-pl-border p-2" data-testid="vrr-fluid-intake">
      <div className="text-xs font-semibold text-pl-text">FVFs from a Fluid Systems Studio project</div>
      <div className="space-y-1">
        <Label htmlFor="vrr-fluid-project" className="text-xs text-pl-muted">Saved Fluid project</Label>
        <select
          id="vrr-fluid-project" data-testid="vrr-fluid-project" value={projectId}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => { setProjectId(e.target.value); setMessage(''); }}
        >
          <option value="">{projects == null ? 'Loading the projects' : (projects.length ? 'Choose a project' : 'No saved Fluid Systems Studio project')}</option>
          {projectId && !(projects || []).some((p) => p.id === projectId) && <option value={projectId}>Project named in the address</option>}
          {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vrr-fluid-pressure" className="text-xs text-pl-muted">Pressure for the constant set ({u.label('pressure')}; blank: the bubble point)</Label>
        <input
          id="vrr-fluid-pressure" data-testid="vrr-fluid-pressure" inputMode="decimal" value={pressure}
          className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => setPressure(e.target.value)}
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-8" disabled={!projectId || busy || !canWrite} onClick={() => take()} data-testid="vrr-fluid-take">
          Take the PVT table
        </Button>
        {intake && <Button size="sm" variant="ghost" className="h-8" onClick={clearPvt} disabled={!canWrite}>Drop it</Button>}
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid="vrr-fluid-message">{message}</p>}
      {intake && (
        <PvtIntakeCard
          intake={intake}
          current={inputs.fvf}
          fields={vrrPvtCardFields(intake)}
          readLatest={readFluidProjectPvt}
          onReread={() => take(intake.from?.recordId)}
          title="PVT taken from Fluid Systems Studio"
        />
      )}
      <p className="text-[11px] text-pl-muted">
        The table is kept with this project (Bg converted from RB/scf to RB/Mscf). With pressure surveys, each period&apos;s
        Bo, Bw, Bg and Rs are read from it at the period pressure; outside the table the constant set applies, never an
        extrapolation.
      </p>
    </section>
  );
};

export default FluidPvtIntake;
