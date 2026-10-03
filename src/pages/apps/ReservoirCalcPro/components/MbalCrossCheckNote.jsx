// Material Balance cross-check, ReservoirCalc Pro side (Material Balance
// Studio upgrade U2-004, contract mbal-1 in src/lib/mbalCaseSource.js).
// ?mbalCase=<rb_cases id> reads the saved case and its last completed run by
// id and prints its in-place volume beside this project's deterministic
// volumetric result, with where it came from. Nothing here changes an input
// of ReservoirCalc Pro: the material balance is a cross-check, not a source.
// The record is kept with the project inputs (`mbalCheck`) so a saved
// project still says what it was checked against.
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { readMbalCase, crossCheck, provenanceLines } from '@/lib/mbalCaseSource';
import { supabase as defaultClient } from '@/lib/customSupabaseClient';

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'n/a');
const scaled = (v, unit) => {
  if (!Number.isFinite(v)) return 'n/a';
  if (unit === 'scf') return `${fmt(v / 1e9, 2)} Bscf`;
  if (unit === 'STB') return `${fmt(v / 1e6, 2)} MMSTB`;
  return `${fmt(v / 1e6, 3)} million sm3`;
};

/** @param {{client?: object}} props the Supabase client (tests hand in their own) */
export default function MbalCrossCheckNote({ client = defaultClient }) {
  const { state, updateInputs, logEvent } = useReservoirCalc();
  const [params] = useSearchParams();
  const id = params.get('mbalCase');
  const done = useRef(false);
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!id || done.current) return;
    done.current = true;
    readMbalCase(client, id).then(({ record, error: e }) => {
      if (e) { setError(e); return; }
      setRec(record);
      // kept with the project, so a saved project says what it was checked against
      updateInputs?.({ mbalCheck: { contract: record.contract, case_id: record.case.id, case_name: record.case.name, run_id: record.run.id, ran_at: record.run.ran_at, quantity: record.in_place.quantity, value: record.in_place.value, unit: record.in_place.unit, read_at: record.read_at } });
      logEvent?.('Material balance cross-check', `${record.case.name}, ${record.in_place.quantity} ${scaled(record.in_place.value, record.in_place.unit)}`);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  if (error) {
    return <div data-testid="rcp-mbal-check" className="rounded border border-pl-warning-text/40 px-2 py-1.5 text-[11px] text-pl-warning-text flex-shrink-0">{error}</div>;
  }
  if (!rec) return null;
  const results = state.results;
  const fluid = results?.fluidType || state.inputs?.fluidType || 'oil';
  const gas = fluid === 'gas';
  const volumetric = results ? (gas ? results.giip : results.stooip) : null;
  const check = crossCheck(rec, { value: volumetric, unitSystem: state.unitSystem || 'field', fluid: gas ? 'gas' : 'oil' });
  return (
    <div data-testid="rcp-mbal-check" className="rounded border border-pl-border bg-pl-surface px-2 py-1.5 text-[11px] text-pl-text flex-shrink-0 space-y-0.5">
      <p className="font-semibold">Material balance cross-check</p>
      <p data-testid="rcp-mbal-check-values">
        {rec.in_place.quantity} by material balance {scaled(check.mbal, check.unit)}
        {check.volumetric != null && check.sameFluid
          ? `; this project's deterministic volumetric ${gas ? 'GIIP' : 'STOIIP'} ${scaled(check.volumetric, check.unit)}; material balance ${check.differencePct >= 0 ? 'above' : 'below'} it by ${fmt(Math.abs(check.differencePct), 1)} percent.`
          : (check.sameFluid ? '. Run the deterministic case here to compare.' : `. This project is a ${fluid} case, so the volumes are not compared.`)}
      </p>
      {provenanceLines(rec).map((l) => <p key={l} className="text-pl-muted">{l}</p>)}
      <p className="text-pl-muted">A material balance volume counts what the pressure history has seen connected; a volumetric one counts what the map holds. A volumetric value well above the material balance points at unconnected or undrained volume.</p>
    </div>
  );
}
