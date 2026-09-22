// Offset wells in THIS wellbore's chart frame (Plots/Section "Offsets").
//
// One definition of what an offset candidate is (the Anti-collision
// picker, the 3D scene and the Design plots all read it) and of how an
// offset lands in this wellbore's charts:
//   - plan: wellhead-relative N/E in the wellbore depth unit (the same
//     boundary targetFrame.js draws for targets);
//   - section: N/E projected onto this well's VS azimuth (the same
//     projection the section targets use), TVD below THIS well's KB, so
//     a KB elevation difference between wells is accounted for.
// Candidate stations are grid-azimuth metres (the wp station cache and
// the geo_wells deviation convention); heads and KB are site-CRS metres.
//
// Pure functions only; the async loaders live in offsetLoader.js.

import { M_TO_FT, computeWellPath } from '../engine/surveyMath';
import { MAX_TARGET_REACH_M } from './targetFrame';

const DEG = Math.PI / 180;

/** Vertical section of a wellhead-relative N/E point at `vsAzimuthDeg`. */
export function projectToSection(n, e, vsAzimuthDeg) {
  const az = vsAzimuthDeg * DEG;
  return n * Math.cos(az) + e * Math.sin(az);
}

/** The design an offset wellbore contributes: definitive, else the
 *  latest with at least two stations, else null. */
export function pickOffsetDesign(designs) {
  const withStations = (designs || []).filter((d) => Array.isArray(d.stations) && d.stations.length >= 2);
  return withStations.find((d) => d.status === 'definitive') || withStations[withStations.length - 1] || null;
}

/**
 * Offset candidates for a reference wellbore: the site's other
 * wellbores (their picked design) and registry wells with a deviation
 * in the site CRS (never this wellbore's own bridged registry well).
 * @returns {Array<{id, name, label, kind:'wp-plan'|'geo', stations, headX, headY, kbElevM}>}
 */
export function assembleOffsetCandidates({
  wellbores = [], designsByWellbore = {}, geoWells = [], wellbore = null, siteCrs = null,
}) {
  const out = [];
  for (const w of wellbores.filter((x) => x.id !== wellbore?.id)) {
    const d = designsByWellbore[w.id];
    if (!d || !Number.isFinite(w.head_x) || !Number.isFinite(w.head_y)) continue;
    out.push({
      id: `wp:${w.id}`,
      name: w.name,
      label: `${w.name} (${d.name} r${d.revision}${d.status === 'definitive' ? ', definitive' : ''})`,
      kind: 'wp-plan',
      stations: d.stations,
      headX: w.head_x,
      headY: w.head_y,
      kbElevM: w.kb_elev_m || 0,
    });
  }
  for (const g of (geoWells || [])) {
    if (g.id === wellbore?.geo_well_id) continue;
    if (!Array.isArray(g.deviation) || g.deviation.length < 2) continue;
    if ((g.crs || null) !== (siteCrs || null)) continue;
    if (!Number.isFinite(g.surface_x) || !Number.isFinite(g.surface_y)) continue;
    out.push({
      id: `geo:${g.id}`,
      name: g.name,
      label: `${g.name} (registry)`,
      kind: 'geo',
      stations: g.deviation,
      headX: g.surface_x,
      headY: g.surface_y,
      kbElevM: g.kb_m || 0,
    });
  }
  return out;
}

/** Default reach for "nearby" registry wells: this radius plus the
 *  plan's own horizontal reach, measured wellhead to wellhead. */
export const NEARBY_RADIUS_M = 2000;
export const MAX_DEFAULT_OFFSETS = 10;

/**
 * Which offsets the plots draw, and why. Preference:
 *  1. the offsets ticked on the Anti-collision tab for this design;
 *  2. the offsets of the design's latest saved anti-collision run;
 *  3. the site's other wellbores plus registry wells whose wellhead is
 *     within NEARBY_RADIUS_M + the plan's reach, nearest first, capped.
 * @returns {{list: Array, source: 'ac-selection'|'ac-run'|'nearby', missing: number}}
 */
