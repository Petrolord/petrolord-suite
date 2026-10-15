// Depth uncertainty for prospects (QI upgrade P2.12, 2026-10-15), under the
// Prospects table: a time structure from the surface registry, converted to
// depth under several named velocity cases (constant average velocity, or
// v = v0 + k z), the closure engine on each, and the GRV to spill as a range
// (each case, low, high, weighted Q10, Q50 and Q90) for prospect ranking.
// Beside it, a SUGGESTED chance of success from the prospect's QI
// assessment, by a stated rule on the user's own Pg, for the user to accept,
// change or ignore in Risked Reserves Valuation: QI never sets it.
import React, { useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';
import { depthCaseGrvs, suggestPg } from '../engine/depthUncertainty';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const input = 'rounded border border-pl-border bg-pl-surface px-1.5 py-0.5 text-xs text-pl-text';
const mm3 = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(1) : EMPTY_VALUE);
export const DEFAULT_CASES = [
  { name: 'Slow', kind: 'constant', v: '2100', v0: '', k: '', weight: '1' },
  { name: 'Mid', kind: 'constant', v: '2300', v0: '', k: '', weight: '2' },
  { name: 'Fast', kind: 'constant', v: '2500', v0: '', k: '', weight: '1' },
];

/** Why the cases cannot run, or null. */
export function casesProblem(cases) {
  if (!cases.length) return 'Give at least one velocity case.';
  for (const c of cases) {
    if (!String(c.name).trim()) return 'Name each velocity case.';
    const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));
    if (c.kind === 'linear') { if (!(num(c.v0) > 500 && num(c.v0) < 7000) || !Number.isFinite(num(c.k))) return `${c.name}: give v0 (m/s) and the gradient k (1/s).`; } else if (!(num(c.v) > 500 && num(c.v) < 7000)) return `${c.name}: give the average velocity, 500 to 7000 m/s.`;
    if (!(num(c.weight) > 0)) return `${c.name}: give a weight above zero.`;
  }
  return null;
}

export const engineCases = (cases) => cases.map((c) => ({ name: c.name, weight: Number(c.weight), velocity: c.kind === 'linear' ? { kind: 'linear', v0: Number(c.v0), k: Number(c.k) } : { kind: 'constant', v: Number(c.v) } }));

