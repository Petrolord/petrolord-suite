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
  const { state, updateInputs, logEvent, loadProjects, loadProject } = useReservoirCalc();
  const [params] = useSearchParams();
  const id = params.get('mbalCase');
  // the project the case's volumetric estimate was taken from (Material Balance sends it)
  const projectId = params.get('rcpProject');
  const done = useRef(false);
  const opened = useRef(false);
  const [projectNote, setProjectNote] = useState(null);
  useEffect(() => {
    if (!id || !projectId || opened.current || !loadProjects || !loadProject) return;
    opened.current = true;
    if (state.project?.id === projectId) return;
    loadProjects().then(() => setProjectNote('pending'));
  }, [id, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (projectNote !== 'pending') return;
    const p = (state.projects || []).find((x) => x.id === projectId);
    if (p) { loadProject(p); setProjectNote(null); } else setProjectNote('missing');
  }, [projectNote, state.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!id || done.current) return;
    done.current = true;
    readMbalCase(client, id).then(({ record, error: e }) => {
      if (e) { setError(e); return; }
      setRec(record);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // kept with the project, so a saved project says what it was checked against;
  // written once the project the case names is open (loading it replaces the inputs)
  const recorded = useRef(null);
  useEffect(() => {
    if (!rec || projectNote === 'pending' || (projectId && !opened.current)) return;
    const key = state.project?.id ?? 'workspace';
    if (recorded.current === key) return;
    recorded.current = key;
    updateInputs?.({ mbalCheck: { contract: rec.contract, case_id: rec.case.id, case_name: rec.case.name, run_id: rec.run.id, ran_at: rec.run.ran_at, quantity: rec.in_place.quantity, value: rec.in_place.value, unit: rec.in_place.unit, read_at: rec.read_at } });
    logEvent?.('Material balance cross-check', `${rec.case.name}, ${rec.in_place.quantity} ${scaled(rec.in_place.value, rec.in_place.unit)}`);
  }, [rec, projectNote, state.project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // a workspace that is not a saved project holds the sample inputs or unsaved
  // ones: nothing the material balance can be fairly compared against
  const saved = Boolean(state.project?.id);
  const loading = projectNote === 'pending';
  return (
    <div data-testid="rcp-mbal-check" className="rounded border border-pl-border bg-pl-surface px-2 py-1.5 text-[11px] text-pl-text flex-shrink-0 space-y-0.5">
      <p className="font-semibold">Material balance cross-check</p>
      <p data-testid="rcp-mbal-check-values">
        {rec.in_place.quantity} by material balance {scaled(check.mbal, check.unit)}
        {loading ? '. Opening the project its volumetric estimate came from.' : null}
        {!loading && !saved && check.sameFluid
          ? `. ${projectNote === 'missing' ? 'The project the case names is not readable from this account. ' : ''}This workspace is not a saved project, so it is not compared: open the saved project of this reservoir (Projects) to see the two side by side.`
          : null}
        {loading || !saved ? null : check.volumetric != null && check.sameFluid
          ? `; this project's deterministic volumetric ${gas ? 'GIIP' : 'STOIIP'} ${scaled(check.volumetric, check.unit)}; ${Math.abs(check.differencePct) < 0.05 ? 'the two agree to within 0.1 percent' : `material balance ${check.differencePct >= 0 ? 'above' : 'below'} it by ${fmt(Math.abs(check.differencePct), 1)} percent`}.`
          : (check.sameFluid ? '. Run the deterministic case here to compare.' : `. This project is a ${fluid} case, so the volumes are not compared.`)}
        {saved && !loading && check.sameFluid && check.volumetric != null ? ` Project: "${state.project.name}".` : null}
      </p>
      {provenanceLines(rec).map((l) => <p key={l} className="text-pl-muted">{l}</p>)}
      <p className="text-pl-muted">A material balance volume counts what the pressure history has seen connected; a volumetric one counts what the map holds. A volumetric value well above the material balance points at unconnected or undrained volume.</p>
    </div>
  );
}
