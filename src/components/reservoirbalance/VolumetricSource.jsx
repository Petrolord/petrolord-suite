// The volumetric estimate of the case, taken from a saved ReservoirCalc Pro
// project by id (Batch B of the Material Balance Step 2 build). Left rail of
// the studio: shows the value on the case and where it came from, and lets
// the analyst take it from a saved project instead of typing it.
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useToast } from '@/components/ui/use-toast';
import { supabase as defaultClient } from '@/lib/customSupabaseClient';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { updateCase } from '@/pages/apps/reservoir-balance/lib/api';
import {
  listRcpProjects, volumetricOptions, intakeVolumetric, volumetricBasis,
} from '@/pages/apps/reservoir-balance/lib/rcpVolumetricIntake';
import { fmt } from '@/pages/apps/reservoir-balance/lib/reportModel';
import { EMPTY_VALUE } from '@/lib/emptyValue';

/** @param {{client?: object}} props the Supabase client (the harness and tests hand in their own) */
export default function VolumetricSource({ client = defaultClient }) {
  const {
    caseData, study, saveStudy, units, readOnlyReason, applyCasePatch,
  } = useMaterialBalanceStudio();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [optionKey, setOptionKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || projects) return;
    listRcpProjects(client).then(({ data, error }) => setProjects(error ? [] : data));
  }, [open, projects, client]);
  if (!caseData) return null;
  const isGas = caseData.fluid_system === 'gas';
  const value = Number(isGas ? caseData.volumetric_ogip_scf : caseData.volumetric_ooip_stb);
  const s = units.scaled(isGas ? 'gasVolume' : 'stockVolume', Number.isFinite(value) ? value : 0);
  const row = (projects ?? []).find((p) => p.id === projectId) ?? null;
  const options = row ? volumetricOptions(row) : [];
  const option = options.find((o) => o.key === optionKey) ?? options[0] ?? null;

  const take = async () => {
    const got = intakeVolumetric(row, option, { isGas });
    if (got.error) { toast({ title: 'Not taken', description: got.error, variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await updateCase(caseData.id, got.patch);
    if (!error) await saveStudy({ ...study, handoffs: { ...(study.handoffs ?? {}), volumetric: got.handoff } });
    setBusy(false);
    if (error) { toast({ title: 'Not taken', description: error.message, variant: 'destructive' }); return; }
    applyCasePatch(got.patch);
    setOpen(false);
    toast({ title: 'Volumetric estimate taken', description: got.patch.volumetric_estimate_source });
  };

  return (
    <section className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="mbal-volumetric">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">Volumetric estimate</span>
        {!readOnlyReason && (
          <button type="button" className="text-[11px] underline text-pl-primary-text hover:text-pl-primary-text-hover"
            onClick={() => setOpen((v) => !v)} data-testid="mbal-volumetric-from-rcp">
            {open ? 'Close' : 'Take from ReservoirCalc Pro'}
          </button>
        )}
      </div>
      <p className="text-sm font-pl-mono tabular-nums text-pl-text" data-testid="mbal-volumetric-value">
        {Number.isFinite(value) && value > 0 ? `${fmt(s.to(value), 2)} ${s.label}` : EMPTY_VALUE}
      </p>
      {Number.isFinite(value) && value > 0 && (
        <p className="text-[11px] text-pl-muted" data-testid="mbal-volumetric-source">{volumetricBasis(caseData, study)}</p>
      )}
      {open && (
        <div className="space-y-2 border-t border-pl-border pt-2" data-testid="mbal-volumetric-picker">
          {projects == null && <p className="text-[11px] text-pl-muted">Reading your saved projects.</p>}
          {projects != null && projects.length === 0 && <p className="text-[11px] text-pl-muted">No saved ReservoirCalc Pro project is readable from this account.</p>}
          {projects != null && projects.length > 0 && (
            <>
              <NativeSelect aria-label="ReservoirCalc Pro project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setOptionKey(''); }} data-testid="mbal-volumetric-project">
                <option value="">Choose a saved project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </NativeSelect>
              {row && options.length === 0 && <p className="text-[11px] text-pl-warning-text">This project has no deterministic result saved. Run it in ReservoirCalc Pro and save it first.</p>}
              {row && options.length > 0 && (
                <>
                  <NativeSelect aria-label="Reservoir" value={option?.key ?? ''} onChange={(e) => setOptionKey(e.target.value)} data-testid="mbal-volumetric-reservoir">
                    {options.map((o) => {
                      const v = isGas ? o.giip_scf : o.stooip_stb;
                      const sc = units.scaled(isGas ? 'gasVolume' : 'stockVolume', v ?? 0);
                      return <option key={o.key} value={o.key}>{o.reservoir}: {v ? `${fmt(sc.to(v), 2)} ${sc.label}` : `no ${isGas ? 'gas' : 'oil'} in place`}</option>;
                    })}
                  </NativeSelect>
                  <Button size="sm" disabled={busy} onClick={take} data-testid="mbal-volumetric-take">Take this volume</Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