function ProspectCases({ prospect, timeSurfaces }) {
  const { project, backend, saveProspect, canWrite } = useQIStudio();
  const saved = prospect.depthCases || null;
  const [surfaceId, setSurfaceId] = useState(saved?.surfaceId || timeSurfaces[0]?.id || '');
  const [cases, setCases] = useState(saved?.cases || DEFAULT_CASES);
  const [pg, setPg] = useState(saved?.pg?.baselinePg != null ? String(saved.pg.baselinePg) : '');
  const [st, setSt] = useState(null);
  const problem = casesProblem(cases) || (!surfaceId ? 'Choose a time structure.' : null);
  const run = async () => {
    setSt({ busy: true });
    try {
      const row = timeSurfaces.find((s) => s.id === surfaceId);
      const t = await backend.loadTimeSurface(row);
      const r = depthCaseGrvs({ twt: t.grid, spec: t.spec, cases: engineCases(cases) });
      saveProspect({ id: prospect.id, depthCases: { at: new Date().toISOString(), surfaceId, surfaceName: row.name, cases, result: r } });
      setSt(null);
    } catch (e) { setSt({ error: e.message }); }
  };
  const pgVal = String(pg).trim() === '' ? NaN : Number(pg);
  let suggestion = null;
  if (pgVal > 0 && pgVal < 1 && prospect.result) {
    suggestion = suggestPg({ baselinePg: pgVal, recommendation: prospect.result.assessment.recommendation, conformance: prospect.result.anomaly?.conformance ?? NaN, feasibility: project.feasibility?.[prospect.target]?.verdict || '' });
  }
  const keepPg = () => saveProspect({ id: prospect.id, depthCases: { ...(prospect.depthCases || {}), pg: { baselinePg: pgVal, ...suggestion, at: new Date().toISOString() } } });
  const setCase = (i, patch) => setCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <details className="rounded border border-pl-border p-3 text-xs space-y-2" data-testid={`qi-pros-depth-${prospect.id}`}>
      <summary className="cursor-pointer text-pl-text">{`${prospect.name}: depth uncertainty and a suggested Pg`}</summary>
      <label className="flex items-center gap-1 pt-2">Time structure
        <select className={input} value={surfaceId} onChange={(e) => setSurfaceId(e.target.value)} disabled={!canWrite} data-testid={`qi-pros-depth-surface-${prospect.id}`}>
          {timeSurfaces.length ? timeSurfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">No time surfaces in the registry</option>}
        </select>
      </label>
      <table className="text-xs">
        <thead><tr><th className={th}>Case</th><th className={th}>Velocity</th><th className={th}>Average (m/s)</th><th className={th}>v0 (m/s)</th><th className={th}>k (1/s)</th><th className={th}>Weight</th></tr></thead>
        <tbody>
          {cases.map((c, i) => (
            <tr key={i}>
              <td className={td}><input className={`${input} w-24`} value={c.name} onChange={(e) => setCase(i, { name: e.target.value })} disabled={!canWrite} /></td>
              <td className={td}><select className={input} value={c.kind} onChange={(e) => setCase(i, { kind: e.target.value })} disabled={!canWrite}><option value="constant">constant average</option><option value="linear">v0 + k z</option></select></td>
              <td className={td}><input className={`${input} w-20`} value={c.v} onChange={(e) => setCase(i, { v: e.target.value })} disabled={!canWrite || c.kind !== 'constant'} /></td>
              <td className={td}><input className={`${input} w-20`} value={c.v0} onChange={(e) => setCase(i, { v0: e.target.value })} disabled={!canWrite || c.kind !== 'linear'} /></td>
              <td className={td}><input className={`${input} w-16`} value={c.k} onChange={(e) => setCase(i, { k: e.target.value })} disabled={!canWrite || c.kind !== 'linear'} /></td>
              <td className={td}><input className={`${input} w-14`} value={c.weight} onChange={(e) => setCase(i, { weight: e.target.value })} disabled={!canWrite} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && <div className="flex gap-2"><button type="button" className={btn} onClick={() => setCases((cs) => [...cs, { name: `Case ${cs.length + 1}`, kind: 'constant', v: '2300', v0: '', k: '', weight: '1' }])}>Add a case</button>{cases.length > 1 && <button type="button" className={btn} onClick={() => setCases((cs) => cs.slice(0, -1))}>Remove the last case</button>}</div>}
      {problem && <p className="text-pl-warning-text" data-testid={`qi-pros-depth-problem-${prospect.id}`}>{problem}</p>}
      <button type="button" className={btn} onClick={run} disabled={!canWrite || !!problem || st?.busy} data-testid={`qi-pros-depth-run-${prospect.id}`}>{st?.busy ? 'Converting' : 'Convert and close each case'}</button>
      {st?.error && <p className="text-pl-danger-text">{st.error}</p>}
      {saved?.result && (
        <div className="space-y-1" data-testid={`qi-pros-depth-result-${prospect.id}`}>
          <table className="text-xs">
            <thead><tr><th className={th}>Case</th><th className={th}>Weight</th><th className={th}>Crest / spill (m)</th><th className={th}>Column (m)</th><th className={th}>GRV to spill (million m3)</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {saved.result.rows.map((r) => <tr key={r.name}><td className={`${td} font-sans`}>{r.name}</td><td className={td}>{r.weight}</td><td className={td}>{`${(-r.crestZ).toFixed(0)} / ${(-r.spillZ).toFixed(0)}${r.limitedByEdge ? ' (edge)' : ''}`}</td><td className={td}>{r.columnM.toFixed(0)}</td><td className={td}>{mm3(r.grvM3)}</td></tr>)}
            </tbody>
          </table>
          <p className="text-pl-text">{`GRV to spill over the cases: ${mm3(saved.result.low)} to ${mm3(saved.result.high)} million m3; weighted Q10 ${mm3(saved.result.q10)}, Q50 ${mm3(saved.result.q50)}, Q90 ${mm3(saved.result.q90)}.`}</p>
        </div>
      )}
      {prospect.result && (
        <div className="flex flex-wrap items-center gap-2" data-testid={`qi-pros-pg-${prospect.id}`}>
          <label className="flex items-center gap-1">Your Pg (0 to 1)<input className={`${input} w-16`} value={pg} onChange={(e) => setPg(e.target.value)} disabled={!canWrite} data-testid={`qi-pros-pg-input-${prospect.id}`} /></label>
          {suggestion && <span className="text-pl-text" data-testid={`qi-pros-pg-suggestion-${prospect.id}`}>{`Suggested by the QI: ${suggestion.suggestedPg.toFixed(2)} (x ${suggestion.factor}). ${suggestion.reasons.join(' ')} A stated rule for discussion; you set Pg in Risked Reserves Valuation.`}</span>}
          {suggestion && canWrite && <button type="button" className={btn} onClick={keepPg} data-testid={`qi-pros-pg-keep-${prospect.id}`}>Keep with the study</button>}
        </div>
      )}
    </details>
  );
}

export default function DepthCasesSection() {
  const { project, backend } = useQIStudio();
  const [timeSurfaces, setTimeSurfaces] = useState(null);
  React.useEffect(() => {
    let live = true;
    if (backend?.listSurfaces) backend.listSurfaces().then((r) => { if (live) setTimeSurfaces((r || []).filter((s) => s.z_domain === 'time')); }).catch(() => { if (live) setTimeSurfaces([]); });
    return () => { live = false; };
  }, [backend]);
  const prospects = (project.prospects || []).filter((p) => p.result);
  if (!prospects.length || !backend?.loadTimeSurface) return null;
  return (
    <section className={card} data-testid="qi-pros-depth">
      <h2 className="text-sm font-semibold text-pl-text">Depth uncertainty for prospects</h2>
      <p className={muted}>The prospect&apos;s time structure taken to depth under each velocity case, closed to its spill point on each, and the GRV range for ranking. The suggested Pg applies a stated factor to your own Pg from the QI assessment; you decide.</p>
      {prospects.map((p) => <ProspectCases key={p.id} prospect={p} timeSurfaces={timeSurfaces || []} />)}
    </section>
  );
}
