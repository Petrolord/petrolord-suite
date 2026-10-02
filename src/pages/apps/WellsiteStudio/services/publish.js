// Publish to the well registry (WS9, spec sections 39 and 40): final
// official calls to geo_wells_tops, cuttings descriptions to
// geo_wells_intervals (kind lithology, source cuttings), selected
// photographs to geo_wells_core_images. Overwrite-own contract like Pore
// Pressure Studio's published curves: a republish replaces only the rows
// this app wrote for the well (marked in notes or properties), never a
// hand-typed row or another app's. Pure; the backend does the writes
// under the registry's owner-only rule.

import { toRegistryTop, chainHeads } from '@/lib/wellsite/tops';
import { toIntervalRow, dominantLithology } from '@/lib/wellsite/descriptionVocabulary';
import { abbreviate } from '@/lib/wellsite/abbreviations';

export const WS_PIPELINE = 'ws-1.0.0';
export const PROGNOSIS_SUFFIX = ' (prognosis)';
export const TOP_MARK = /Wellsite Studio ws-1\.0\.0 \| top ([0-9a-f-]{36})/;

/** The final official calls, one per formation (heads only). */
export function finalTopsToPublish(tops, { interpreterName = null } = {}) {
  const heads = chainHeads(tops.filter((t) => t.role === 'official'));
  return heads.filter((t) => t.status === 'final').map((t) => ({ source: t, row: toRegistryTop(t, { interpreterName }) }));
}

/** Current cuttings descriptions (not superseded) as lithology intervals. */
export function descriptionsToPublish(records, profile) {
  const superseded = new Set(records.map((r) => r.supersedes_id).filter(Boolean));
  const descs = records.filter((r) => r.kind === 'observation' && r.subtype === 'cuttings_description' && !superseded.has(r.id) && Number.isFinite(r.md_calc_m) && Number.isFinite(r.md2_calc_m));
  return descs.map((r) => {
    const d = { id: r.id, mdTopM: r.md_calc_m, mdBaseM: r.md2_calc_m, components: r.payload.components || [], comment: r.payload.comment || '' };
    const row = toIntervalRow(d, { abbrev: abbreviate({ components: d.components, comment: d.comment }, profile).text });
    row.interpreter = r.created_by || null;
    return { source: r, row };
  }).filter((x) => x.row.code && dominantLithology({ components: x.source.payload.components || [] }));
}

/** Registry rows this app wrote earlier for the well (to replace on republish). */
export function staleOwnTops(existingTops) {
  return (existingTops || []).filter((t) => TOP_MARK.test(String(t.notes || '')));
}
export function staleOwnIntervals(existingIntervals) {
  return (existingIntervals || []).filter((i) => i.kind === 'lithology' && i.source === 'cuttings' && i.properties && i.properties.ws_pipeline === WS_PIPELINE);
}

/** The plan of a publish: what goes in, what comes out, what is untouched. */
export function publishPlan({ tops, records, profile, existingTops = [], existingIntervals = [] }) {
  const topsOut = finalTopsToPublish(tops);
  const intervalsOut = descriptionsToPublish(records, profile);
  // WS-U1-013 (PL9): a formation that already has a registry top from another
  // source (a prognosis typed in Well Data Manager) gains a second top of the
  // same name; that row is never touched, so the publish says so
  const own = new Set(staleOwnTops(existingTops).map((t) => t.id));
  const otherNames = new Set((existingTops || []).filter((t) => !own.has(t.id)).map((t) => String(t.name || '').trim().toLowerCase()));
  const sameNameOther = topsOut.map((t) => t.row.name).filter((n) => otherNames.has(String(n).trim().toLowerCase()));
  // U2-010: the other-source rows themselves, each with the name it would take if kept apart as the prognosis
  const outNames = new Set(topsOut.map((t) => String(t.row.name).trim().toLowerCase()));
  const duplicates = (existingTops || []).filter((t) => !own.has(t.id) && outNames.has(String(t.name || '').trim().toLowerCase()))
    .map((t) => ({ id: t.id, name: t.name, md_m: t.md_m, interpreter: t.interpreter || null, notes: t.notes || null, newName: `${String(t.name).trim()}${PROGNOSIS_SUFFIX}`, row: t }));
  return {
    tops: topsOut, intervals: intervalsOut, sameNameOther, duplicates,
    replaceTops: staleOwnTops(existingTops), replaceIntervals: staleOwnIntervals(existingIntervals),
    untouchedTops: existingTops.length - staleOwnTops(existingTops).length,
    untouchedIntervals: existingIntervals.length - staleOwnIntervals(existingIntervals).length,
  };
}

// ---- U2-010: the staged publish (closes WS-U1-025 and the rest of WS-U1-013) ----
//
// The registry has no transaction a browser can open, so the publish is
// staged in an order that never leaves the well without its tops, and
// every step is undone if a later one fails:
//
//   1 insert the new tops            (the earlier ones are still there)
//   2 insert the new intervals
//   3 rename the chosen same-name tops from other sources to "... (prognosis)"
//   4 delete this app's earlier tops
//   5 delete this app's earlier intervals
//   6 upload the chosen photographs  (a failure here is reported, the tops stand)
//
// A failure in steps 1 to 5 rolls back in reverse: deleted rows are put
// back from the copies read before the publish, names restored, inserted
// rows removed. The report says what was undone and, if an undo itself
// failed, exactly which rows are left for the user to tidy. `ops` is the
// transport's registry port, so the fake and Supabase run this one code.

const describe = (e) => String(e && e.message ? e.message : e);

