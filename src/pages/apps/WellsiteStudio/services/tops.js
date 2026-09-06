// Tops glue (WS5): ws_tops rows for interpretations and official calls,
// the per-formation view the screens show, approval, and the evidence
// chain from a call back to what supported it. Pure; the backend writes.

import { formationKey, chainHeads, versionChain, currentCall, currentInterpretation, topConflicts, canTransition, approachPanel, toRegistryTop, TOP_STATUSES, CONFIDENCES } from '@/lib/wellsite/tops';
import { mdToTvd } from '@/lib/wellsite/depth';

export { formationKey, chainHeads, versionChain, currentCall, currentInterpretation, topConflicts, canTransition, approachPanel, toRegistryTop, TOP_STATUSES, CONFIDENCES };

/** May this user approve on this well (finalise tops, resolve conflicts)? */
export function canApprove(user, members, well) {
  if (!user || !well) return false;
  const roles = (well.settings && well.settings.approver_roles) || [];
  const m = (members || []).find((x) => x.user_id === user.id && x.status === 'active');
  return !!(m && roles.includes(m.role));
}
export function memberRole(user, members) {
  const m = (members || []).find((x) => x.user_id === (user && user.id) && x.status === 'active');
  return m ? m.role : null;
}

/** The current prognosis (highest version) from the local prognosis rows. */
export function currentPrognosis(rows) {
  if (!rows || !rows.length) return null;
  return [...rows].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
}

/**
 * One row per formation: prognosis, interpretation, call, chain, conflicts.
 * @param {Object} p { tops, prognosis, bitMdM, ctx }
 */
export function formationBoard({ tops, prognosis, bitMdM, ctx }) {
  const keys = new Map();
  for (const t of (prognosis && prognosis.tops) || []) keys.set(t.formation_key || formationKey(t.name), { key: t.formation_key || formationKey(t.name), name: t.name, prognosis: t });
  for (const r of tops) if (!keys.has(r.formation_key)) keys.set(r.formation_key, { key: r.formation_key, name: r.name, prognosis: null });
  const conflicts = topConflicts(tops);
  const offsetsByKey = new Map();
  for (const o of (prognosis && prognosis.offset_tops) || []) {
    const k = o.formation_key || formationKey(o.name);
    if (!offsetsByKey.has(k)) offsetsByKey.set(k, []);
    offsetsByKey.get(k).push(o);
  }
  const rows = [...keys.values()].map((f) => {
    const { call, competing } = currentCall(tops, f.key);
    const { interpretation, competing: competingInterp } = currentInterpretation(tops, f.key);
    const prog = f.prognosis ? { mdM: f.prognosis.md_m, uncertaintyM: f.prognosis.uncertainty_m || 0 } : null;
    const panel = approachPanel({ formation: f.name, prognosis: prog, bitMdM, ctx, offsetTops: (offsetsByKey.get(f.key) || []).map((o) => ({ well: o.well_name, tvdssM: o.tvdss_m })), interpretation, call });
    return {
      ...f, call, competing, interpretation, competingInterp, panel, offsets: offsetsByKey.get(f.key) || [],
      conflicts: conflicts.filter((c) => c.formationKey === f.key),
      sortMd: prog ? prog.mdM : (call ? call.md_calc_m : (interpretation ? interpretation.md_calc_m : Infinity)),
    };
  }).sort((a, b) => a.sortMd - b.sortMd);
  const next = rows.find((r) => r.panel.prognosisMdM != null && !r.panel.passed && !(r.call && r.call.status === 'final')) || null;
  return { rows, next, conflicts };
}

/** Build the parameters for an interpretation row. */
export function interpretationParams({ name, rangeTop, rangeBase, confidence, basis, evidenceIds = [], unitId = null }) {
  if (!(name && name.trim())) throw new Error('A formation name is required.');
  if (!CONFIDENCES.includes(confidence)) throw new Error('An interpretation needs a confidence of low, medium or high.');
  if (!(rangeTop && Number.isFinite(rangeTop.value)) || !(rangeBase && Number.isFinite(rangeBase.value))) throw new Error('An interpretation needs the top and base of the depth range.');
  return { role: 'interpretation', status: 'preliminary', name: name.trim(), formationKey: formationKey(name), confidence, basis: basis || null, evidenceIds, unitId, depth: { ...rangeTop, kind: 'logged' }, rangeBase: { ...rangeBase, kind: 'logged' } };
}

/** Build the parameters for an official call. */
export function callParams({ name, depth, status, basis, confidence = null, evidenceIds = [], unitId = null, previous = null }) {
  if (!(name && name.trim())) throw new Error('A formation name is required.');
  if (!(depth && Number.isFinite(depth.value))) throw new Error('A call needs a depth.');
  const c = canTransition(previous ? previous.status : null, status);
  if (!c.ok) throw new Error(c.reason);
  if (!(basis && basis.trim())) throw new Error('A call needs its basis, the evidence it rests on.');
  return { role: 'official', status, name: name.trim(), formationKey: formationKey(name), confidence, basis: basis.trim(), evidenceIds, unitId, depth: { ...depth, kind: 'logged' } };
}

/** Offset tops from registry rows: TVDSS through each offset well's own survey. */
export function offsetTopsFrom(offsetWells) {
  const out = [];
  for (const w of offsetWells) {
    const ctx = { kbElevM: w.kb_m ?? 0, survey: Array.isArray(w.deviation) && w.deviation.length >= 2 ? { stations: w.deviation, version: 'registry' } : null };
    for (const t of w.tops || []) {
      const c = mdToTvd(t.md_m, ctx);
      out.push({ well_id: w.id, well_name: w.name, name: t.name, formation_key: formationKey(t.name), md_m: t.md_m, tvd_m: c.tvdM, tvdss_m: c.tvdssM, surface_type: t.surface_type || 'formation_top' });
    }
  }
  return out;
}

/** Walk the evidence chain backwards from a call (or any record) through evidence ids. */
export function evidenceChain(start, { tops, records }) {
  const byId = new Map();
  for (const r of tops) byId.set(r.id, { ...r, entity: 'top' });
  for (const r of records) byId.set(r.id, { ...r, entity: 'record' });
  const seen = new Set();
  const out = [];
  const walk = (id, depth) => {
    if (!id || seen.has(id) || depth > 8) return;
    seen.add(id);
    const r = byId.get(id);
    if (!r) return;
    out.push({ ...r, depth });
    for (const e of r.evidence_ids || []) walk(e, depth + 1);
    if (r.previous_version_id) walk(r.previous_version_id, depth + 1);
  };
  walk(start.id, 0);
  return out;
}
