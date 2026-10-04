// PVT from a Fluid Systems Studio project (RF-U1-010; RL11): choose a saved
// Fluid project (or arrive with ?fluidProject=<id>) and take, for oil, pb,
// Bob and muob at the bubble point and Boi, muoi, muwi at the initial
// pressure; for gas, zi and Bgi at pi and za at pa. The shared PVT intake
// card sits beside the values ("source changed since", "edited after intake").
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { listFluidProjects, readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { rfPvtIntake, rfPvtCurrent, rfPvtCardFields } from '@/utils/rfestimator/pvtIntake';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const PvtPanel = () => {
  const { inputs, pvtIntake, takePvt, addNotification, canWrite } = useRfEstimator();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(!!searchParams.get(PVT_PROJECT_PARAM));
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get(PVT_PROJECT_PARAM) || pvtIntake?.from?.recordId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    listFluidProjects(supabase).then(({ data }) => { if (alive) setProjects(data || []); });
    return () => { alive = false; };
  }, [open]);

  const current = useMemo(() => rfPvtCurrent(inputs), [inputs]);
  const fields = useMemo(() => rfPvtCardFields(pvtIntake), [pvtIntake]);
  const pi = num(inputs.corr.pi);
  const pa = num(inputs.corr.pa);

  const take = async () => {
    setBusy(true);
    setMessage('');
    const read = await readFluidProjectBlock(readFluidProjectPvt, projectId);
    setBusy(false);
    if (!read.ok) { setMessage(read.reason); return; }
    const res = rfPvtIntake(read.block, { phase: inputs.phase, piPsia: pi, paPsia: pa });
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takePvt(res.patch, res.intake);
    setOpen(false);
    addNotification(`PVT taken from "${read.projectName || 'the Fluid project'}": ${res.intake.fields.join(', ')}.${res.skipped.length ? ` Not taken: ${res.skipped.join('; ')}.` : ''}`, 'success');
  };

  return (
    <section className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-pvt-intake">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">PVT from Fluid Systems Studio</span>
        {canWrite && (
          <button type="button" className="text-[11px] underline text-pl-primary-text" onClick={() => setOpen((v) => !v)} data-testid="rf-pvt-open">
            {open ? 'Close' : 'Take by id'}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          <Label htmlFor="rf-fluid-project" className="text-xs text-pl-muted">Saved Fluid project</Label>
          <select id="rf-fluid-project" data-testid="rf-fluid-project" value={projectId}
            className="h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
            onChange={(e) => { setProjectId(e.target.value); setMessage(''); }}>
            <option value="">{projects == null ? 'Reading the projects' : (projects.length ? 'Choose a project' : 'No saved Fluid Systems Studio project')}</option>
            {projectId && !(projects || []).some((p) => p.id === projectId) && <option value={projectId}>Project named in the address</option>}
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
          </select>
          <p className="text-[10px] text-pl-muted">
            {inputs.phase === 'gas'
              ? 'Takes zi and Bgi at the initial pressure pi and za at the abandonment pressure pa of the method inputs.'
              : 'Takes pb, Bob and muob at the bubble point of the project, and Boi, muoi and muwi at the initial pressure pi of the method inputs.'}
            {' '}Values are read from the project table and never extrapolated.
          </p>
          <Button size="sm" variant="outline" className="h-8" disabled={!projectId || busy} onClick={take} data-testid="rf-fluid-take">Take the PVT</Button>
          {message && <p className="text-xs text-pl-danger-text" data-testid="rf-fluid-message">{message}</p>}
        </div>
      )}
      {pvtIntake && (
        <PvtIntakeCard intake={pvtIntake} current={current} fields={fields} readLatest={readFluidProjectPvt} title="PVT taken from Fluid Systems Studio" />
      )}
    </section>
  );
};

export default PvtPanel;
