// Inputs from other Suite apps, read by id (WS-U1, RL11): Fluid Systems
// Studio (pvt-1: Bo and viscosity at the reservoir pressure, GOR, gravities,
// temperature), Well Test Analysis Studio (wta-1: permeability, skin,
// average pressure), Material Balance Studio (mbal-1: OOIP for the in-place
// cross-check), Decline Curve Analysis (dca-forecast-1: one well's EUR for
// the drainage-area cross-check) and the wells registry (names and surface
// locations for the map and the spacing the wells already have). Each intake
// is kept with the project and shown on its card: the source, the time, the
// values received and now, "edited after intake" and "source changed since".
// ?fluidProject=, ?wellTestProject=, ?mbalCase= and ?dcaProject= name a
// record to take.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { readFluidProjectPvt, PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { readWellTestProject, WTA_PROJECT_PARAM, WTA_TABLE } from '@/lib/wellTestSource';
import { readMbalCase } from '@/lib/mbalCaseSource';
import { readRfProject, RF_PROJECT_PARAM, RF_TABLE } from '@/lib/rfEstimateSource';
import { listWells } from '@/lib/wellsRegistry';
import { listDcaForecasts, getDcaForecast } from '@/utils/declineCurve/dcaForecastService';
import { readFluidProjectBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import {
  wsPvtIntake, wsWtaIntake, wsMbalIntake, wsDcaIntake, wsRfIntake, wsWellsIntake, intakeCardModel, wtaFingerprint, mbalFingerprint, dcaFingerprint, rfFingerprint, PVT_FIELDS,
} from '@/utils/wellspacing/intakes';
import { FIELDS } from '@/utils/wellspacing/model';
import { useWellSpacing } from '@/contexts/WellSpacingContext';

export const MBAL_CASE_PARAM = 'mbalCase';
export const DCA_PROJECT_PARAM = 'dcaProject';
// the card prints what was received, in the stored (oilfield) units
const STORED_UNIT = { permeability: 'md', reservoirPressure: 'psia', ooipStb: 'STB', dcaEurStb: 'STB', skin: '', recoveryFactor: '%' };
const LABELS = {
  ...Object.fromEntries(FIELDS.map((d) => [d.key, `${d.label}${STORED_UNIT[d.key] ? ` (${STORED_UNIT[d.key]})` : ''}`])),
  ooipStb: 'OOIP (STB)', dcaEurStb: 'EUR of the well (STB)',
};

const SOURCES = {
  pvt: { title: 'Fluid Systems Studio (pvt-1)', table: 'saved_fluid_studio_projects', name: 'project_name', param: PVT_PROJECT_PARAM, takes: 'Bo and oil viscosity at the average reservoir pressure, solution GOR, gravities, temperature' },
  wta: { title: 'Well Test Analysis Studio (wta-1)', table: WTA_TABLE, name: 'project_name', param: WTA_PROJECT_PARAM, takes: 'Permeability, total skin, average pressure' },
  mbal: { title: 'Material Balance Studio (mbal-1)', table: 'rb_cases', name: 'name', param: MBAL_CASE_PARAM, takes: 'OOIP, for the in-place cross-check' },
  // WS-U2-005: the oil recovery factor with its method
  rf: { title: 'Recovery Factor Estimator (rf-1)', table: RF_TABLE, name: 'project_name', param: RF_PROJECT_PARAM, takes: 'The oil recovery factor with its method and source, given to each well over its drained area' },
  dca: { title: 'Decline Curve Analysis (dca-forecast-1)', param: DCA_PROJECT_PARAM, takes: 'One well\'s oil EUR, for the drainage area it implies' },
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

async function listDcaOptions() {
  try {
    const all = await listDcaForecasts(supabase);
    return all.filter((f) => f.stream === 'oil').map((f) => ({
      id: `${f.projectId}::${f.wellId}`, name: `${f.projectName || 'Untitled'}: ${f.wellName || 'well'}${f.ok ? '' : ' (cannot be sent)'}`, ok: f.ok, contract: f.contract || null, reason: f.reason || null,
    }));
  } catch {
    return [];
  }
}

const IntakeCard = ({ kind, intake }) => {
  const { inputs } = useWellSpacing();
  const [latest, setLatest] = useState(null);
  const id = intake?.from?.recordId;
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    if (kind === 'wta') readWellTestProject(supabase, id).then((r) => alive && setLatest(r.ok ? { fp: wtaFingerprint(r.contract) } : { error: r.reason })).catch(() => {});
    if (kind === 'rf') readRfProject(supabase, id).then((r) => alive && setLatest(r.ok ? { fp: rfFingerprint(r.contract) } : { error: r.reason })).catch(() => {});
    if (kind === 'mbal') readMbalCase(supabase, id).then((r) => alive && setLatest(r.record ? { fp: mbalFingerprint(r.record) } : { error: r.error })).catch(() => {});
    if (kind === 'dca' && intake.from.wellId) {
      getDcaForecast(supabase, { projectId: id, wellId: intake.from.wellId, stream: 'oil' })
        .then((r) => alive && setLatest(r?.ok ? { fp: dcaFingerprint(r.contract) } : { error: r?.reason || 'The forecast is no longer in the project.' })).catch(() => {});
    }
    return () => { alive = false; };
  }, [kind, id, intake]);
  const current = { ...inputs.form, ...inputs.context };
  const m = intakeCardModel({ intake, current, labels: LABELS, latestFingerprint: latest?.fp || null, latestError: latest?.error || null });
  if (!m) return null;
  return (
    <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid={`ws-intake-card-${kind}`} data-status={m.status}>
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
      {m.changedSince && <p className="text-pl-warning-text" data-testid={`ws-intake-changed-${kind}`}>{m.changedSince}</p>}
      {m.unreadable && <p className="text-pl-muted">{m.unreadable}</p>}
    </div>
  );
};

