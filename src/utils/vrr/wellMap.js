/**
 * The bubble map of the Voidage Replacement Monitor (VRR-U2-004): voidage by
 * well on the well locations of the wells registry (geo_wells), with the
 * cumulative VRR of each pattern at the centre of its producers.
 *
 * Owner default (Step 2 question 4): coordinates come from the registry
 * through an explicit match table the user confirms. A ledger well is
 * placed only when it is matched to a registry well AND the table is
 * confirmed; an unmatched well is listed, never placed by guess. Proposals
 * (same name, same UWI, or the same letters and digits) are only proposals.
 * The confirmed table keeps a snapshot of each matched well's coordinates,
 * CRS and unit with the project (the registry id is kept too), so the map
 * and the report do not move when the registry is edited later; "Read the
 * registry again" shows what changed.
 *
 * What is drawn (one value per well, reservoir barrels at the FVFs of each
 * month, from the engine's buildWellVoidage): a producer's produced voidage
 * (oil + water + its own free gas), an injector's injected volume (water +
 * gas). Patterns: their cumulative VRR at the mean position of their placed
 * producers.
 *
 * Saved shape (inputs.wellMap):
 *   { matches: { [ledgerWell]: { wellId, name, uwi, x, y, crs, xyUnit } | null },
 *     confirmedAt: ISO time | null,
 *     note }
 *
 * Pure.
 */
import { wellNameKey } from '@/lib/wellNames';

/** Letters and digits only, case-folded: "P-1", "p 1" and "P1" share a key. */
export const looseWellKey = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const reg = (w) => ({
  wellId: w.id, name: w.name, uwi: w.uwi || null,
  x: Number(w.surface_x), y: Number(w.surface_y), crs: w.crs || null, xyUnit: w.xy_unit || null,
});

/**
 * Proposed registry well for each ledger well.
 * @param {string[]} ledgerWells
 * @param {Array<{id, name, uwi?, surface_x, surface_y, crs?, xy_unit?}>} registry
 * @returns {Array<{well: string, wellId: ?string, how: ?('name'|'uwi'|'letters and digits'), note: string}>}
 */
export function proposeWellMatches(ledgerWells, registry) {
  const wells = (registry || []).filter((w) => w && w.id);
  return (ledgerWells || []).map((well) => {
    const tries = [
      ['name', (w) => wellNameKey(w.name) === wellNameKey(well)],
      ['uwi', (w) => w.uwi && wellNameKey(w.uwi) === wellNameKey(well)],
      ['letters and digits', (w) => looseWellKey(w.name) && looseWellKey(w.name) === looseWellKey(well)],
    ];
    for (const [how, test] of tries) {
      const hits = wells.filter(test);
      if (hits.length === 1) return { well, wellId: hits[0].id, how, note: how === 'name' ? 'Same name in the registry.' : how === 'uwi' ? 'Same UWI in the registry.' : `Same letters and digits as "${hits[0].name}"; check it is the same well.` };
      if (hits.length > 1) return { well, wellId: null, how: null, note: `${hits.length} registry wells could be this one (${hits.map((h) => h.name).join(', ')}): choose one.` };
    }
    return { well, wellId: null, how: null, note: 'No registry well with this name: choose one, or leave it off the map.' };
  });
}

/** The draft match table from proposals (nothing confirmed). */
export function draftMatches(proposals) {
  return Object.fromEntries((proposals || []).map((p) => [p.well, p.wellId ? { wellId: p.wellId } : null]));
}

/**
 * Confirm a match table: each chosen registry well's coordinates are kept
 * with the project. A chosen id the registry no longer holds is dropped and
 * named.
 * @returns {{wellMap: object, dropped: string[]}}
 */
export function confirmWellMatches(draft, registry, { at = new Date().toISOString() } = {}) {
  const byId = new Map((registry || []).map((w) => [w.id, w]));
  const matches = {};
  const dropped = [];
  for (const [well, m] of Object.entries(draft || {})) {
    if (!m?.wellId) { matches[well] = null; continue; }
    const w = byId.get(m.wellId);
    if (!w || !Number.isFinite(Number(w.surface_x)) || !Number.isFinite(Number(w.surface_y))) { matches[well] = null; dropped.push(well); continue; }
    matches[well] = reg(w);
  }
  return { wellMap: { matches, confirmedAt: at }, dropped };
}

