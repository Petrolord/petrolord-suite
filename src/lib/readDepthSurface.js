// One door for reading a geo_surfaces row (Mapping & Surface Studio
// upgrade U2-007, 2026-09-30).
//
// Why: the registry rows carry `kind`, `z_domain`, `z_unit`, `xy_unit`,
// `crs`, `rotation_deg` and `provenance.depth_ref`, and in the Step 1
// consumer audit (MAP-U1-029 to 033) every reader outside the section
// views dropped at least one of them: feet read as metres, isochores
// negated as elevation, TWT rows read as depth, rotation ignored. This
// module is the one place that turns a row and its grid into canonical
// values, or refuses the row with a reason a person can act on.
//
// CONTRACT (Earth Modeling #7 and ReservoirCalc Pro #8 adopt it in their
// own upgrades; Mapping reads through it now):
//
//   readDepthSurface(row, grid, {
//     accept = ['elevation','depth','time','attribute','isochore'],
//     as = 'elevation',          // how a depth row comes back: 'elevation' (negative down) or 'depth' (positive down)
//     xy = 'native',             // 'native' keeps the CRS coordinates; 'm' scales x0, y0, dx, dy to metres
//     requireProjected = true,   // refuse a geographic (degree) frame
//   })
//   -> { ok: true, domain, grid, zUnit, spec, xyUnit, xyToM, cellAreaM2, crs,
//        depthRef, nodeXY(r, c), sampleAt(x, y), live, notes }
//   |  { ok: false, code, reason }
//
// - domain: 'elevation' | 'depth' (a depth row, by `as`), 'time', 'attribute'
//   or 'isochore' (kind 'isochore': a positive vertical thickness).
// - grid: a NEW Float32Array; nulls are NULL_VALUE. Elevation and depth are
//   METRES (sign by domain); isochores are metres; time is positive TWT in ms
//   (the SEIS-U1-008 rule); an attribute stored in feet (z_unit 'ft') is
//   converted to metres, any other attribute is returned raw.
// - zUnit: 'm' for lengths, 'ms' for time, the row's z_unit (or null) for a
//   raw attribute.
// - spec: {x0, y0, dx, dy, nx, ny, rotation_deg} in the frame asked for;
//   nodeXY and sampleAt honour the rotation (gridXY / sampleAtXY).
// - xyToM: metres per map unit of the ROW's frame (1 when xy = 'm' has
//   already scaled the spec); cellAreaM2 = |dx dy| in square metres.
// - depthRef: provenance.depth_ref ('tvdss', 'tvd', 'md') or null.
// - notes: plain sentences about what the door assumed (legacy rows with
//   no z_domain, a depth row with no z_unit, positive depths on an
//   elevation row). Show them; do not drop them.
// Refusal codes: 'grid' (missing or wrong length), 'frame' (bad nx, ny,
// dx, dy), 'domain' (not in accept; the reason says what the row is and
// what the consumer needs), 'z-unit' (a length in an unknown unit),
// 'xy-unit' (unknown or geographic XY with requireProjected), 'empty'
// (no live node).
// Pure, no I/O; import it without a Supabase client.

import { NULL_VALUE } from '@/lib/gridding/numeric';
import { gridXY, sampleAtXY } from '@/lib/gridding/gridmath';
import { crsUnit } from '@/lib/crs';
import { unitToMetres } from '../../packages/engines/lib/crs/catalog';

export const SURFACE_DOMAINS = Object.freeze(['elevation', 'depth', 'time', 'attribute', 'isochore']);
export const DOMAIN_LABEL = Object.freeze({
  elevation: 'a depth structure (elevation, negative below datum)',
  depth: 'a depth structure',
  time: 'a time surface (TWT)',
  attribute: 'an attribute map',
  isochore: 'an isochore (vertical thickness)',
});

const M_PER_FT = 0.3048;
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const refuse = (code, reason) => ({ ok: false, code, reason });

/** The row's domain before any `as`: elevation, time, attribute or isochore. */
export function surfaceDomainOf(row) {
  if (!row) return null;
  if (row.z_domain === 'time') return 'time';
  if (row.kind === 'isochore' || row.z_domain === 'isochore') return 'isochore';
  if (row.z_domain === 'attribute' || row.kind === 'attribute') return 'attribute';
  return 'elevation';
}

/** The XY unit of a row: the stored column first, then its CRS; null when neither says. */
export function rowXyUnit(row) {
  if (row?.xy_unit) return row.xy_unit;
  return row?.crs ? crsUnit(row.crs) : null;
}

/**
 * @param {Object} row a geo_surfaces row
 * @param {ArrayLike<number>} grid its f32 grid as stored (row-major, row 0 south)
 * @param {Object} [opts] see the contract above
 */
