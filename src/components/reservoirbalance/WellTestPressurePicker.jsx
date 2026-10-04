// The average pressure of a saved Well Test Analysis Studio project as a
// pressure point of the data table, read by id through wta-1 (WTA-U2-005,
// lib/wellTestPressureIntake.js). Shown on the Data tab under the VRR
// picker: choose a project, see the row its test date lands on, its method
// (p* or pi) and what would change, then take it. Nothing changes until
// the analyst takes the point.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { supabase as defaultClient } from '@/lib/customSupabaseClient';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { replaceProductionData } from '@/pages/apps/reservoir-balance/lib/api';
import { listWellTestProjects, takeWellTestPoint, wellTestPointProvenance } from '@/pages/apps/reservoir-balance/lib/wellTestPressureIntake';
import { fmt } from '@/pages/apps/reservoir-balance/lib/reportModel';

const DATA_KEYS = ['timestep_index', 'pressure_psia', 'cum_oil_stb', 'cum_gas_scf', 'cum_water_stb', 'cum_water_inj_stb', 'cum_gas_inj_scf', 'bo_rb_stb', 'rs_scf_stb', 'bg_rb_mscf', 'bw_rb_stb', 'z_factor', 'observation_date', 'observed_we_rb'];

/** @param {{client?: object}} props */
export default function WellTestPressurePicker({ client = defaultClient }) {
  const { caseData, study, saveStudy, units, readOnlyReason, refreshCase } = useMaterialBalanceStudio();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || projects) return;
    listWellTestProjects(client).then(({ data, error }) => setProjects(error ? [] : data));
  }, [open, projects, client]);
  const rows = useMemo(() => [...(caseData?.production_data ?? [])].sort((a, b) => a.timestep_index - b.timestep_index), [caseData]);
  const row = (projects ?? []).find((p) => p.id === projectId) ?? null;
  const plan = row ? takeWellTestPoint(row, rows) : null;
  const taken = wellTestPointProvenance(study, rows.map((r) => ({ timestep_index: r.timestep_index, pressure: r.pressure_psia })));
  if (!caseData) return null;
  const p = (v) => `${fmt(units.to('pressure', v), 1)} ${units.label('pressure')}`;

  const take = async () => {
    if (!plan || plan.error) return;
    setBusy(true);
    const clean = plan.rows.map((r) => Object.fromEntries(DATA_KEYS.map((k) => [k, r[k] ?? null])));
    const { error } = await replaceProductionData(caseData.id, clean);
    if (!error) await saveStudy({ ...study, handoffs: { ...(study.handoffs ?? {}), [plan.key]: plan.handoff } });
    setBusy(false);
    if (error) { toast({ title: 'Pressures not taken', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Pressure point taken at timestep ${plan.match.timestep_index}`, description: 'Run the engine again: the data changed.' });
    setOpen(false);
    refreshCase();
  };

  return (
    <Card data-testid="mbal-wta-pressures">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Pressure point from Well Test Analysis Studio</CardTitle>
          {!readOnlyReason && rows.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} data-testid="mbal-wta-open">{open ? 'Close' : 'Choose a project'}</Button>
          )}
        </div>
        <CardDescription className="text-xs">
          Takes the average pressure of a saved well test (p* of its Horner line, or the initial pressure it states), read by its id, onto the row of this table dated on the day of the test. The report names the project, the method and the date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {taken && <p className="text-pl-muted" data-testid="mbal-wta-taken">{taken.text}</p>}
        {open && (
          <>
            {projects == null && <p className="text-pl-muted">Reading your saved projects.</p>}
            {projects != null && projects.length === 0 && <p className="text-pl-muted">No saved Well Test Analysis Studio project is readable from this account.</p>}
            {projects != null && projects.length > 0 && (
              <NativeSelect aria-label="Well test project" value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="mbal-wta-project">
                <option value="">Choose a saved project</option>
                {projects.map((x) => <option key={x.id} value={x.id}>{x.project_name}</option>)}
              </NativeSelect>
            )}
            {plan?.error && <p className="text-pl-warning-text" data-testid="mbal-wta-error">{plan.error}</p>}
            {plan && !plan.error && (
              <div className="space-y-1" data-testid="mbal-wta-plan">
                <p className="font-pl-mono">Timestep {plan.match.timestep_index}, {plan.match.date}: {p(plan.match.from)} becomes {p(plan.match.to)} ({plan.point.label}, {plan.point.basis})</p>
                <p className="text-pl-muted">{plan.point.method}</p>
                <Button size="sm" disabled={busy} onClick={take} data-testid="mbal-wta-take">Take this pressure point</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
