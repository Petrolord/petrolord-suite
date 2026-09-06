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
  return {
    tops: topsOut, intervals: intervalsOut,
    replaceTops: staleOwnTops(existingTops), replaceIntervals: staleOwnIntervals(existingIntervals),
    untouchedTops: existingTops.length - staleOwnTops(existingTops).length,
    untouchedIntervals: existingIntervals.length - staleOwnIntervals(existingIntervals).length,
  };
}