export function readDepthSurface(row, grid, opts = {}) {
  const { accept = SURFACE_DOMAINS, as = 'elevation', xy = 'native', requireProjected = true } = opts;
  if (as !== 'elevation' && as !== 'depth') throw new Error(`readDepthSurface: as must be elevation or depth, got "${as}".`);
  if (xy !== 'native' && xy !== 'm') throw new Error(`readDepthSurface: xy must be native or m, got "${xy}".`);
  const name = row?.name ? `"${row.name}"` : 'This surface';
  if (!row) return refuse('grid', 'No surface row was given.');
  const nx = Number(row.nx); const ny = Number(row.ny);
  const dx = Number(row.dx); const dy = Number(row.dy);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2
    || !Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0 || dy === 0
    || !Number.isFinite(Number(row.origin_x)) || !Number.isFinite(Number(row.origin_y))) {
    return refuse('frame', `${name} has no usable grid frame (nx, ny, dx, dy and origin). Re-grid or re-import it.`);
  }
  if (!grid || grid.length !== nx * ny) {
    return refuse('grid', `${name}: the grid has ${grid ? grid.length : 0} nodes but the row says ${nx} x ${ny}. Re-grid it.`);
  }

  const notes = [];
  const base = surfaceDomainOf(row);
  if (row.z_domain == null && base === 'elevation') notes.push(`${name} has no z domain recorded; read as a depth structure (elevation), the registry default.`);
  const domain = base === 'elevation' ? as : base;
  const acceptSet = new Set(accept.includes('elevation') || accept.includes('depth') ? [...accept, 'elevation', 'depth'] : accept);
  if (!acceptSet.has(domain)) {
    const wanted = accept.map((d) => DOMAIN_LABEL[d] || d).join(' or ');
    const fix = base === 'time' ? ' Depth-convert it in Mapping & Surface Studio first.' : '';
    return refuse('domain', `${name} is ${DOMAIN_LABEL[base]}; this needs ${wanted}.${fix}`);
  }

  // z: canonical metres for every length, positive TWT for time
  let f = 1;
  let zUnit = null;
  let abs = false;
  if (base === 'time') { abs = true; zUnit = 'ms'; } else if (base === 'attribute') {
    if (row.z_unit === 'ft') { f = M_PER_FT; zUnit = 'm'; } else zUnit = row.z_unit || null;
  } else {
    if (row.z_unit != null && row.z_unit !== 'm' && row.z_unit !== 'ft') {
      return refuse('z-unit', `${name} stores lengths in "${row.z_unit}", which this door does not know (expected m or ft).`);
    }
    if (row.z_unit == null) notes.push(`${name} has no depth unit recorded; read as metres.`);
    f = row.z_unit === 'ft' ? M_PER_FT : 1;
    zUnit = 'm';
    if (base === 'elevation' && as === 'depth') f = -f;
  }
  const out = new Float32Array(nx * ny);
  let live = 0; let positives = 0;
  for (let i = 0; i < out.length; i++) {
    const v = grid[i];
    if (isNull(v)) { out[i] = NULL_VALUE; continue; }
    out[i] = abs ? Math.abs(v) : v * f;
    live += 1;
    if (base === 'elevation' && v > 0) positives += 1;
  }
  if (!live) return refuse('empty', `${name} has no live nodes.`);
  if (base === 'elevation' && positives === live) {
    notes.push(`${name} is stored as elevation but every value is above the datum; if it was saved as positive depth, it reads upside down.`);
  }

  // XY: the row's frame and its metres per unit
  const xyUnit = rowXyUnit(row);
  let xyToM;
  if (xyUnit === 'deg') xyToM = NaN;
  else {
    try { xyToM = unitToMetres(xyUnit); } catch { return refuse('xy-unit', `${name} is in an unknown XY unit "${xyUnit}".`); }
  }
  if (!Number.isFinite(xyToM)) {
    if (requireProjected) return refuse('xy-unit', `${name} is in a geographic CRS (degrees). Reproject it to a projected CRS to measure it in metres.`);
  }
  if (!xyUnit) notes.push(`${name} has no CRS or XY unit; map units read as metres.`);
  const rotation = Number.isFinite(Number(row.rotation_deg)) ? Number(row.rotation_deg) : 0;
  const s = xy === 'm' && Number.isFinite(xyToM) ? xyToM : 1;
  const spec = {
    x0: Number(row.origin_x) * s, y0: Number(row.origin_y) * s, dx: dx * s, dy: dy * s, nx, ny,
    ...(rotation ? { rotation_deg: rotation } : {}),
  };
  const frameToM = xy === 'm' ? 1 : xyToM;
  return {
    ok: true,
    domain,
    grid: out,
    zUnit,
    spec,
    xyUnit: xy === 'm' && Number.isFinite(xyToM) ? 'm' : xyUnit,
    xyToM: frameToM,
    cellAreaM2: Number.isFinite(frameToM) ? Math.abs(spec.dx * spec.dy) * frameToM * frameToM : NaN,
    crs: row.crs || null,
    depthRef: row.provenance?.depth_ref || null,
    nodeXY: (r, c) => gridXY(spec, r, c),
    sampleAt: (x, y) => {
      const v = sampleAtXY(out, spec, x, y);
      return isNull(v) ? null : v;
    },
    live,
    notes,
  };
}
