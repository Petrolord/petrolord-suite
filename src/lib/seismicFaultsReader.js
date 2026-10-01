// Seismolord faults for other apps (Seismolord U2-003, Earth Modeling
// EM-T1-010): the read-only contract. Earth Modeling (and any later
// consumer) imports this module and never reads seismic_faults itself.
//
// What a consumer gets per fault (world coordinates in the consumer's CRS
// when the tags are transformable, else the volume's own with a status):
//   sticks   [[{x, y, twtMs, depthM|null}]]  the interpreter's sticks
//   surface  [[{x, y, twtMs, depthM|null}]]  the lofted fault surface rails
//   trace    [{x, y}]  the fault's cut at one TWT level (the surface rails
//            crossing that level), and
//   polygon  [[x, y]]  that trace as a thin closed polygon, the vertical
//            fault polygon Earth Modeling's block engine takes.
// Depth comes only from the volume's linear velocity model (V0 + kZ); a
// layer cake needs the horizon grids and is reported instead of guessed.
//
// Nothing is written. No schema change: seismic_faults (sticks, surface,
// heads with archived_at null) and seismic_volumes (survey_meta geometry,
// crs, velocity_model) under their existing owner-or-org RLS.

import { surveyAffine, ilxlToWorld } from '../../packages/engines/engines/seismolord/surveyGeometry';
import { loftFaultSurface, surfaceLevelTrace } from '../../packages/engines/engines/seismolord/faultObjects';
import { makeDepthConverter, describeVelocity } from '../../packages/engines/engines/seismolord/velocityModel';
import { compareTags } from './crs/tags';

export const SEISMIC_FAULT_SOURCE = 'seismolord';

const pointsOf = (stick) => (Array.isArray(stick) ? stick : stick?.points || []);

/** The volume's world placement, or null (with the reason). */
export function volumeFrame(volume) {
  const sm = volume?.survey_meta || {};
  if (!sm.il || !sm.xl || !(sm.dt_us > 0)) return { error: 'the volume has no stored geometry' };
  const affine = surveyAffine({
    il: sm.il, xl: sm.xl, corners: sm.corners, affine: sm.affine, ns: sm.ns, dt_us: sm.dt_us,
  });
  if (!affine) return { error: 'the volume has no ground coordinates' };
  const vel = volume.velocity_model || null;
  const conv = vel ? makeDepthConverter(vel, { dtUs: sm.dt_us }) : null;
  const linear = conv && !conv.columnDependent;
  return {
    affine,
    dtMs: sm.dt_us / 1000,
    depthOf: linear ? (ms) => conv.toDepthM(ms) : null,
    velocityText: vel ? describeVelocity(vel) : null,
    depthNote: !vel ? 'no velocity model on the volume: time only'
      : !linear ? 'the layer-cake model needs its horizon grids: time only' : null,
  };
}