const SELECT = 'h-8 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text';

const SourceBlock = ({ kind }) => {
  const s = SOURCES[kind];
  const { inputs, takeIntake, clearIntake, addNotification, canWrite, u } = useWellSpacing();
  const [searchParams] = useSearchParams();
  const intake = inputs.intakes?.[kind] || null;
  const [list, setList] = useState(null);
  const [pick, setPick] = useState(searchParams.get(s.param) || (intake?.from?.recordId ? (kind === 'dca' ? `${intake.from.recordId}::${intake.from.wellId}` : intake.from.recordId) : ''));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    (kind === 'dca' ? listDcaOptions() : listProjects(s.table, s.name)).then((l) => alive && setList(l));
    return () => { alive = false; };
  }, [kind, s.table, s.name]);

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
        const p = Number(inputs.form.reservoirPressure);
        res = wsPvtIntake(read.block, { pressurePsia: inputs.form.reservoirPressure !== '' && Number.isFinite(p) ? p : null });
      } else if (kind === 'wta') {
        const read = await readWellTestProject(supabase, pick);
        if (!read.ok) { setMessage(read.reason); return; }
        name = read.projectName;
        res = wsWtaIntake(read.contract, { recordId: pick, recordName: read.projectName, updatedAt: read.updatedAt });
      } else if (kind === 'rf') {
        const read = await readRfProject(supabase, pick);
        if (!read.ok) { setMessage(read.reason); return; }
        name = read.projectName;
        res = wsRfIntake(read.contract, { projectId: pick, projectName: read.projectName, updatedAt: read.updatedAt });
      } else if (kind === 'mbal') {
        const read = await readMbalCase(supabase, pick);
        if (!read.record) { setMessage(read.error); return; }
        name = read.record.case?.name;
        res = wsMbalIntake(read.record);
      } else {
        const opt = (list || []).find((o) => o.id === pick);
        const [projectId, wellId] = pick.split('::');
        const fresh = await getDcaForecast(supabase, { projectId, wellId, stream: 'oil' });
        const c = fresh?.ok ? fresh.contract : opt?.contract;
        if (!c) { setMessage(fresh?.reason || opt?.reason || 'The forecast could not be read.'); return; }
        name = `${c.projectName}: ${c.source?.wellName}`;
        res = wsDcaIntake(c);
      }
    } finally {
      setBusy(false);
    }
    if (!res.ok) { setMessage(res.errors[0]); return; }
    takeIntake(kind, res);
    addNotification(`Taken from "${name || 'the project'}": ${res.intake.fields.map((f) => LABELS[f] || f).join(', ')}.`, 'success');
  };

  return (
    <section className="space-y-2" data-testid={`ws-intake-${kind}`}>
      <p className="text-xs font-semibold text-pl-text">{s.title}</p>
      <p className="text-[10px] text-pl-muted">{s.takes}</p>
      <div className="space-y-1">
        <Label htmlFor={`ws-pick-${kind}`} className="text-xs text-pl-muted">{kind === 'dca' ? 'Saved forecast' : 'Saved project'}</Label>
        <select id={`ws-pick-${kind}`} data-testid={`ws-pick-${kind}`} value={pick} disabled={!canWrite} className={SELECT} onChange={(e) => { setPick(e.target.value); setMessage(''); }}>
          <option value="">{list == null ? 'Loading' : (list.length ? 'Choose one' : 'None you can read')}</option>
          {pick && !(list || []).some((p) => p.id === pick) && <option value={pick}>Named in the address</option>}
          {(list || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.updatedAt ? ` (saved ${String(p.updatedAt).slice(0, 10)})` : ''}</option>)}
        </select>
      </div>
      {kind === 'pvt' && (
        <p className="text-[10px] text-pl-muted">
          Bo and viscosity are read from the project&apos;s own PVT table at the average reservoir pressure on this page ({inputs.form.reservoirPressure ? `${u.fmt('pressure', Number(inputs.form.reservoirPressure))} ${u.label('pressure')}` : 'blank: the bubble point'}); never extrapolated.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-8" disabled={!pick || busy || !canWrite} onClick={take} data-testid={`ws-take-${kind}`}>Take values</Button>
        {intake && <Button size="sm" variant="ghost" className="h-8" disabled={!canWrite} onClick={() => clearIntake(kind)}>Forget the source</Button>}
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid={`ws-intake-message-${kind}`}>{message}</p>}
      {intake && kind === 'pvt' && (
        <PvtIntakeCard intake={intake} current={inputs.form} fields={PVT_FIELDS.map((f) => ({ ...f, method: intake?.methods?.[f.key] || undefined }))} readLatest={readFluidProjectPvt} title="PVT taken from Fluid Systems Studio" />
      )}
      {intake && kind !== 'pvt' && <IntakeCard kind={kind} intake={intake} />}
    </section>
  );
};

