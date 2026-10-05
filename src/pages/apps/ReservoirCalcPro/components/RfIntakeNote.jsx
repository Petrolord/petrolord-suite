// Recovery Factor Estimator intake, ReservoirCalc Pro side (RF-U2-001,
// contract rf-1 in src/lib/rfEstimateSource.js). ?rfProject=<id> reads the
// saved estimate by id and prints it with its method, basis and source.
// Nothing changes ReservoirCalc Pro's numbers until the user presses "Use
// this recovery factor": then the oil or gas recovery factor takes the value
// (in percent) and the project keeps the record (`rfIntake`), so a saved
// project still says where its recovery factor came from. On a later open
// the estimate is read again by id: an edit here after the intake and a
// change at the source since are both said.
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import {
  readRfProject, rcpRecoveryTarget, rcpRfIntake, rcpRfIntakeStatus, rfProvenanceLines, RF_PROJECT_PARAM,
} from '@/lib/rfEstimateSource';
import { supabase as defaultClient } from '@/lib/customSupabaseClient';

/** @param {{client?: object}} props the Supabase client (tests hand in their own) */
export default function RfIntakeNote({ client = defaultClient }) {
  const { state, updateInputs, logEvent } = useReservoirCalc();
  const [params] = useSearchParams();
  const intake = state?.inputs?.rfIntake || null;
  const id = params.get(RF_PROJECT_PARAM) || intake?.project_id || null;
  const readFor = useRef(null);
  const [read, setRead] = useState(null);
  useEffect(() => {
    if (!id || readFor.current === id) return;
    readFor.current = id;
    readRfProject(client, id).then(setRead);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  if (read && !read.ok && !intake) {
    return <div data-testid="rcp-rf-intake" className="rounded border border-pl-warning-text/40 px-2 py-1.5 text-[11px] text-pl-warning-text flex-shrink-0">{read.reason}</div>;
  }
  if (!read && !intake) return null;
  const record = read?.ok ? read.contract : null;
  const fluid = state?.inputs?.fluidType || 'oil';
  const target = record ? rcpRecoveryTarget(record, fluid) : null;
  const sameSource = intake && record && intake.project_id === id;
  const status = rcpRfIntakeStatus(intake, state?.inputs, sameSource ? record : null);
  const alreadyTaken = sameSource && target?.ok && !status.changed && Math.abs(Number(state?.inputs?.[target.field]) - target.percent) <= 1e-6;

  const take = () => {
    if (!target?.ok) return;
    const rec = rcpRfIntake(record, { projectId: id, projectName: read.projectName, updatedAt: read.updatedAt, field: target.field, percent: target.percent });
    updateInputs({ [target.field]: target.percent, rfIntake: rec });
    logEvent?.('Recovery factor taken', `${record.recovery_factor.method_label}, ${target.percent.toFixed(1)} percent (${target.field === 'recoveryGas' ? 'gas' : 'oil'})`);
  };

  return (
    <div data-testid="rcp-rf-intake" className="rounded border border-pl-border bg-pl-surface px-2 py-1.5 text-[11px] text-pl-text flex-shrink-0 space-y-0.5">
      <p className="font-semibold">Recovery factor from the Recovery Factor Estimator</p>
      {intake && (
        <p data-testid="rcp-rf-intake-taken">
          The {intake.field === 'recoveryGas' ? 'gas' : 'oil'} recovery factor {intake.percent.toFixed(1)} percent was taken from project "{intake.project_name || intake.project_id}", {intake.method_label}, on {String(intake.taken_at || '').slice(0, 10)}.
        </p>
      )}
      {record && rfProvenanceLines(record, { projectName: read.projectName }).map((l) => <p key={l} className="text-pl-muted">{l}</p>)}
      {read && !read.ok && intake && <p className="text-pl-muted" data-testid="rcp-rf-intake-unreadable">The source cannot be read now ({read.reason}), so a change there cannot be checked.</p>}
      {status.edited && <p className="text-pl-warning-text" data-testid="rcp-rf-intake-edited">{status.edited}</p>}
      {status.changed && <p className="text-pl-warning-text" data-testid="rcp-rf-intake-changed">{status.changed}</p>}
      {target && !target.ok && <p className="text-pl-warning-text" data-testid="rcp-rf-intake-refused">{target.error}</p>}
      {target?.ok && !alreadyTaken && (
        <button type="button" onClick={take} data-testid="rcp-rf-intake-take" className="mt-1 rounded border border-pl-border px-2 py-0.5 text-[11px] text-pl-text hover:bg-pl-sunken">
          Use this recovery factor ({target.percent.toFixed(1)} percent, {target.field === 'recoveryGas' ? 'gas' : 'oil'})
        </button>
      )}
      {target?.ok && !intake && <p className="text-pl-muted">This project keeps its own recovery factor ({Number(state?.inputs?.[target.field])} percent) until you use this one.</p>}
    </div>
  );
}