/** Thin closed polygon around a polyline (half width in the line's units). */
export function bufferPolyline(line, halfWidth) {
  if (!line || line.length < 2 || !(halfWidth > 0)) return null;
  const left = [];
  const right = [];
  for (let k = 0; k < line.length; k++) {
    const a = line[Math.max(0, k - 1)];
    const b = line[Math.min(line.length - 1, k + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    left.push([line[k].x + nx * halfWidth, line[k].y + ny * halfWidth]);
    right.push([line[k].x - nx * halfWidth, line[k].y - ny * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

// ---- a fault block from a trace -----------------------------------------
// Earth Modeling's block engine takes closed polygons (the area inside is
// one fault block). A seismic fault gives a TRACE across the model; the
// block is the part of the model frame on one side of it. The hanging
// wall is the side the fault dips towards (the deeper trace lies there).

function rayExit(p, dir, rect) {
  let best = Infinity;
  const { x0, y0, x1, y1 } = rect;
  if (dir.x > 1e-12) best = Math.min(best, (x1 - p.x) / dir.x);
  if (dir.x < -1e-12) best = Math.min(best, (x0 - p.x) / dir.x);
  if (dir.y > 1e-12) best = Math.min(best, (y1 - p.y) / dir.y);
  if (dir.y < -1e-12) best = Math.min(best, (y0 - p.y) / dir.y);
  return Number.isFinite(best) && best >= 0 ? { x: p.x + best * dir.x, y: p.y + best * dir.y } : null;
}

/** Perimeter position (0..4 around x0,y0 -> x1,y0 -> x1,y1 -> x0,y1) of a boundary point. */
function perim(p, r) {
  const e = 1e-6 * Math.max(r.x1 - r.x0, r.y1 - r.y0);
  if (Math.abs(p.y - r.y0) <= e) return (p.x - r.x0) / (r.x1 - r.x0);
  if (Math.abs(p.x - r.x1) <= e) return 1 + (p.y - r.y0) / (r.y1 - r.y0);
  if (Math.abs(p.y - r.y1) <= e) return 2 + (r.x1 - p.x) / (r.x1 - r.x0);
  return 3 + (r.y1 - p.y) / (r.y1 - r.y0);
}

const CORNERS = (r) => [[r.x0, r.y0, 0], [r.x1, r.y0, 1], [r.x1, r.y1, 2], [r.x0, r.y1, 3]];

/**
 * The model frame on one side of a trace, as a closed polygon.
 * @param {{x, y}[]} trace
 * @param {{x0, y0, x1, y1}} rect the model frame
 * @param {{x, y}} towards a point on the wanted side (for example the deeper trace)
 * @returns {{polygon?: number[][], error?: string}}
 */
export function blockPolygonFromTrace(trace, rect, towards, { away = false } = {}) {
  if (!trace || trace.length < 2) return { error: 'the fault has no trace at this level' };
  const inside = (p) => p.x > rect.x0 && p.x < rect.x1 && p.y > rect.y0 && p.y < rect.y1;
  const pts = trace.filter(inside);
  if (pts.length < 2) return { error: 'the fault trace does not cross the model frame' };
  const a = pts[0];
  const b = pts[1];
  const y = pts[pts.length - 1];
  const z = pts[pts.length - 2];
  const start = rayExit(a, { x: a.x - b.x, y: a.y - b.y }, rect);
  const end = rayExit(y, { x: y.x - z.x, y: y.y - z.y }, rect);
  if (!start || !end) return { error: 'the fault trace could not be extended to the model frame' };
  const line = [start, ...pts, end];
  const walk = (ccw) => {
    const s0 = perim(end, rect);
    const s1 = perim(start, rect);
    const span = ccw ? ((s1 - s0 + 4) % 4) : ((s0 - s1 + 4) % 4);
    const corners = CORNERS(rect)
      .map(([cx, cy, k]) => ({ cx, cy, d: ccw ? ((k - s0 + 4) % 4) : ((s0 - k + 4) % 4) }))
      .filter((c) => c.d > 1e-12 && c.d < span)
      .sort((u, v) => u.d - v.d)
      .map((c) => [c.cx, c.cy]);
    return [...line.map((p) => [p.x, p.y]), ...corners];
  };
  const pip = (x, yy, poly) => {
    let inn = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > yy) !== (yj > yy) && x < ((xj - xi) * (yy - yi)) / (yj - yi) + xi) inn = !inn;
    }
    return inn;
  };
  const one = walk(true);
  const other = walk(false);
  const inOne = pip(towards.x, towards.y, one);
  if (inOne === pip(towards.x, towards.y, other)) return { error: 'the hanging-wall side could not be placed inside the model frame' };
  return { polygon: (inOne !== away) ? one : other };
}

/**
 * The hanging-wall block of a fault in a model frame: the fault's trace at
 * its level, closed with the frame on the side the fault dips towards.
 * @param {Object} obj a faultToModelObjects result
 * @param {{x0, y0, x1, y1}} rect
 */
export function hangingWallBlock(obj, frameRect) {
  if (!obj?.trace) return { error: obj?.notes?.[0] || 'the fault has no trace at this level' };
  // a little outside the frame, so nodes on its edge fall inside the block
  const pad = 0.01 * Math.max(frameRect.x1 - frameRect.x0, frameRect.y1 - frameRect.y0);
  const rect = {
    x0: frameRect.x0 - pad, y0: frameRect.y0 - pad, x1: frameRect.x1 + pad, y1: frameRect.y1 + pad,
  };
  const deeper = obj.deeperTrace;
  const shallower = obj.shallowerTrace;
  if (deeper?.length) return blockPolygonFromTrace(obj.trace, rect, deeper[Math.floor(deeper.length / 2)]);
  if (shallower?.length) return blockPolygonFromTrace(obj.trace, rect, shallower[Math.floor(shallower.length / 2)], { away: true });
  return { error: 'the fault dip direction is unknown' };
}

/**
 * One seismic_faults row as model objects.
 * @param {Object} fault seismic_faults row (sticks, surface?)
 * @param {Object} volume seismic_volumes row (name, crs, survey_meta, velocity_model)
 * @param {{levelMs?: ?number, transform?: ?{forward: (x, y) => {x, y}}, crsStatus?: string}} [opts]
 *   levelMs: the TWT of the trace (default the middle of the fault's TWT range)
 */
export function faultToModelObjects(fault, volume, { levelMs = null, transform = null, crsStatus = 'same' } = {}) {
  const frame = volumeFrame(volume);
  const base = {
    id: fault.id, name: fault.name, source: SEISMIC_FAULT_SOURCE, volumeId: volume?.id || null, volumeName: volume?.name || null,
  };
  if (frame.error) return { ...base, error: frame.error };
  const sticks = (fault.sticks || []).map(pointsOf).filter((p) => p.length >= 2);
  if (sticks.length < 1) return { ...base, error: 'no sticks with two or more points' };
  const toXY = (il, xl) => {
    const w = ilxlToWorld(frame.affine, il, xl);
    return transform ? transform.forward(w.x, w.y) : w;
  };
  const place = (il, xl, s) => {
    const w = toXY(il, xl);
    const twtMs = s * frame.dtMs;
    return {
      x: w.x, y: w.y, twtMs, depthM: frame.depthOf ? frame.depthOf(twtMs) : null,
    };
  };
  const worldSticks = sticks.map((pts) => pts.map((q) => place(q.il, q.xl, q.s)));
  const surface = fault.surface && Array.isArray(fault.surface.rails) ? fault.surface
    : (sticks.length >= 2 ? loftFaultSurface(sticks.map((points) => ({ points }))) : null);
  const rails = surface ? surface.rails.map((rail) => rail.map(([il, xl, s]) => place(il, xl, s))) : [];

  let sMin = Infinity;
  let sMax = -Infinity;
  for (const pts of sticks) for (const q of pts) { sMin = Math.min(sMin, q.s); sMax = Math.max(sMax, q.s); }
  const level = Number.isFinite(levelMs) ? levelMs / frame.dtMs : (sMin + sMax) / 2;
  const cut = surface ? surfaceLevelTrace(surface, level) : null;
  const trace = cut ? cut.map((p) => toXY(p.i, p.j)) : null;
  // the trace a little deeper: the side the fault dips towards (hanging wall)
  const cutDeep = surface ? surfaceLevelTrace(surface, level + Math.max(1, 0.1 * (sMax - sMin))) : null;
  const deeperTrace = cutDeep ? cutDeep.map((p) => toXY(p.i, p.j)) : null;
  const cutUp = surface && !cutDeep ? surfaceLevelTrace(surface, level - Math.max(1, 0.1 * (sMax - sMin))) : null;
  const shallowerTrace = cutUp ? cutUp.map((p) => toXY(p.i, p.j)) : null;
  // half a bin either side: a vertical wall one bin wide at that level
  const a = frame.affine;
  const bin = Math.min(Math.hypot(a.ilVec.x, a.ilVec.y), Math.hypot(a.xlVec.x, a.xlVec.y)) || 1;
  const polygon = trace ? bufferPolyline(trace, bin / 2) : null;
  const notes = [];
  if (!surface) notes.push('one stick: no fault surface, no trace');
  else if (!trace) notes.push(`the fault surface does not reach ${Math.round(level * frame.dtMs)} ms TWT`);
  if (frame.depthNote) notes.push(frame.depthNote);
  if (crsStatus === 'unverified') notes.push('CRS not verified');
  return {
    ...base,
    levelMs: level * frame.dtMs,
    twtRangeMs: [sMin * frame.dtMs, sMax * frame.dtMs],
    sticks: worldSticks,
    surface: rails,
    trace,
    deeperTrace,
    shallowerTrace,
    polygon,
    velocityText: frame.velocityText,
    crsStatus,
    notes,
  };
}

/**
 * Every current fault the caller can read, as model objects.
 * @param {{supabase: Object, hostCrs?: ?string, getTransformer?: Function, customDefs?: Object, levelMs?: ?number}} ctx
 * @returns {Promise<{faults: Array, skipped: {name, reason}[]}>}
 */
export async function listSeismicFaultsForModel({
  supabase, hostCrs = null, getTransformer = null, customDefs = {}, levelMs = null,
}) {
  const { data: rows, error } = await supabase.from('seismic_faults')
    .select('id, name, volume_id, sticks, surface, archived_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not read the Seismolord faults: ${error.message}`);
  const ids = [...new Set((rows || []).map((r) => r.volume_id).filter(Boolean))];
  if (!ids.length) return { faults: [], skipped: [] };
  const { data: vols, error: vErr } = await supabase.from('seismic_volumes')
    .select('id, name, crs, survey_meta, velocity_model').in('id', ids);
  if (vErr) throw new Error(`Could not read the Seismolord volumes: ${vErr.message}`);
  const byId = new Map((vols || []).map((v) => [v.id, v]));
  const faults = [];
  const skipped = [];
  for (const r of rows || []) {
    const v = byId.get(r.volume_id);
    if (!v) { skipped.push({ name: r.name, reason: 'its volume is not readable' }); continue; }
    const rel = hostCrs ? compareTags(v.crs, hostCrs) : 'same';
    let transform = null;
    let crsStatus = rel === 'same' ? 'same' : 'unverified';
    if (rel === 'transformable' && getTransformer) {
      try { transform = getTransformer(v.crs, hostCrs, customDefs); crsStatus = 'converted'; } catch {
        skipped.push({ name: r.name, reason: `cannot transform ${v.crs}` }); continue;
      }
    } else if (rel === 'local-mismatch') {
      skipped.push({ name: r.name, reason: 'local grid data cannot be placed in this frame' }); continue;
    }
    const obj = { ...faultToModelObjects(r, v, { levelMs, transform, crsStatus }), crs: transform ? hostCrs : (v.crs || null) };
    if (obj.error) { skipped.push({ name: r.name, reason: obj.error }); continue; }
    faults.push(obj);
  }
  return { faults, skipped };
}