const WellsBlock = () => {
  const { inputs, takeIntake, clearIntake, addNotification, canWrite } = useWellSpacing();
  const [wells, setWells] = useState(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState(() => new Set((inputs.intakes?.wells?.wells || []).map((w) => w.id)));
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    listWells().then((l) => alive && setWells(l)).catch((e) => alive && (setWells([]), setError(e?.message || 'The registry could not be read.')));
    return () => { alive = false; };
  }, []);
  const intake = inputs.intakes?.wells;
  const toggle = (id) => setChosen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const take = () => {
    const res = wsWellsIntake((wells || []).filter((w) => chosen.has(w.id)));
    if (!res.ok) { setMessage(res.errors[0]); return; }
    setMessage('');
    takeIntake('wells', res);
    addNotification(`Taken ${res.intake.wells.length} wells from the registry.`, 'success');
  };
  return (
    <section className="space-y-2" data-testid="ws-intake-wells">
      <p className="text-xs font-semibold text-pl-text">Wells registry (Well Data Manager)</p>
      <p className="text-[10px] text-pl-muted">Well names and surface locations, for the map in the report and the spacing the wells already have.</p>
      {wells == null ? <p className="text-[10px] text-pl-muted">Loading the registry</p> : wells.length === 0 ? (
        <p className="text-[10px] text-pl-muted">{error || 'No wells you can read in the registry.'}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-md border border-pl-border p-2 space-y-1">
          {wells.map((w) => (
            <label key={w.id} className="flex items-center gap-2 text-xs text-pl-text">
              <input type="checkbox" checked={chosen.has(w.id)} disabled={!canWrite} onChange={() => toggle(w.id)} data-testid={`ws-well-${w.name}`} />
              {w.name} <span className="text-pl-muted">({w.xy_unit || 'm'}{w.crs ? `, ${w.crs}` : ''})</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-8" disabled={chosen.size < 2 || !canWrite} onClick={take} data-testid="ws-take-wells">Take the chosen wells</Button>
        {intake && <Button size="sm" variant="ghost" className="h-8" disabled={!canWrite} onClick={() => clearIntake('wells')}>Forget the wells</Button>}
      </div>
      {message && <p className="text-xs text-pl-danger-text" data-testid="ws-intake-message-wells">{message}</p>}
      {intake && (
        <p className="text-[10px] text-pl-muted" data-testid="ws-intake-card-wells">
          {intake.wells.length} wells taken ({intake.wells.map((w) => w.name).join(', ')}), coordinates in {intake.xyUnit}{intake.crs ? `, ${intake.crs}` : ''}.
        </p>
      )}
    </section>
  );
};

const IntakesPanel = () => (
  <div className="bg-pl-surface border border-pl-border rounded-xl p-4 shadow-pl-sm space-y-4" data-testid="ws-intakes">
    <h3 className="text-lg font-bold text-pl-text flex items-center gap-2"><Link2 className="w-4 h-4 text-pl-primary-text" /> From other apps</h3>
    {['pvt', 'wta', 'mbal', 'rf', 'dca'].map((k) => <SourceBlock key={k} kind={k} />)}
    <WellsBlock />
    <p className="text-[10px] text-pl-muted">
      Values are read from the saved record by id and kept with this project with their source. A value you change afterwards
      is marked as edited after intake; a source saved again with different content is marked as changed since.
    </p>
  </div>
);

export default IntakesPanel;
