// Average pressures of the data table from a saved Voidage Replacement
// Monitor project, read by id (Batch B, lib/vrrPressureIntake.js). Shown on
// the Data tab under the table: choose a project, see which rows its
// surveys land on and what would change, then take them.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { supabase as defaultClient } from '@/lib/customSupabaseClient';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { replaceProductionData } from '@/pages/apps/reservoir-balance/lib/api';
import { listVrrProjects, takeSurveys, pressureProvenance } from '@/pages/apps/reservoir-balance/lib/vrrPressureIntake';
import { fmt } from '@/pages/apps/reservoir-balance/lib/reportModel';

const DATA_KEYS = ['timestep_index', 'pressure_psia', 'cum_oil_stb', 'cum_gas_scf', 'cum_water_stb', 'cum_water_inj_stb', 'cum_gas_inj_scf', 'bo_rb_stb', 'rs_scf_stb', 'bg_rb_mscf', 'bw_rb_stb', 'z_factor', 'observation_date', 'observed_we_rb'];

/** @param {{client?: object}} props */
export default function VrrPressurePicker({ client = defaultClient }) {
  const { caseData, study, saveStudy, units, readOnlyReason, refreshCase } = useMaterialBalanceStudio();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || projects) return;
    listVrrProjects(client).then(({ data, error }) => setProjects(error ? [] : data));
  }, [open, projects, client]);
  const rows = useMemo(() => [...(caseData?.production_data ?? [])].sort((a, b) => a.timestep_index - b.timestep_index), [caseData]);
  const row = (projects ?? []).find((p) => p.id === projectId) ?? null;
  const plan = row ? takeSurveys(row, rows) : null;
  const taken = pressureProvenance(study, rows.map((r) => ({ timestep_index: r.timestep_index, pressure: r.pressure_psia })));
  if (!caseData) return null;
  const p = (v) => `${fmt(units.to('pressure', v), 1)} ${units.label('pressure')}`;

  const take = async () => {
    if (!plan || plan.error) return;
    setBusy(true);
    const clean = plan.rows.map((r) => Object.fromEntries(DATA_KEYS.map((k) => [k, r[k] ?? null])));
    const { error } = await replaceProductionData(caseData.id, clean);
    if (!error) await saveStudy({ ...study, handoffs: { ...(study.handoffs ?? {}), pressure_rows: plan.handoff } });
    setBusy(false);
    if (error) { toast({ title: 'Pressures not taken', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${plan.matches.length} pressure${plan.matches.length === 1 ? '' : 's'} taken`, description: 'Run the engine again: the data changed.' });
    setOpen(false);
    refreshCase();
  };

  return (
    <Card data-testid="mbal-vrr-pressures">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Pressures from Voidage Replacement Monitor</CardTitle>
          {!readOnlyReason && rows.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} data-testid="mbal-vrr-open">{open ? 'Close' : 'Choose a project'}</Button>
          )}
        </div>
        <CardDescription className="text-xs">
          Takes the average reservoir pressures typed on the Pressure tab of a saved VRR project, read by its id, onto the dated rows of this table. The report names the project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {taken && <p className="text-pl-muted" data-testid="mbal-vrr-taken">{taken.text}</p>}
        {open && (
          <>
            {projects == null && <p className="text-pl-muted">Reading your saved projects.</p>}
            {projects != null && projects.length === 0 && <p className="text-pl-muted">No saved Voidage Replacement Monitor project is readable from this account.</p>}
            {projects != null && projects.length > 0 && (
              <NativeSelect aria-label="VRR project" value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="mbal-vrr-project">
                <option value="">Choose a saved project</option>
                {projects.map((x) => <option key={x.id} value={x.id}>{x.project_name}</option>)}
              </NativeSelect>
            )}
            {plan?.error && <p className="text-pl-warning-text" data-testid="mbal-vrr-error">{plan.error}</p>}
            {plan && !plan.error && (
              <div className="space-y-1" data-testid="mbal-vrr-plan">
                {plan.matches.map((m) => (
                  <p key={m.timestep_index} className="font-pl-mono">Timestep {m.timestep_index}, {m.date}: {p(m.from)} becomes {p(m.to)} (survey {m.survey_date})</p>
                ))}
                {plan.unmatched.length > 0 && <p className="text-pl-muted">Surveys on no dated row of this case: {plan.unmatched.map((s) => s.date).join(', ')}.</p>}
                {plan.ambiguous.length > 0 && <p className="text-pl-muted">Surveys of a month with more than one row, left out: {plan.ambiguous.join(', ')}.</p>}
                <Button size="sm" disabled={busy} onClick={take} data-testid="mbal-vrr-take">Take these pressures</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
