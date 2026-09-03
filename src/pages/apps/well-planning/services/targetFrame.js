// Target coordinate frame (Well Design fix, 2026-09-03). wp_targets store
// ABSOLUTE site-CRS metres (center_x, center_y) and TVDSS metres. The
// plotting layer and the trajectory solvers work in WELLHEAD-RELATIVE
// offsets in the wellbore's depth unit. This module is the single place
// that crosses that boundary, so every consumer (plan view, section
// view, solver, report) sees the same numbers, and a target that cannot
// be placed says why instead of drawing at 800,000 ft east.
//
// Two failure modes it refuses loudly:
//   - no wellhead location (a wellbore created from a slot on a pad with
//     no origin, or with head_x/head_y left blank): the old code fell
//     back to 0/0 and absolute coordinates became offsets
//   - a target whose offset from the wellhead is beyond any well
//     (MAX_TARGET_REACH_M): the wellhead and the target are not in the
//     same frame (a local pad grid against UTM, feet typed into a metre
//     field, a target borrowed from a registry well in another CRS)

import { M_TO_FT } from '../engine/surveyMath';
import { MAX_TARGET_REACH_M } from '../engine/profileDesign';

export { MAX_TARGET_REACH_M };

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (v) => Math.round(v).toLocaleString();

/**
 * Where the wellhead is, in site-CRS metres. Explicit head_x/head_y win;
 * otherwise a named slot on a pad with an origin. Null when unknown.
 * @returns {{x:number, y:number, source:'wellbore'|'slot'}|null}
 */
export function resolveWellhead(wellbore, site = null) {
  if (!wellbore) return null;
  const hx = num(wellbore.head_x);
  const hy = num(wellbore.head_y);
  if (hx != null && hy != null) return { x: hx, y: hy, source: 'wellbore' };
  const slots = Array.isArray(site?.slots) ? site.slots : [];
  const slot = wellbore.slot_name ? slots.find((s) => s.name === wellbore.slot_name) : null;
  const ox = num(site?.origin_x);
  const oy = num(site?.origin_y);
  if (slot && ox != null && oy != null) {
    return { x: ox + (num(slot.dx_m) || 0), y: oy + (num(slot.dy_m) || 0), source: 'slot' };
  }
  return null;
}

export const NO_WELLHEAD_MESSAGE = 'The wellbore has no wellhead location, so targets cannot be placed relative to it. Edit the wellbore and set its head easting and northing (or pick a slot on a pad with an origin).';

/**
 * One target -> wellhead-relative displacement in the wellbore's depth
 * unit. dTvd is below KB (the solvers' vertical), tvdss is kept for
 * labels. `from` (optional, in mdUnit: {e, n, tvd}) rebases the offset on
 * the current design end for the append solvers.
 * @returns {{ok:true, dE:number, dN:number, dTvd:number, tvdss:number,
 *   unit:'m'|'ft', frame:'local', reachM:number}
 *   | {ok:false, error:string}}
 */
export function targetToLocal(target, { wellhead, mdUnit = 'm', kbM = 0, from = null } = {}) {
  if (!target) return { ok: false, error: 'No target.' };
  if (!wellhead) return { ok: false, error: NO_WELLHEAD_MESSAGE };
  const cx = num(target.center_x);
  const cy = num(target.center_y);
  const tvdss = num(target.tvdss_m);
  if (cx == null || cy == null || tvdss == null) {
    return { ok: false, error: `${target.name || 'The target'} has no usable position. Give it an easting, a northing and a TVDSS on the Targets tab.` };
  }
  const dEm = cx - wellhead.x;
  const dNm = cy - wellhead.y;
  const dTvdM = tvdss + (num(kbM) || 0);
  const reachM = Math.hypot(dEm, dNm, dTvdM);
  if (reachM > MAX_TARGET_REACH_M) {
    return {
      ok: false,
      error: `${target.name || 'The target'} sits ${fmt(Math.abs(dEm))} m ${dEm >= 0 ? 'east' : 'west'} and ${fmt(Math.abs(dNm))} m ${dNm >= 0 ? 'north' : 'south'} of the wellhead (${fmt(wellhead.x)} E, ${fmt(wellhead.y)} N), beyond any well. The target and the wellhead are not in the same coordinate frame: both must be site-CRS metres. Check the target's easting and northing and the wellbore's head coordinates.`,
    };
  }
  const k = mdUnit === 'ft' ? M_TO_FT : 1;
  let dE = dEm * k;
  let dN = dNm * k;
  let dTvd = dTvdM * k;
  if (from) {
    dE -= num(from.e) || 0;
    dN -= num(from.n) || 0;
    dTvd -= num(from.tvd) || 0;
  }
  return { ok: true, dE, dN, dTvd, tvdss, unit: mdUnit, frame: 'local', reachM };
}

/**
 * Boundary assertion for anything about to enter a solver: the
 * displacement must be tagged local, in the solver's unit, and finite.
 * Throws; callers that render inline catch and show the message.
 */
export function assertLocalDelta(delta, mdUnit, label = 'Target') {
  if (!delta || typeof delta !== 'object') throw new Error(`${label}: no displacement.`);
  if (delta.frame !== 'local') throw new Error(`${label}: displacement is not wellhead-relative (frame ${delta.frame ?? 'unknown'}).`);
  if (delta.unit !== mdUnit) throw new Error(`${label}: displacement is in ${delta.unit ?? 'an unknown unit'} but the solver runs in ${mdUnit}.`);
  for (const k of ['dE', 'dN', 'dTvd']) {
    if (!Number.isFinite(delta[k])) throw new Error(`${label}: ${k} is not a number.`);
  }
  return delta;
}

/**
 * Site targets -> chart rows in wellhead-relative depth-unit offsets
 * (e, n, tvd below KB, geometry scaled), plus the ones that could not be
 * placed and why. Nothing is drawn at absolute coordinates.
 */
export function targetsToChart(targets, { wellhead, mdUnit = 'm', kbM = 0 } = {}) {
  const rows = [];
  const problems = [];
  const k = mdUnit === 'ft' ? M_TO_FT : 1;
  for (const t of targets || []) {
    const d = targetToLocal(t, { wellhead, mdUnit, kbM });
    if (!d.ok) { problems.push({ id: t.id, name: t.name, error: d.error }); continue; }
    const g = t.geometry || {};
    const geometry = {};
    if (g.radius_m) geometry.radius_m = g.radius_m * k;
    if (g.semi_major_m) {
      geometry.semi_major_m = g.semi_major_m * k;
      geometry.semi_minor_m = (g.semi_minor_m || g.semi_major_m) * k;
      geometry.rotation_deg = g.rotation_deg || 0;
    }
    if (Array.isArray(g.points)) {
      geometry.points = g.points.map(([px, py]) => [(px - wellhead.x) * k, (py - wellhead.y) * k]);
    }
    rows.push({
      id: t.id, name: t.name, kind: t.kind, color: t.color, geometry,
      e: d.dE, n: d.dN, tvd: d.dTvd, tvdss: d.tvdss, unit: mdUnit,
    });
  }
  return { rows, problems, wellhead: wellhead || null };
}
