// Formation tops (spec sections 23 to 26): the prognosis with its
// version and date, one row per formation with its interpretation,
// its official call and their chains, the interpretation and call forms
// (separate records), and conflicts for an approver. Withdrawn calls
// never publish.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import ConflictResolver from './ConflictResolver';
import { versionChain, CONFIDENCES, TOP_STATUSES, canTransition, interpretationParams, callParams, evidenceChain, prognosisDifference } from '../services/tops';
import { fmtDepth, depthToDisplay } from '../services/units';
import { planLines } from '../services/publish';
import { toRigLocal } from '@/lib/wellsite/time';

export default function TopsView({ board, tops, records, prognosis, ctx, defaults, unit, offsetMin, approver, online, canAdmin, onInterpret, onCall, onResolve, onLoadPrognosis, onAddPrognosisTop, onPublish, onPublishPlan = null, onStatus, userName, geoWellId = null, loadRegistryWells = null, nameOf = null, photos = [] }) {
  const who = (id) => (nameOf ? nameOf(id) : (id === 'user-a' ? userName : id));
  // WS-U1-016: the help promised chosen photographs publish as core images, but nothing chose them
  const [publishPhotoIds, setPublishPhotoIds] = useState([]);
  // U2-010: the plan is shown, and the same-name tops to keep apart are chosen, before anything is written
  const [plan, setPlan] = useState(null);
  const [renameIds, setRenameIds] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const openPlan = async () => {
    if (!onPublishPlan) { onPublish(publishPhotoIds); return; }
    try { const p = await onPublishPlan(); setPlan(p); setRenameIds((p.duplicates || []).map((d) => d.id)); } catch (e) { onStatus?.(e.message); }
  };
  const confirmPublish = async () => { setPublishing(true); try { const ok = await onPublish(publishPhotoIds, renameIds); if (ok !== false) setPlan(null); } finally { setPublishing(false); } };
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null); // { kind:'interpret'|'call', key, name }
  const [name, setName] = useState('');
  const [top, setTop] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const [base, setBase] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const [confidence, setConfidence] = useState('medium');
  const [status, setStatus] = useState('preliminary');
  const [basis, setBasis] = useState('');
  const [evidenceSel, setEvidenceSel] = useState([]);
  const [progName, setProgName] = useState('');
  const [progDepth, setProgDepth] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const [progUnc, setProgUnc] = useState('15');
  const [chainOf, setChainOf] = useState(null);
  // offset wells for the next Load from registry (Ekene kit finding 2026-09-23: nothing chose them, so
  // no prognosis ever carried offset tops); the last version's choice is the starting point
  const [registryWells, setRegistryWells] = useState(null);
  const [offsetIds, setOffsetIds] = useState(() => (prognosis && prognosis.source && prognosis.source.offset_well_ids) || []);
  const lastOffsetKey = JSON.stringify((prognosis && prognosis.source && prognosis.source.offset_well_ids) || []);
  // a new prognosis version re-seeds the chooser, unless the user has changed
  // it since the last Load: the version can arrive after their click
  const offsetsTouched = useRef(false);
  useEffect(() => { if (!offsetsTouched.current) setOffsetIds(JSON.parse(lastOffsetKey)); }, [lastOffsetKey]);
  // another well: its own prognosis seeds the chooser
  useEffect(() => { offsetsTouched.current = false; setOffsetIds(JSON.parse(lastOffsetKey)); }, [geoWellId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    if (!canAdmin || !online || !loadRegistryWells) return undefined;
    loadRegistryWells().then((w) => { if (alive) setRegistryWells((w || []).filter((x) => x.id !== geoWellId)); }).catch(() => { if (alive) setRegistryWells([]); });
    return () => { alive = false; };
  }, [canAdmin, online, loadRegistryWells, geoWellId]);
  const toggleOffset = (id) => { offsetsTouched.current = true; return setOffsetIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); };
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;
  const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';
  const recentEvidence = useMemo(() => [...records].filter((r) => r.kind === 'observation').sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 12), [records]);

  const startForm = (kind, row) => {
    setForm({ kind, key: row ? row.key : null });
    setName(row ? row.name : '');
    const prevCall = row && row.call;
    if (kind === 'call') {
      const allowed = TOP_STATUSES.filter((s) => canTransition(prevCall ? prevCall.status : null, s).ok);
      setStatus(allowed[0] || 'preliminary');
      // a revision starts from the current call's depth, a first call from the interpretation's range top
      const seedMd = prevCall ? prevCall.md_calc_m : (row && row.interpretation ? row.interpretation.range_top_md_m : NaN);
      setTop({ value: Number.isFinite(seedMd) ? depthToDisplay(seedMd, defaults.unit) : NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
      setEvidenceSel(row && row.interpretation ? [row.interpretation.id] : []);
    } else {
      setTop({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
      setBase({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
      setEvidenceSel([]);
    }
    setBasis('');
  };
  const submit = async () => {
    try {
      const row = board.rows.find((r) => r.key === form.key) || null;
      if (form.kind === 'interpret') {
        await onInterpret(interpretationParams({ name, rangeTop: top, rangeBase: base, confidence, basis, evidenceIds: evidenceSel, unitId: row && row.prognosis ? row.prognosis.unit_id : null }), row);
      } else {
        await onCall(callParams({ name, depth: top, status, basis, confidence: row && row.interpretation ? row.interpretation.confidence : null, evidenceIds: evidenceSel, unitId: row && row.prognosis ? row.prognosis.unit_id : null, previous: row ? row.call : null }), row);
      }
      setForm(null);
    } catch (e) { onStatus?.(e.message); }
  };
  const allowedStatuses = (row) => TOP_STATUSES.filter((s) => canTransition(row && row.call ? row.call.status : null, s).ok).filter((s) => s !== 'final' || approver);

  return (
    <div className="p-4 space-y-4" data-testid="ws-tops">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-pl-text">Formation tops</h2>
        <span className="text-[11px] text-pl-muted" data-testid="ws-prognosis-version">
          {prognosis ? `Prognosis version ${prognosis.version}, loaded ${toRigLocal(Date.parse(prognosis.loaded_at || prognosis.client_created_at), offsetMin).iso.replace('T', ' ')} rig time, ${(prognosis.tops || []).length} top(s), ${(prognosis.offset_tops || []).length} offset top(s)` : 'No prognosis loaded.'}
        </span>
        {canAdmin && <Button size="sm" variant="outline" disabled={!online} onClick={() => { offsetsTouched.current = false; onLoadPrognosis(offsetIds); }} data-testid="ws-prognosis-load" title={online ? 'Load the prognosis from the registry (a new version)' : 'Needs a connection'}>Load from registry</Button>}
        {canAdmin && online && registryWells && (
          <details className="text-[11px] text-pl-text" data-testid="ws-prognosis-offsets">
            <summary className="cursor-pointer text-pl-muted" data-testid="ws-prognosis-offsets-summary">Offset wells ({offsetIds.length} chosen)</summary>
            <div className="mt-1 flex flex-wrap gap-2 max-w-xl">
              {registryWells.length === 0 && <span className="text-pl-muted">No other registry well to use as an offset.</span>}
              {registryWells.map((w) => (
                <label key={w.id} className="flex items-center gap-1"><input type="checkbox" checked={offsetIds.includes(w.id)} onChange={() => toggleOffset(w.id)} data-testid={`ws-prognosis-offset-${w.name}`} />{w.name}</label>
              ))}
            </div>
            <div className="text-pl-muted mt-1">The chosen wells' tops, through their own surveys, load with the next Load from registry.</div>
          </details>
        )}
        {board.conflicts.length > 0 && <span className="text-[11px] text-pl-warning-text" data-testid="ws-tops-conflicts">{board.conflicts.length} conflict(s)</span>}
        {onPublish && photos.length > 0 && (
          <details className="text-[11px] text-pl-text" data-testid="ws-publish-photos">
            <summary className="cursor-pointer text-pl-muted">Photographs to publish ({publishPhotoIds.length} chosen)</summary>
            <div className="mt-1 flex flex-wrap gap-2 max-w-xl">
              {photos.map((p) => (
                <label key={p.id} className="flex items-center gap-1"><input type="checkbox" checked={publishPhotoIds.includes(p.id)} data-testid={`ws-publish-photo-${p.id}`}
                  onChange={() => setPublishPhotoIds((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))} />
                  {p.caption || 'photo'}{Number.isFinite(p.md_calc_m) ? ` ${fmtDepth(p.md_calc_m, unit)}` : ''}</label>
              ))}
            </div>
            <div className="text-pl-muted mt-1">Chosen photographs go to the registry as core images with the next Publish.</div>
          </details>
        )}
        {onPublish && <Button size="sm" variant="outline" disabled={!online} onClick={openPlan} data-testid="ws-top-publish" title={online ? 'Publish final calls and current descriptions to the shared well registry (registry owner only)' : 'Needs a connection'}>Publish to registry</Button>}
      </div>

      {plan && (
        <div className="rounded border border-pl-border bg-pl-surface p-3 space-y-2 text-xs text-pl-text" data-testid="ws-publish-plan">
          <div className="font-semibold">Publish plan</div>
          <ul className="list-disc pl-5 space-y-0.5" data-testid="ws-publish-plan-lines">{planLines(plan, { photos: publishPhotoIds.length }).map((l) => <li key={l}>{l}</li>)}</ul>
          {(plan.duplicates || []).length > 0 && (
            <div className="space-y-1" data-testid="ws-publish-duplicates">
              <div className="text-pl-warning-text">The registry already holds a top of the same name from another source. Downstream apps pick tops by name, so keep the earlier one apart as the prognosis, or leave both under one name.</div>
              {plan.duplicates.map((d) => (
                <label key={d.id} className="flex items-center gap-1"><input type="checkbox" checked={renameIds.includes(d.id)} data-testid={`ws-publish-rename-${d.id}`}
                  onChange={() => setRenameIds((cur) => (cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id]))} />
                  Rename the earlier {d.name} at {fmtDepth(d.md_m, unit)}{d.interpreter ? ` (${d.interpreter})` : ''} to {d.newName}</label>
              ))}
            </div>
          )}
          <div className="text-pl-muted">The new rows are written first and this app's earlier ones removed after, so the well is never without its tops. If a step fails, the steps already taken are undone and the result says what the registry holds.</div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={confirmPublish} disabled={publishing || (plan.tops.length === 0 && plan.intervals.length === 0)} data-testid="ws-publish-confirm">{publishing ? 'Publishing' : 'Publish'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPlan(null)} data-testid="ws-publish-cancel">Cancel</Button>
            {plan.tops.length === 0 && plan.intervals.length === 0 && <span className="text-pl-muted" data-testid="ws-publish-nothing">Nothing to publish yet: no final call and no description.</span>}
          </div>
        </div>
      )}

      <table className="text-xs text-pl-text w-full">
        <thead><tr className="text-[10px] uppercase text-pl-muted"><th className="text-left pr-3">Formation</th><th className="text-left pr-3">Prognosis</th><th className="text-left pr-3">Interpretation</th><th className="text-left pr-3">Call</th><th className="text-left pr-3" title="True vertical depth subsea, positive below MSL">Call TVDSS</th><th className="text-left pr-3" title="Call against prognosis, subsea: high is shallower than prognosed">vs prognosis</th><th className="text-left">Actions</th></tr></thead>
        <tbody>
          {board.rows.map((r) => (
            <React.Fragment key={r.key}>
              <tr data-testid={`ws-top-row-${r.key}`} data-status={r.call ? r.call.status : 'none'} className={r.conflicts.length ? 'text-pl-warning-text' : ''}>
                <td className="pr-3 whitespace-nowrap">{r.name}{r.prognosis && r.prognosis.source === 'manual' ? <span className="text-pl-muted"> (manual)</span> : null}</td>
                <td className="pr-3 whitespace-nowrap">{r.prognosis ? `${fmtDepth(r.prognosis.md_m, unit)} ±${fmtDepth(r.prognosis.uncertainty_m || 0, unit)}` : ''}{r.offsets.length ? <span className="text-pl-muted"> ({r.offsets.length} offsets)</span> : null}</td>
                <td className="pr-3 whitespace-nowrap" data-testid={`ws-top-interp-${r.key}`}>{r.interpretation ? `${fmtDepth(r.interpretation.range_top_md_m, unit)} to ${fmtDepth(r.interpretation.range_base_md_m, unit)}, ${r.interpretation.confidence}` : ''}</td>
                <td className="pr-3 whitespace-nowrap" data-testid={`ws-top-call-${r.key}`}>{r.call ? `${fmtDepth(r.call.md_calc_m, unit)} ${r.call.status} v${r.call.version_no}` : ''}{r.competing.length ? <span className="text-pl-warning-text"> competing</span> : null}</td>
                {(() => { const d = prognosisDifference(r, ctx); return (
                  <>
                    <td className="pr-3 whitespace-nowrap" data-testid={`ws-top-tvdss-${r.key}`}>{d && Number.isFinite(d.callTvdssM) ? fmtDepth(d.callTvdssM, unit) : ''}</td>
                    <td className="pr-3 whitespace-nowrap" data-testid={`ws-top-vsprog-${r.key}`}>{d && d.word ? (d.word === 'on prognosis' ? d.word : `${fmtDepth(Math.abs(d.diffM), unit)} ${d.word}`) : ''}</td>
                  </>
                ); })()}
                <td className="whitespace-nowrap">
                  <button type="button" onClick={() => startForm('interpret', r)} data-testid={`ws-top-interpret-${r.key}`} className="mr-1 px-1.5 py-0.5 rounded border border-pl-border hover:bg-pl-sunken">Interpret</button>
                  <button type="button" onClick={() => startForm('call', r)} data-testid={`ws-top-callbtn-${r.key}`} className="mr-1 px-1.5 py-0.5 rounded border border-pl-primary text-pl-primary-text hover:bg-pl-primary/10">{r.call ? 'Revise call' : 'Call'}</button>
                  {(r.call || r.interpretation) && <button type="button" onClick={() => setChainOf(chainOf === r.key ? null : r.key)} data-testid={`ws-top-chain-${r.key}`} className="px-1.5 py-0.5 rounded border border-pl-border hover:bg-pl-sunken">History</button>}
                </td>
              </tr>
              {r.conflicts.length > 0 && (
                <tr><td colSpan={7} className="py-1">
                  {r.conflicts.map((c) => (
                    <ConflictResolver key={c.headIds.join('+')} heads={c.headIds.map((id) => tops.find((t) => t.id === id)).filter(Boolean)} approver={approver} unit={unit} offsetMin={offsetMin} userName={userName}
                      onResolve={(chosen, why, heads) => onResolve(chosen, why, heads)} nameOf={nameOf} />
                  ))}
                </td></tr>
              )}
              {chainOf === r.key && (
                <tr><td colSpan={7} className="py-1">
                  <div className="rounded border border-pl-border bg-pl-surface p-2 space-y-1" data-testid={`ws-top-history-${r.key}`}>
                    {[...new Set(tops.filter((t) => t.formation_key === r.key).map((t) => t.chain_id))].map((chainId) => (
                      <div key={chainId}>
                        {versionChain(tops, chainId).map((v) => (
                          <div key={v.id} className="text-[11px] text-pl-muted" data-testid={`ws-top-version-${v.id}`}>
                            v{v.version_no} {v.role} {v.status} {fmtDepth(v.md_calc_m, unit)}{v.role === 'interpretation' ? ` to ${fmtDepth(v.range_base_md_m, unit)}, ${v.confidence}` : ''} at {local(v.occurred_at)} by {who(v.created_by)}{v.basis ? `: ${v.basis}` : ''}{v.resolves_ids && v.resolves_ids.length ? ` (resolves ${v.resolves_ids.length} competing versions)` : ''}
                          </div>
                        ))}
                      </div>
                    ))}
                    {r.call && (
                      <div className="text-[10px] text-pl-muted pt-1">Evidence chain of the call: {evidenceChain(r.call, { tops, records }).slice(1).map((e) => `${e.entity === 'top' ? `${e.role} v${e.version_no}` : e.subtype} ${Number.isFinite(e.md_calc_m) ? fmtDepth(e.md_calc_m, unit) : ''}`).join(' <- ') || 'none cited'}</div>
                    )}
                  </div>
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {board.rows.length === 0 && <div className="text-xs text-pl-muted" data-testid="ws-tops-empty">No prognosis tops yet. Load from the registry or add one below.</div>}

      {form && (
        <div className="rounded border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="ws-top-form">
          <div className="text-xs text-pl-text">{form.kind === 'interpret' ? 'Interpretation: what the evidence suggests' : 'Official call: the top as called'}</div>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-[10px] text-pl-muted">Formation<br /><input value={name} onChange={(e) => setName(e.target.value)} data-testid="ws-top-name" className={`${sel} w-40`} /></label>
            <div><div className="text-[10px] text-pl-muted">{form.kind === 'interpret' ? 'Range top' : 'Depth'}</div><DepthEntry value={top} onChange={setTop} kind="logged" ctx={ctx} compact testIdPrefix="ws-top-depth" /></div>
            {form.kind === 'interpret' && <div><div className="text-[10px] text-pl-muted">Range base</div><DepthEntry value={base} onChange={setBase} kind="logged" ctx={ctx} compact testIdPrefix="ws-top-base" /></div>}
            {form.kind === 'interpret' ? (
              <label className="text-[10px] text-pl-muted">Confidence<br /><select value={confidence} onChange={(e) => setConfidence(e.target.value)} data-testid="ws-top-confidence" className={sel}>{CONFIDENCES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            ) : (
              <label className="text-[10px] text-pl-muted">Status<br /><select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ws-top-status" className={sel}>{allowedStatuses(board.rows.find((r) => r.key === form.key)).map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            )}
          </div>
          <label className="block text-[10px] text-pl-muted">{form.kind === 'interpret' ? 'Statement' : 'Basis'}<br /><input value={basis} onChange={(e) => setBasis(e.target.value)} data-testid="ws-top-basis" className={`${sel} w-full`} /></label>
          <div className="text-[10px] text-pl-muted">Evidence (observations cited)</div>
          <div className="flex flex-wrap gap-1">
            {recentEvidence.map((r) => (
              <label key={r.id} className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${evidenceSel.includes(r.id) ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}>
                <input type="checkbox" className="hidden" checked={evidenceSel.includes(r.id)} onChange={() => setEvidenceSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} data-testid={`ws-top-evidence-${r.id}`} />
                {local(r.occurred_at)} {r.subtype === 'cuttings_description' ? 'description' : r.subtype}{Number.isFinite(r.md_calc_m) ? ` ${fmtDepth(r.md_calc_m, unit)}` : ''}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} data-testid="ws-top-submit">{form.kind === 'interpret' ? 'Record interpretation' : 'Record call'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-pl-text">Add a prognosis top by hand</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-[10px] text-pl-muted">Formation<br /><input value={progName} onChange={(e) => setProgName(e.target.value)} data-testid="ws-prog-name" className={`${sel} w-40`} /></label>
          <div><div className="text-[10px] text-pl-muted">Depth</div><DepthEntry value={progDepth} onChange={setProgDepth} kind="prognosis" ctx={ctx} compact testIdPrefix="ws-prog-depth" /></div>
          <label className="text-[10px] text-pl-muted">Uncertainty ({progDepth.unit || unit})<br /><input type="number" value={progUnc} onChange={(e) => setProgUnc(e.target.value)} data-testid="ws-prog-unc" className={`${sel} w-20`} /></label>
          <Button size="sm" variant="outline" disabled={!canAdmin} onClick={async () => { try { await onAddPrognosisTop({ name: progName, depth: progDepth, uncertaintyDisplay: Number(progUnc), uncertaintyUnit: progDepth.unit || unit }); setProgName(''); setProgDepth({ ...progDepth, value: NaN }); } catch (e) { onStatus?.(e.message); } }} data-testid="ws-prog-add">Add (new prognosis version)</Button>
        </div>
      </section>
      {!form && board.rows.length > 0 && <Button size="sm" variant="ghost" onClick={() => startForm('interpret', null)} data-testid="ws-top-new">Interpret a formation not in the prognosis</Button>}
    </div>
  );
}
