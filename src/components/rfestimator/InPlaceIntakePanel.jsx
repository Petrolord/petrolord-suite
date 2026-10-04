// The in-place volume taken by id from a Material Balance case (mbal-1) or
// a saved ReservoirCalc Pro project (RF-U1-010; RL11). The value lands as a
// direct entry with its record; the panel reads the source again by id and
// says when it changed after the intake ("source changed since").
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { readMbalCase } from '@/lib/mbalCaseSource';
import { listRcpProjects, readRcpProject, volumetricOptions } from '@/pages/apps/reservoir-balance/lib/rcpVolumetricIntake';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { inPlaceFromMbal, inPlaceFromRcp, inPlaceSourceText } from '@/utils/rfestimator/inPlaceIntake';
import { fmtRes } from './rfFields';

export const MBAL_CASE_PARAM = 'mbalCase';

const selectClass = 'h-9 w-full rounded-md border border-pl-border bg-pl-surface px-2 text-xs text-pl-text';

/** What the source holds now, against what was taken. Pure. */
export function inPlaceChangedSince(intake, latest) {
  if (!intake || !latest) return null;
  const moved = Number.isFinite(latest.value) && Math.abs(latest.value - intake.value) > 1e-6 * Math.max(1, intake.value);
  const newerRun = intake.contract === 'mbal-1' && latest.runId && intake.runId && latest.runId !== intake.runId;
  if (!moved && !newerRun) return null;
  return `The source changed after the intake: it now holds ${latest.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${intake.unit}${newerRun ? ' from a newer run' : ''}. Take it again to use it.`;
}

