/**
 * The in-place volume of the estimate taken from another app by id
 * (RF-U1-010; reviewer lens RL11): the OOIP or OGIP a Material Balance case
 * last solved for (contract mbal-1, src/lib/mbalCaseSource.js, read with
 * `?mbalCase=<rb_cases id>` or the picker), or the deterministic volumetric
 * result of a saved ReservoirCalc Pro project (the reader Material Balance
 * already uses, rcpVolumetricIntake.js).
 *
 * The estimator then holds the volume as a direct entry, with a record
 * (`inPlaceIntake`) that the screen and the report print as the source, and
 * an edit after the intake is said. A phase mismatch is refused.
 *
 * Pure.
 */
import { RCP_APP } from '@/pages/apps/reservoir-balance/lib/rcpVolumetricIntake';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const day = (iso) => (iso ? String(iso).slice(0, 10) : 'date not recorded');

/**
 * @param {object} record an mbal-1 record (buildMbalRecord / readMbalCase)
 * @param {{phase: 'oil'|'gas', now?: string}} o
 * @returns {{ok: true, value: number, intake: object}|{ok: false, error: string}}
 */
export function inPlaceFromMbal(record, { phase, now = new Date().toISOString() }) {
  if (!record || record.contract !== 'mbal-1') return { ok: false, error: 'No Material Balance record was read.' };
  const isGas = record.in_place?.unit === 'scf';
  if ((phase === 'gas') !== isGas) {
    return { ok: false, error: `The case "${record.case?.name}" holds ${isGas ? 'gas (OGIP)' : 'oil (OOIP)'} and this estimate is for ${phase}. Switch the phase first.` };
  }
  const value = record.in_place?.value;
  if (!finite(value) || value <= 0) return { ok: false, error: 'The case has no usable in-place volume.' };
  const ci = Array.isArray(record.in_place.ci95) ? record.in_place.ci95 : null;
  const text = `${record.in_place.quantity} by material balance, ${record.app} case "${record.case?.name}"${record.case?.field ? ` (field ${record.case.field})` : ''}, run of ${day(record.run?.ran_at)}; method ${record.in_place.method}${finite(record.in_place.r_squared) ? `, r2 ${record.in_place.r_squared.toFixed(4)}` : ''}${record.status === 'earlier_run' ? '; the case was changed after this run' : ''}`;
  return {
    ok: true,
    value,
    intake: {
      contract: 'mbal-1',
      app: record.app,
      recordId: record.case?.id ?? null,
      runId: record.run?.id ?? null,
      recordName: record.case?.name ?? null,
      quantity: record.in_place.quantity,
      unit: record.in_place.unit,
      value,
      ci95: ci,
      method: record.in_place.method,
      drive: record.drive?.mechanism ?? null,
      status: record.status,
      ranAt: record.run?.ran_at ?? null,
      takenAt: now,
      text,
    },
  };
}

/**
 * @param {object} row a saved ReservoirCalc Pro project row
 * @param {object} option one of volumetricOptions(row)
 * @param {{phase: 'oil'|'gas', now?: string}} o
 */
export function inPlaceFromRcp(row, option, { phase, now = new Date().toISOString() }) {
  const isGas = phase === 'gas';
  const value = isGas ? option?.giip_scf : option?.stooip_stb;
  if (!finite(value) || value <= 0) return { ok: false, error: `The reservoir "${option?.reservoir ?? '?'}" of this project has no ${isGas ? 'gas' : 'oil'} in place to take.` };
  const text = `${isGas ? 'OGIP' : 'OOIP'} from ${RCP_APP} project "${row.project_name}", reservoir "${option.reservoir}", ${option.method}, project saved ${day(row.updated_at || row.created_at)}${option.unitSystem === 'metric' ? ', converted from sm3' : ''}`;
  return {
    ok: true,
    value,
    intake: {
      contract: 'rcp-saved-project',
      app: RCP_APP,
      recordId: row.id ?? null,
      recordName: row.project_name ?? null,
      reservoir: option.reservoir,
      quantity: isGas ? 'OGIP' : 'OOIP',
      unit: isGas ? 'scf' : 'STB',
      value,
      ci95: null,
      method: option.method,
      status: 'current',
      takenAt: now,
      text,
    },
  };
}

/** The Source words of the in-place row: the intake, an edit after it, or what was typed. */
export function inPlaceSourceText(intake, currentValue) {
  if (!intake) return null;
  const v = Number(currentValue);
  const same = finite(v) && Math.abs(v - intake.value) <= 1e-6 * Math.max(1, Math.abs(intake.value));
  const base = `${intake.text} (taken ${day(intake.takenAt)})`;
  return same ? base : `Edited in this app after the intake (received ${intake.value}). The intake said: ${base}`;
}
