// Prospects (QI programme Q10, 2026-10-07; SOW section 11): each prospect's
// trap on a depth surface, its amplitude anomaly from an attribute map and
// how the anomaly fits the structure, the evidence with its independence,
// the competing explanations, and the QI assessment. The table across the
// prospects is the SOW's per-prospect QI assessment. Each analysed prospect
// keeps a qi-prospect-1 record that Risked Reserves Valuation reads beside
// the prospect; QI never sets Pg.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildQiProspectRecord, qiProspectLink } from '@/lib/qiProspectSource';
import { useQIStudio } from '../QIStudioContext';
import { analyseProspect, COMPETING, COMPETING_STATES } from '../services/prospects';
import { EVIDENCE_SOURCES } from '../engine/prospectAssessment';
import { FEASIBILITY_VERDICTS } from '../services/model';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const f = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);
const RRV_ROUTE = '/dashboard/apps/reservoir/risked-reserves-valuation';
const VERDICT = Object.fromEntries(FEASIBILITY_VERDICTS.map((v) => [v.key, v.label]));
const REC_WORD = { mature: 'Mature', retain: 'Retain', investigate: 'Investigate', downgrade: 'Downgrade' };

const blank = (target) => ({
  id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name: '', target: target || '', surfaceId: '', attributeId: '', crestX: '', crestY: '',
  anomaly: { threshold: '', sense: 'high' },
  evidence: [],
  competing: COMPETING.map((c) => ({ key: c.key, name: c.name, status: 'open' })),
});

