// Inputs from other Suite apps, read by id (EOR-U1, RL11): Fluid Systems
// Studio (pvt-1: gravity, viscosity at reservoir conditions, temperature,
// bubble point), Well Test Analysis Studio (wta-1: permeability, pressure)
// and Material Balance Studio (mbal-1: OOIP, last pressure). Each intake is
// kept with the project and shown on its card: the source, the time, the
// values received and now, "edited after intake" and "source changed since"
// (the source read again by id, compared by content).
// ?fluidProject=, ?wellTestProject= and ?mbalCase= name a project to take.
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { readWellTestProject, WTA_PROJECT_PARAM, WTA_TABLE } from '@/lib/wellTestSource';
import { readMbalCase } from '@/lib/mbalCaseSource';
import { readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import {
  eorPvtIntake, eorWtaIntake, eorMbalIntake, eorPvtCardFields, intakeCardModel, wtaFingerprint, mbalFingerprint,
} from '@/utils/eor/intakes';
import { INPUT_DEFS } from '@/utils/eor/reportModel';
import { useEorScreening } from '@/contexts/EorScreeningContext';
import EorField from './EorField';

export const MBAL_CASE_PARAM = 'mbalCase';
const LABELS = Object.fromEntries(INPUT_DEFS.map((d) => [d.key, d.label]));

const SOURCES = {
  pvt: { title: 'Fluid Systems Studio (pvt-1)', table: 'saved_fluid_studio_projects', name: 'project_name', param: PVT_PROJECT_PARAM, takes: 'Oil gravity, viscosity at reservoir conditions, temperature; bubble point for context' },
  wta: { title: 'Well Test Analysis Studio (wta-1)', table: WTA_TABLE, name: 'project_name', param: WTA_PROJECT_PARAM, takes: 'Permeability; average pressure for context' },
  mbal: { title: 'Material Balance Studio (mbal-1)', table: 'rb_cases', name: 'name', param: MBAL_CASE_PARAM, takes: 'OOIP and the last average pressure, for context' },
};

async function listProjects(table, nameCol) {
  try {
    const { data, error } = await supabase.from(table).select(`id, ${nameCol}, updated_at`).order('updated_at', { ascending: false });
    if (error) return [];
    return (data || []).map((r) => ({ id: r.id, name: r[nameCol] || 'Untitled', updatedAt: r.updated_at }));
  } catch {
    return [];
  }
}

const IntakeCard = ({ kind, intake }) => {
  const { inputs } = useEorScreening();
  const [latest, setLatest] = useState(null);
  const id = intake?.from?.recordId;
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    if (kind === 'wta') readWellTestProject(supabase, id).then((r) => alive && setLatest(r.ok ? { fp: wtaFingerprint(r.contract) } : { error: r.reason })).catch(() => {});
    if (kind === 'mbal') readMbalCase(supabase, id).then((r) => alive && setLatest(r.record ? { fp: mbalFingerprint(r.record) } : { error: r.error })).catch(() => {});
    return () => { alive = false; };
  }, [kind, id]);
  const current = { ...inputs.form, ...inputs.context };
  const m = intakeCardModel({ intake, current, labels: LABELS, latestFingerprint: latest?.fp || null, latestError: latest?.error || null });
  if (!m) return null;
  return (
    <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid={`eor-intake-card-${kind}`} data-status={m.status}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold">{m.source}</span>
        <span className={`rounded-full border px-2 py-0.5 ${m.status === 'As received' ? 'border-pl-success/40 bg-pl-success-bg text-pl-success-text' : 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text'}`}>{m.status}</span>
      </div>
      <p className="text-pl-muted">Saved {m.at || 'time not recorded'}; taken {m.takenAt || 'time not recorded'}.</p>
      <ul className="space-y-0.5">
        {m.rows.map((r) => (
          <li key={r.key} className={r.edited ? 'text-pl-warning-text' : ''}>
            {r.label}: {r.received ?? 'n/a'}{r.edited ? ` (now ${r.current ?? 'n/a'}, edited after intake)` : ''}. <span className="text-pl-muted">{r.method}</span>
          </li>
        ))}
      </ul>
      {m.changedSince && <p className="text-pl-warning-text" data-testid={`eor-intake-changed-${kind}`}>{m.changedSince}</p>}
      {m.unreadable && <p className="text-pl-muted">{m.unreadable}</p>}
    </div>
  );
};