/** Wells whose registry coordinates differ from the confirmed snapshot. */
export function registryChanges(wellMap, registry) {
  const byId = new Map((registry || []).map((w) => [w.id, w]));
  const out = [];
  for (const [well, m] of Object.entries(wellMap?.matches || {})) {
    if (!m?.wellId) continue;
    const w = byId.get(m.wellId);
    if (!w) out.push({ well, text: `${well}: the registry well "${m.name}" is no longer readable.` });
    else if (Number(w.surface_x) !== m.x || Number(w.surface_y) !== m.y || (w.crs || null) !== m.crs) out.push({ well, text: `${well}: "${w.name}" moved in the registry since the table was confirmed.` });
  }
  return out;
}

const centroid = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

/**
 * The bubble map of a derived model.
 * @param {object} d deriveVrr(inputs)
 * @param {object} wellMap inputs.wellMap
 * @returns {{ok: boolean, refusal: ?string, points: object[], unplaced: Array<{well: string, type: string, reason: string}>,
 *   patterns: object[], crs: ?string, xyUnit: ?string, confirmedAt: ?string}}
 */
export function buildBubbleMap(d, wellMap) {
  const none = (refusal) => ({ ok: false, refusal, points: [], unplaced: [], patterns: [], crs: null, xyUnit: null, confirmedAt: wellMap?.confirmedAt || null });
  if (!d?.isImported) return none('The map needs an imported per-well ledger (the period grid has no wells).');
  if (!d.wellVoidage) return none(d.withheld || 'No voidage by well.');
  if (!wellMap?.confirmedAt) return none('The match table between the ledger wells and the wells registry is not confirmed: confirm it on the Map tab. No well is placed by guess.');
  const points = [];
  const unplaced = [];
  for (const w of d.wellVoidage.wells) {
    if (w.type === 'unknown') continue;
    const m = wellMap.matches?.[w.well];
    const value = w.type === 'injector' ? w.injectedRB : w.producedRB;
    if (!m) { unplaced.push({ well: w.well, type: w.type, value, reason: 'Not matched to a registry well' }); continue; }
    points.push({ well: w.well, type: w.type, x: m.x, y: m.y, value, freeGasMscf: w.freeGasMscf, registryName: m.name, wellId: m.wellId, crs: m.crs, xyUnit: m.xyUnit });
  }
  if (!points.length) return { ...none('No ledger well is matched to a registry well.'), unplaced, confirmedAt: wellMap.confirmedAt };
  const crsSet = [...new Set(points.map((p) => p.crs || 'not stated'))];
  const unitSet = [...new Set(points.map((p) => p.xyUnit || 'not stated'))];
  if (crsSet.length > 1 || unitSet.length > 1) {
    return { ...none(`The matched wells are in different coordinate systems (${crsSet.join(', ')}; units ${unitSet.join(', ')}): the map is not drawn. Reproject them in Well Data Manager.`), unplaced, confirmedAt: wellMap.confirmedAt };
  }
  const placed = new Map(points.map((p) => [p.well, p]));
  const patterns = (d.patternAnalyses || []).filter((a) => !a.withheld && a.summary?.cumulativeVRR != null).map((a) => {
    const pp = (a.pattern.producers || []).map((x) => placed.get(x)).filter(Boolean);
    if (!pp.length) return { name: a.pattern.name, placed: false, cumulativeVRR: a.summary.cumulativeVRR, reason: 'none of its producers is placed' };
    return { name: a.pattern.name, placed: true, ...centroid(pp), cumulativeVRR: a.summary.cumulativeVRR, producers: pp.length };
  });
  return { ok: true, refusal: null, points, unplaced, patterns, crs: points[0].crs, xyUnit: points[0].xyUnit, confirmedAt: wellMap.confirmedAt };
}

/** Bubble size classes for the PDF (the kit draws one marker size per series): thirds of the largest value. */
export function sizeClasses(points) {
  const max = Math.max(0, ...points.map((p) => p.value));
  if (!(max > 0)) return [];
  return [1 / 3, 2 / 3, 1].map((f, i) => ({ index: i, upTo: max * f, from: i === 0 ? 0 : max * (f - 1 / 3) }));
}