function Editor({ draft, setDraft, surfaces, onAnalyse, busy, error, targets }) {
  const depths = surfaces.filter((s) => s.z_domain !== 'attribute' && s.z_domain !== 'time' && s.kind !== 'isochore');
  const attrs = surfaces.filter((s) => s.z_domain === 'attribute');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const [ev, setEv] = useState({ name: '', source: 'full_stack' });
  return (
    <div className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid="qi-pros-editor">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">Name<input className={`${input} w-40`} value={draft.name} onChange={(e) => set({ name: e.target.value })} data-testid="qi-pros-name" /></label>
        <label className="flex items-center gap-1">Target
          <select className={input} value={draft.target} onChange={(e) => set({ target: e.target.value })}>
            <option value="">none</option>
            {targets.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Depth surface
          <select className={input} value={draft.surfaceId} onChange={(e) => set({ surfaceId: e.target.value })} data-testid="qi-pros-surface">
            <option value="">choose</option>
            {depths.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Near X<input className={`${input} w-28`} type="number" value={draft.crestX} onChange={(e) => set({ crestX: e.target.value })} aria-label="Crest search X" /></label>
        <label className="flex items-center gap-1">Y<input className={`${input} w-28`} type="number" value={draft.crestY} onChange={(e) => set({ crestY: e.target.value })} aria-label="Crest search Y" /></label>
      </div>
      <p className={muted}>The crest is found by climbing from the point you give (or the highest node of the surface), then the closure is flooded to its spill point.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">Anomaly map
          <select className={input} value={draft.attributeId} onChange={(e) => set({ attributeId: e.target.value })} data-testid="qi-pros-attr">
            <option value="">no anomaly</option>
            {attrs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {draft.attributeId && (
          <>
            <label className="flex items-center gap-1">Anomalous where the map is
              <select className={input} value={draft.anomaly.sense} onChange={(e) => set({ anomaly: { ...draft.anomaly, sense: e.target.value } })}><option value="high">above</option><option value="low">below</option></select>
            </label>
            <input className={`${input} w-24`} type="number" step="any" value={draft.anomaly.threshold} onChange={(e) => set({ anomaly: { ...draft.anomaly, threshold: e.target.value } })} aria-label="Anomaly threshold" data-testid="qi-pros-threshold" />
          </>
        )}
      </div>
      <div className="space-y-1">
        <span className="text-pl-muted">Evidence (each item and the response it comes from):</span>
        {draft.evidence.map((e, k) => (
          <div key={`${e.name}-${k}`} className="flex items-center gap-2">
            <span className="text-pl-text">{e.name}</span><span className="text-pl-muted">{EVIDENCE_SOURCES[e.source]}</span>
            <label className="flex items-center gap-1"><input type="checkbox" checked={e.supports !== false} onChange={() => set({ evidence: draft.evidence.map((x, j) => (j === k ? { ...x, supports: x.supports === false } : x)) })} />supports</label>
            <button type="button" className={btn} onClick={() => set({ evidence: draft.evidence.filter((_, j) => j !== k) })}>Remove</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${input} w-48`} placeholder="for example, Class III AVO" value={ev.name} onChange={(e) => setEv((x) => ({ ...x, name: e.target.value }))} aria-label="Evidence item" data-testid="qi-pros-ev-name" />
          <select className={input} value={ev.source} onChange={(e) => setEv((x) => ({ ...x, source: e.target.value }))} data-testid="qi-pros-ev-source">
            {Object.entries(EVIDENCE_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className={btn} disabled={!ev.name.trim()} onClick={() => { set({ evidence: [...draft.evidence, { name: ev.name.trim(), source: ev.source, supports: true }] }); setEv({ name: '', source: ev.source }); }} data-testid="qi-pros-ev-add">Add evidence</button>
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-pl-muted">Competing explanations:</span>
        {draft.competing.map((c, k) => (
          <div key={c.key || c.name} className="flex items-center gap-2">
            <span className="w-80 text-pl-text">{c.name}</span>
            <select className={input} value={c.status} onChange={(e) => set({ competing: draft.competing.map((x, j) => (j === k ? { ...x, status: e.target.value } : x)) })} data-testid={`qi-pros-comp-${c.key}`}>
              {COMPETING_STATES.map((s) => <option key={s} value={s}>{s === 'ruled-out' ? 'ruled out' : s}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={onAnalyse} disabled={busy || !draft.name.trim() || !draft.surfaceId || (draft.attributeId && draft.anomaly.threshold === '')} data-testid="qi-pros-analyse">{busy ? 'Analysing' : 'Analyse and save'}</button>
        {error && <span className="text-pl-danger-text">{error}</span>}
      </div>
    </div>
  );
}

export default function ProspectsPanel() {
  const { project, backend, saveProspect, removeProspect, saveIssue, canWrite, currentProjectId, projectName, addNotification } = useQIStudio();
  const [surfaces, setSurfaces] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    if (backend?.listSurfaces) backend.listSurfaces().then((r) => { if (live) setSurfaces(r || []); }).catch(() => { if (live) setSurfaces([]); });
    return () => { live = false; };
  }, [backend]);
  const prospects = project.prospects || [];

  const analyse = async () => {
    setBusy(true); setError(null);
    try {
      const sRow = surfaces.find((s) => s.id === draft.surfaceId);
      const depth = await backend.loadSurface(sRow);
      if (!depth.ok) throw new Error(depth.reason);
      let attr = null; let aRow = null;
      if (draft.attributeId) {
        aRow = surfaces.find((s) => s.id === draft.attributeId);
        attr = await backend.loadSurface(aRow, { attribute: true });
        if (!attr.ok) throw new Error(attr.reason);
      }
      const prospect = {
        ...draft,
        crestX: draft.crestX === '' ? null : Number(draft.crestX),
        crestY: draft.crestY === '' ? null : Number(draft.crestY),
        anomaly: draft.attributeId ? { threshold: Number(draft.anomaly.threshold), sense: draft.anomaly.sense } : null,
      };
      const feasibility = project.feasibility?.[prospect.target]?.verdict || '';
      const analysis = analyseProspect({ depth, attr, prospect, feasibility });
      const record = buildQiProspectRecord({ prospect, analysis, projectId: currentProjectId, projectName, surfaceName: sRow?.name, attributeName: aRow?.name || null, feasibility });
      saveProspect({ ...prospect, anomaly: prospect.anomaly ? { ...prospect.anomaly } : null, result: { ...analysis, at: record.computed_at }, record });
      setDraft(null);
      addNotification(`${prospect.name}: ${REC_WORD[analysis.assessment.recommendation]}.`, 'success');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (p) => setDraft({
    ...blank(p.target), ...p,
    crestX: p.crestX ?? '', crestY: p.crestY ?? '',
    anomaly: p.anomaly ? { threshold: String(p.anomaly.threshold), sense: p.anomaly.sense } : { threshold: '', sense: 'high' },
  });
  const addIssue = (p) => {
    saveIssue({ key: `prospect:${p.id}`, area: 'Prospect', severity: p.result.assessment.recommendation === 'downgrade' ? 'high' : 'medium', title: `${p.name}: ${REC_WORD[p.result.assessment.recommendation].toLowerCase()}`, detail: p.result.assessment.reasons.join(' '), remedy: 'Resolve the open points before the prospect goes to risking.', status: 'open', owner: '' });
    addNotification(`${p.name} added to the register.`, 'success');
  };

  return (
    <section className={card} data-testid="qi-prospects">
      <h2 className="text-sm font-semibold text-pl-text">Prospects</h2>
      <p className={muted}>For each prospect: the trap on a depth surface (crest, spill point, column, closure and GRV), the amplitude anomaly and how it fits the structure, the evidence and how independent it is, the competing explanations, and the QI recommendation. QI does not set the chance of success: Risked Reserves Valuation shows this record beside the prospect while Pg is set.</p>
      {!surfaces.length && <p className="text-xs text-pl-warning-text">No surfaces in the registry. Grid a depth structure in Mapping & Surface Studio first.</p>}
      {prospects.length > 0 && (
        <table className="text-xs" data-testid="qi-pros-table">
          <thead>
            <tr>
              <th className={th}>Prospect</th><th className={th}>Target</th><th className={th}>Crest / spill (m)</th><th className={th}>Column (m)</th>
              <th className={th}>Closure (km2)</th><th className={th}>Anomaly fit</th><th className={th}>Independent evidence</th>
              <th className={th}>Competing open / likely</th><th className={th}>Feasibility</th><th className={th}>Seismic support</th><th className={th}>Recommendation</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => {
              const r = p.result;
              const open = (p.competing || []).filter((c) => c.status === 'open').length;
              const likely = (p.competing || []).filter((c) => c.status === 'likely').length;
              return (
                <tr key={p.id} data-testid={`qi-pros-row-${p.id}`}>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.target || EMPTY_VALUE}</td>
                  <td className={`${td} font-mono`}>{r ? `${f(r.trap.crest.depthM)} / ${f(r.trap.spill.depthM)}${r.trap.limitedByEdge ? ' (edge)' : ''}` : EMPTY_VALUE}</td>
                  <td className={`${td} font-mono`}>{r ? f(r.trap.columnM) : EMPTY_VALUE}</td>
                  <td className={`${td} font-mono`}>{r ? f(r.trap.areaKm2, 2) : EMPTY_VALUE}</td>
                  <td className={td}>{r?.anomaly ? `${f(r.anomaly.conformance, 2)}, ${f(100 * r.anomaly.insideClosure)} percent inside, contact ${f(r.anomaly.impliedContactDepthM)} m` : 'no anomaly'}</td>
                  <td className={`${td} font-mono`}>{r ? r.evidence.independent : EMPTY_VALUE}</td>
                  <td className={`${td} font-mono`}>{`${open} / ${likely}`}</td>
                  <td className={td}>{VERDICT[project.feasibility?.[p.target]?.verdict || ''] || 'Not assessed'}</td>
                  <td className={td}>{r ? r.assessment.seismicSupport : EMPTY_VALUE}</td>
                  <td className={td}>{r ? <span title={r.assessment.reasons.join(' ')}>{REC_WORD[r.assessment.recommendation]}</span> : EMPTY_VALUE}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      {canWrite && <button type="button" className={btn} onClick={() => edit(p)}>Edit</button>}
                      {canWrite && r && r.assessment.recommendation !== 'mature' && <button type="button" className={btn} onClick={() => addIssue(p)}>To register</button>}
                      {r && currentProjectId && <Link className="underline" to={qiProspectLink(RRV_ROUTE, currentProjectId, p.id)} data-testid={`qi-pros-rrv-${p.id}`}>Risked Reserves</Link>}
                      {canWrite && <button type="button" className={btn} onClick={() => removeProspect(p.id)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {prospects.filter((p) => p.result).map((p) => (
        <p key={p.id} className="text-xs text-pl-text" data-testid={`qi-pros-reasons-${p.id}`}><span className="font-semibold">{`${p.name}: ${p.result.assessment.label}.`}</span>{` ${p.result.assessment.reasons.join(' ')}`}{p.result.anomaly ? ` GRV ${f(p.result.anomaly.grvImpliedM3 / 1e6, 1)} million m3 to the implied contact, ${f(p.result.trap.grvSpillM3 / 1e6, 1)} million m3 to spill.` : ` GRV ${f(p.result.trap.grvSpillM3 / 1e6, 1)} million m3 to spill.`}</p>
      ))}
      {!currentProjectId && prospects.some((p) => p.result) && <p className={muted}>Save the project to send the records to Risked Reserves Valuation.</p>}
      {draft ? (
        <Editor draft={draft} setDraft={setDraft} surfaces={surfaces} onAnalyse={analyse} busy={busy} error={error} targets={project.targets} />
      ) : (canWrite && <button type="button" className={btn} onClick={() => setDraft(blank(project.targets[0]))} disabled={!surfaces.length} data-testid="qi-pros-add">Add a prospect</button>)}
    </section>
  );
}