const SourceBlock = ({ kind }) => {
  const s = SOURCES[kind];
  const { inputs, takeIntake, clearIntake, addNotification, canWrite, u } = useEorScreening();
  const [searchParams] = useSearchParams();
  const intake = inputs.intakes?.[kind] || null;
  const [list, setList] = useState(null);
  const [pick, setPick] = useState(searchParams.get(s.param) || intake?.from?.recordId || '');
  const [pressure, setPressure] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    listProjects(s.table, s.name).then((l) => alive && setList(l));
    return () => { alive = false; };
  }, [s.table, s.name]);

  const take = async () => {
    setBusy(true);
    setMessage('');
    let res;
    let name = null;
    try {
      if (kind === 'pvt') {
        const read = await readFluidProjectBlock(readFluidProjectPvt, pick);
        if (!read.ok) { setMessage(read.reason); return; }
        name = read.projectName;
        const p = pressure === '' ? null : Number(pressure);
        res = eorPvtIntake(read.block, { pressurePsia: Number.isFinite(p) ? p : null });
      } else if (kind === 'wta') {
        const read = await readWellTestProject(supabase, pick);
        if (!read.ok) { setMessage(read.reason); return; }
        name = read.projectName;
        res = eorWtaIntake(read.contract, { recordId: pick, recordName: read.projectName, updatedAt: read.updatedAt });
      } else {
        const read = await readMbalCase(supabase, pick);
        if (!read.record) { setMessage(read.error); return; }
        name = read.record.case?.name;
        res = eorMbalIntake(read.record);
      }
    } finally {
      setBusy(false);
    }
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takeIntake(kind, res);
    addNotification(`Taken from "${name || 'the project'}": ${res.intake.fields.map((f) => LABELS[f]?.replace(' (context, not screened)', '') || f).join(', ')}.`, 'success');
  };

  return (
    <section className="space-y-2" data-testid={`eor-intake-${kind}`}>
      <p className="text-xs font-semibold text-pl-text">{s.title}</p>
      <p className="text-[10px] text-pl-muted">{s.takes}</p>
      <div className="space-y-1">
        <Label htmlFor={`eor-pick-${kind}`} className="text-xs text-pl-muted">Saved project</Label>
        <select
          id={`eor-pick-${kind}`} data-testid={`eor-pick-${kind}`} value={pick} disabled={!canWrite}
          className="h-8 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text"
          onChange={(e) => { setPick(e.target.value); setMessage(''); }}
        >
          <option value="">{list == null ? 'Loading the projects' : (list.length ? 'Choose a project' : 'No saved project you can read')}</option>
          {pick && !(list || []).some((p) => p.id === pick) && <option value={pick}>Project named in the address</option>}
          {(list || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
        </select>
      </div>
      {kind === 'pvt' && (
        <EorField
          id="eor-pvt-pressure" label="Reservoir pressure for the viscosity (blank: the bubble point)" kind="pressure"
          value={pressure === '' ? '' : String(pressure)} onChange={(v) => setPressure(v)}
          hint={`Viscosity is read from the project's own PVT table at this pressure (${u.label('pressure')}); never extrapolated.`}
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-8" disabled={!pick || busy || !canWrite} onClick={take} data-testid={`eor-take-${kind}`}>
          Take values
        </Button>
        {intake && <Button size="sm" variant="ghost" className="h-8" disabled={!canWrite} onClick={() => clearIntake(kind)}>Forget the source</Button>}
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid={`eor-intake-message-${kind}`}>{message}</p>}
      {intake && kind === 'pvt' && (
        <PvtIntakeCard intake={intake} current={inputs.form} fields={eorPvtCardFields(intake)} readLatest={readFluidProjectPvt} title="PVT taken from Fluid Systems Studio" />
      )}
      {intake && kind !== 'pvt' && <IntakeCard kind={kind} intake={intake} />}
    </section>
  );
};

const EorIntakesPanel = () => {
  const kinds = useMemo(() => ['pvt', 'wta', 'mbal'], []);
  return (
    <Card className="h-fit" data-testid="eor-intakes">
      <CardHeader className="pb-3">
        <CardTitle className="text-pl-text text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-pl-primary-text" /> From other apps
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {kinds.map((k) => <SourceBlock key={k} kind={k} />)}
        <p className="text-[10px] text-pl-muted">
          Values are read from the saved project by id and kept with this project with their source. A value you change
          afterwards is marked as edited after intake; a source saved again with different content is marked as changed since.
        </p>
      </CardContent>
    </Card>
  );
};

export default EorIntakesPanel;