export function chooseDisplayOffsets(candidates, {
  selectedIds = null, savedRunIds = null, wellhead = null, reachM = 0,
  radiusM = NEARBY_RADIUS_M, limit = MAX_DEFAULT_OFFSETS,
} = {}) {
  const byId = new Map((candidates || []).map((c) => [c.id, c]));
  const pickIds = (ids) => {
    const list = ids.map((id) => byId.get(id)).filter(Boolean);
    return { list, missing: ids.length - list.length };
  };
  if (Array.isArray(selectedIds) && selectedIds.length) {
    return { ...pickIds(selectedIds), source: 'ac-selection' };
  }
  if (Array.isArray(savedRunIds) && savedRunIds.length) {
    return { ...pickIds(savedRunIds), source: 'ac-run' };
  }
  const dist = (c) => (wellhead ? Math.hypot(c.headX - wellhead.x, c.headY - wellhead.y) : Infinity);
  const within = (radiusM || 0) + (Number.isFinite(reachM) ? reachM : 0);
  const list = (candidates || [])
    .filter((c) => c.kind === 'wp-plan' || dist(c) <= within)
    .map((c) => ({ c, d: dist(c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.c);
  return { list, source: 'nearby', missing: 0 };
}

/**
 * One offset candidate -> chart rows in this wellbore's frame.
 * @param {object} cand  {id, name, stations (m, grid), headX, headY, kbElevM}
 * @param {object} ctx   {wellhead:{x,y} site-CRS m, kbM (this KB, m),
 *                        mdUnit 'm'|'ft', vsAzimuthDeg}
 * @returns {{ok:true, id, name, rows:[{md,e,n,tvd,vs}], stationsM}|{ok:false, id, name, error}}
 *   rows are in mdUnit: e/n from THIS wellhead, tvd below THIS KB,
 *   vs on this well's VS azimuth (null when no azimuth).
 */
export function offsetToChart(cand, {
  wellhead, kbM = 0, mdUnit = 'm', vsAzimuthDeg = null,
} = {}) {
  const base = { id: cand?.id, name: cand?.name || cand?.label || 'Offset' };
  if (!wellhead) return { ok: false, ...base, error: 'This wellbore has no wellhead location, so offsets cannot be placed.' };
  if (!Array.isArray(cand?.stations) || cand.stations.length < 2) {
    return { ok: false, ...base, error: `${base.name} has fewer than two stations.` };
  }
  if (!Number.isFinite(cand.headX) || !Number.isFinite(cand.headY)) {
    return { ok: false, ...base, error: `${base.name} has no wellhead location.` };
  }
  const dHead = Math.hypot(cand.headX - wellhead.x, cand.headY - wellhead.y);
  if (dHead > MAX_TARGET_REACH_M) {
    return {
      ok: false,
      ...base,
      error: `${base.name} has its wellhead ${Math.round(dHead).toLocaleString()} m from this one, so the two are not in the same coordinate frame; it is not drawn.`,
    };
  }
  let path;
  try {
    path = computeWellPath(cand.stations, { surfaceX: cand.headX, surfaceY: cand.headY, kb: cand.kbElevM || 0 });
  } catch (e) {
    return { ok: false, ...base, error: `${base.name}: ${e.message}` };
  }
  const k = mdUnit === 'ft' ? M_TO_FT : 1;
  const hasVs = Number.isFinite(vsAzimuthDeg);
  const rows = path.map((p) => {
    const e = (p.x - wellhead.x) * k;
    const n = (p.y - wellhead.y) * k;
    return {
      md: p.md * k,
      e,
      n,
      // tvdss is below the site datum; this well's TVD is below its KB.
      tvd: (p.tvdss + (kbM || 0)) * k,
      vs: hasVs ? projectToSection(n, e, vsAzimuthDeg) : null,
    };
  });
  return {
    ok: true, ...base, kind: cand.kind, rows, stationsM: cand.stations,
  };
}

/** Distinct, fixed-order colours for offsets (never the plan green,
 *  target amber or EOU sky). Assigned by the offset's position in the
 *  displayed list. */
export const OFFSET_COLORS = ['#1d4ed8', '#7c3aed', '#be185d', '#0f766e', '#9a3412', '#4b5563'];