const InPlaceIntakePanel = () => {
  const { inputs, inPlaceIntake, takeInPlace, clearInPlaceIntake, addNotification, u, canWrite } = useRfEstimator();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(!!searchParams.get(MBAL_CASE_PARAM));
  const [source, setSource] = useState('mbal');
  const [cases, setCases] = useState(null);
  const [caseId, setCaseId] = useState(searchParams.get(MBAL_CASE_PARAM) || '');
  const [rcpRows, setRcpRows] = useState(null);
  const [rcpId, setRcpId] = useState('');
  const [optionKey, setOptionKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    if (source === 'mbal' && cases == null) {
      supabase.from('rb_cases').select('id, name, fluid_system, updated_at').is('archived_at', null).order('updated_at', { ascending: false })
        .then(({ data }) => { if (alive) setCases(data || []); }, () => { if (alive) setCases([]); });
    }
    if (source === 'rcp' && rcpRows == null) listRcpProjects(supabase).then(({ data }) => { if (alive) setRcpRows(data || []); });
    return () => { alive = false; };
  }, [open, source, cases, rcpRows]);

  // "source changed since": read the source again by id
  useEffect(() => {
    let alive = true;
    setChanged(null);
    if (!inPlaceIntake?.recordId) return undefined;
    (async () => {
      if (inPlaceIntake.contract === 'mbal-1') {
        const got = await readMbalCase(supabase, inPlaceIntake.recordId);
        if (alive && got.record) setChanged(inPlaceChangedSince(inPlaceIntake, { value: got.record.in_place?.value, runId: got.record.run?.id }));
      } else {
        const { data } = await readRcpProject(supabase, inPlaceIntake.recordId);
        const opt = data ? volumetricOptions(data).find((o) => o.reservoir === inPlaceIntake.reservoir) : null;
        const v = opt ? (inPlaceIntake.unit === 'scf' ? opt.giip_scf : opt.stooip_stb) : null;
        if (alive && v != null) setChanged(inPlaceChangedSince(inPlaceIntake, { value: v }));
      }
    })().catch(() => {});
    return () => { alive = false; };
  }, [inPlaceIntake]);

  const rcpRow = (rcpRows || []).find((r) => r.id === rcpId) || null;
  const options = rcpRow ? volumetricOptions(rcpRow) : [];
  const option = options.find((o) => o.key === optionKey) || options[0] || null;

  const take = async () => {
    setBusy(true);
    setMessage('');
    let got;
    if (source === 'mbal') {
      const read = await readMbalCase(supabase, caseId);
      got = read.record ? inPlaceFromMbal(read.record, { phase: inputs.phase }) : { ok: false, error: read.error };
    } else {
      got = rcpRow && option ? inPlaceFromRcp(rcpRow, option, { phase: inputs.phase }) : { ok: false, error: 'Choose a project and a reservoir.' };
    }
    setBusy(false);
    if (!got.ok) { setMessage(got.error); return; }
    takeInPlace(got.value, got.intake);
    setOpen(false);
    addNotification(`${got.intake.quantity} taken: ${fmtRes(got.value, inputs.phase, u.system)} from ${got.intake.app}.`, 'success');
  };

  return (
    <section className="space-y-2 rounded-md border border-pl-border p-3" data-testid="rf-inplace-intake">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-pl-text">In-place volume from another app</span>
        {canWrite && (
          <button type="button" className="text-[11px] underline text-pl-primary-text" onClick={() => setOpen((v) => !v)} data-testid="rf-inplace-open">
            {open ? 'Close' : 'Take by id'}
          </button>
        )}
      </div>
      {inPlaceIntake && (
        <div className="text-[11px] text-pl-muted space-y-1" data-testid="rf-inplace-record">
          <p>{inPlaceSourceText(inPlaceIntake, inputs.ooipDirect)}</p>
          {changed && <p className="text-pl-warning-text" data-testid="rf-inplace-changed">{changed}</p>}
          {canWrite && <button type="button" className="underline" onClick={clearInPlaceIntake}>Forget the source</button>}
        </div>
      )}
      {open && (
        <div className="space-y-2" data-testid="rf-inplace-picker">
          <div className="inline-flex rounded-md border border-pl-border overflow-hidden text-[11px]">
            {[['mbal', 'Material Balance case'], ['rcp', 'ReservoirCalc Pro project']].map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => { setSource(k); setMessage(''); }}
                className={`px-2 py-1 ${source === k ? 'bg-pl-primary text-pl-primary-fg' : 'text-pl-muted'}`}>{lbl}</button>
            ))}
          </div>
          {source === 'mbal' ? (
            <select aria-label="Material Balance case" className={selectClass} value={caseId} onChange={(e) => setCaseId(e.target.value)} data-testid="rf-mbal-case">
              <option value="">{cases == null ? 'Reading your cases' : (cases.length ? 'Choose a case' : 'No Material Balance case is readable from this account')}</option>
              {caseId && !(cases || []).some((c) => c.id === caseId) && <option value={caseId}>Case named in the address</option>}
              {(cases || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.fluid_system || 'fluid not set'})</option>)}
            </select>
          ) : (
            <>
              <select aria-label="ReservoirCalc Pro project" className={selectClass} value={rcpId} onChange={(e) => { setRcpId(e.target.value); setOptionKey(''); }} data-testid="rf-rcp-project">
                <option value="">{rcpRows == null ? 'Reading your projects' : (rcpRows.length ? 'Choose a project' : 'No ReservoirCalc Pro project is readable from this account')}</option>
                {(rcpRows || []).map((r) => <option key={r.id} value={r.id}>{r.project_name}</option>)}
              </select>
              {options.length > 1 && (
                <select aria-label="Reservoir" className={selectClass} value={option?.key || ''} onChange={(e) => setOptionKey(e.target.value)}>
                  {options.map((o) => <option key={o.key} value={o.key}>{o.reservoir}</option>)}
                </select>
              )}
              {rcpRow && !options.length && <p className="text-[11px] text-pl-muted">This project has no saved deterministic result.</p>}
            </>
          )}
          <Button size="sm" variant="outline" className="h-8" disabled={busy || (source === 'mbal' ? !caseId : !option)} onClick={take} data-testid="rf-inplace-take">
            Take the {inputs.phase === 'gas' ? 'OGIP' : 'OOIP'}
          </Button>
          {message && <p className="text-xs text-pl-danger-text" data-testid="rf-inplace-message">{message}</p>}
          <p className="text-[10px] text-pl-muted">Read by id from the saved record, so what is printed is what the source holds. Material Balance gives the volume of its last completed run.</p>
        </div>
      )}
    </section>
  );
};

export default InPlaceIntakePanel;