/**
 * @param {Object} p { plan, ops, renameIds: string[], photos: [{photo, blob}], interpreter }
 * @param {Object} p.ops { insertTop(row)->{id}, deleteTop(row), renameTop(row, name, notes)->row, insertInterval(row)->{id}, deleteInterval(row), uploadPhoto({photo, blob})->{id} }
 * @returns {{ ok, tops, intervals, renamed, photos, failedAt, error, rolledBack, rollbackErrors, log }}
 */
export async function runPublish({ plan, ops, renameIds = [], photos = [], interpreter = null, at = new Date().toISOString() }) {
  const log = [];
  const done = { tops: [], intervals: [], renamed: [], deletedTops: [], deletedIntervals: [] };
  let step = 'insert the new tops';
  try {
    for (const t of plan.tops) { const row = { ...t.row, interpreter: t.row.interpreter || interpreter }; const saved = await ops.insertTop(row); done.tops.push({ id: saved.id, row }); }
    log.push(`${done.tops.length} top(s) added`);
    step = 'insert the new lithology intervals';
    for (const i of plan.intervals) { const saved = await ops.insertInterval(i.row); done.intervals.push({ id: saved.id, row: i.row }); }
    log.push(`${done.intervals.length} interval(s) added`);
    step = 'rename the earlier tops kept apart as the prognosis';
    for (const d of (plan.duplicates || []).filter((x) => renameIds.includes(x.id))) {
      const note = `${d.notes ? `${d.notes} | ` : ''}Renamed from "${d.name}" by a Wellsite Studio publish on ${at.slice(0, 10)}: kept apart from the top as drilled.`;
      await ops.renameTop(d.row, d.newName, note);
      done.renamed.push(d);
    }
    if (done.renamed.length) log.push(`${done.renamed.length} earlier top(s) renamed as the prognosis`);
    step = 'remove the tops this app published before';
    for (const t of plan.replaceTops) { await ops.deleteTop(t); done.deletedTops.push(t); }
    step = 'remove the intervals this app published before';
    for (const i of plan.replaceIntervals) { await ops.deleteInterval(i); done.deletedIntervals.push(i); }
    log.push(`${done.deletedTops.length} earlier top(s) and ${done.deletedIntervals.length} earlier interval(s) of this app removed`);
  } catch (e) {
    const rollbackErrors = [];
    const attempt = async (what, fn) => { try { await fn(); } catch (err) { rollbackErrors.push(`${what}: ${describe(err)}`); } };
    const strip = ({ id, well_id, created_at, updated_at, ...rest }) => rest; // eslint-disable-line no-unused-vars
    for (const i of done.deletedIntervals) await attempt(`put back the interval ${i.top_md_m} to ${i.base_md_m} m`, () => ops.insertInterval(strip(i)));
    for (const t of done.deletedTops) await attempt(`put back the top ${t.name}`, () => ops.insertTop(strip(t)));
    for (const d of done.renamed) await attempt(`restore the name of ${d.name}`, () => ops.renameTop({ ...d.row, name: d.newName }, d.name, d.notes));
    for (const i of done.intervals) await attempt(`remove the new interval ${i.row.top_md_m} to ${i.row.base_md_m} m`, () => ops.deleteInterval({ id: i.id }));
    for (const t of done.tops) await attempt(`remove the new top ${t.row.name}`, () => ops.deleteTop({ id: t.id, name: t.row.name }));
    return { ok: false, failedAt: step, error: describe(e), rolledBack: rollbackErrors.length === 0, rollbackErrors, log, tops: { ids: [], replaced: 0 }, intervals: { ids: [], replaced: 0 }, renamed: [], photos: { ids: [], failed: [] } };
  }
  const photoIds = []; const failed = [];
  for (const ph of photos) { try { const saved = await ops.uploadPhoto(ph); photoIds.push(saved.id); } catch (e) { failed.push({ id: ph.photo.id, error: describe(e) }); } }
  if (photos.length) log.push(`${photoIds.length} photograph(s) uploaded${failed.length ? `, ${failed.length} failed` : ''}`);
  return {
    ok: true, failedAt: null, error: null, rolledBack: false, rollbackErrors: [], log,
    tops: { ids: done.tops.map((t) => t.id), replaced: done.deletedTops.length }, intervals: { ids: done.intervals.map((i) => i.id), replaced: done.deletedIntervals.length },
    renamed: done.renamed.map((d) => ({ id: d.id, from: d.name, to: d.newName })), photos: { ids: photoIds, failed },
  };
}

/** The sentence a failed publish leaves on the screen: what failed, and what state the registry is in. */
export function publishFailureText(r) {
  const head = `The publish stopped at "${r.failedAt}": ${r.error}.`;
  if (r.rolledBack) return `${head} Every step already taken was undone: the registry holds what it held before.`;
  return `${head} Undoing it did not fully succeed, so the registry needs tidying in Well Data Manager: ${r.rollbackErrors.join('; ')}.`;
}

/** What the publish will do, as lines for the plan panel. */
export function planLines(plan, { photos = 0, fmt = (m) => `${m.toFixed(1)} m` } = {}) {
  const out = [];
  out.push(`${plan.tops.length} final top(s) will be added as drilled${plan.tops.length ? `: ${plan.tops.map((t) => `${t.row.name} at ${fmt(t.row.md_m)} MD`).join('; ')}` : ''}.`);
  out.push(`${plan.intervals.length} lithology interval(s) from the current descriptions will be added.`);
  if (plan.replaceTops.length || plan.replaceIntervals.length) out.push(`${plan.replaceTops.length} top(s) and ${plan.replaceIntervals.length} interval(s) this app published before will be removed after the new ones are in.`);
  out.push(`${plan.untouchedTops + plan.untouchedIntervals} row(s) from other sources are not touched${(plan.duplicates || []).length ? ', except the renames you tick below' : ''}.`);
  if (photos) out.push(`${photos} photograph(s) will be uploaded as core images.`);
  return out;
}
