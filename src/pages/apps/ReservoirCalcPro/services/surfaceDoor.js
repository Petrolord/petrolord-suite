// The surface doors of ReservoirCalc Pro (upgrade U1, 2026-09-30). Pure.
//
// RCP-U1-002 (MAP-U1-033, EM-U1-024, carried from Mapping and Earth
// Modeling): a geo_surfaces row used to reach the volumetrics through
// `surfaceToXyzText` with the XY unit forced to metres, so a surface on
// a US-feet state plane read its square feet as square metres (GRV and
// area 10.76x), and when its depths were in feet the feet coordinates
// were "rescaled from metres to feet" a second time. TWT rows, isochores
// and attribute maps (MD, TVD below KB, porosity) entered as depth
// structures; rotated grids lost their rotation. Every registry row now
// goes through the shared door `readDepthSurface` (src/lib): depth
// structures only, metres elevation, the row's own frame with its metres
// per unit, rotation honoured, the door's notes kept.
//
// RCP-U1-016: RCP's own file parser read Petrel CPS-3, Kingdom ZMAP+ and
// Irap classic grids as a handful of header numbers (2 to 20 "points"
// with a collinear warning), refused depth-first columns with units in
// the header and semicolon files. Files now go first through Mapping's
// surface file door (`readSurfaceFile`, MAP-U1-003), which reads those
// dialects and says what it changed; RCP's parser stays the fallback for
// ESRI ASCII and GeoJSON points.
//
// RCP-U1-011: the import model had one unit for X, Y and Z, so a UTM
// grid in metres with depths in feet (a common Petrel field project)
// could not be declared: either the area or the depth was 3.28x off.
// The depth unit is now its own choice.
//
// RCP-U1-010: a Seismolord two-way-time export was imported as depth
// with only a toast. It is refused with the way out.

import { readDepthSurface } from '@/lib/readDepthSurface';
import { gridXY, isNull } from '@/lib/gridding/gridmath';
import { readSurfaceFile } from '@/pages/apps/MappingSurfaceStudio/services/surfaceFileDoor';
import { makeLattice } from './lattice';

export const MAX_POINTS = 5000;
const M_PER_FT = 0.3048;

/** Metres per XY unit for the units the import dialog offers. */
export const xyToMOf = (xyUnit) => (xyUnit === 'ft' ? M_PER_FT : xyUnit === 'ftUS' ? 1200 / 3937 : 1);

/**
 * Even-stride downsample (never slice: Seismolord XYZ is row-major
 * south-first, so a slice kept only the southern strip).
 */
export function stridePoints(points, max = MAX_POINTS) {
  const stride = Math.max(1, Math.ceil(points.length / max));
  return stride === 1 ? points : points.filter((_, i) => i % stride === 0);
}

/**
 * The surface object the app stores and the engines read.
 * @param {Array<{x,y,z}>} points
 * @param {{name?, format?, xyUnit?, xyToM?, depthUnit?, zConvention?, crs?, registryId?, registryName?, notes?: string[], depthRef?: string}} meta
 */
export function buildImportedSurface(points, meta = {}) {
  let minZ = Infinity; let maxZ = -Infinity; let sumZ = 0;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const p of points) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    sumZ += p.z;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const xyUnit = meta.xyUnit || 'm';
  return {
    id: meta.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `surf-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: meta.name || 'Imported Surface',
    format: meta.format || 'xyz',
    points: stridePoints(points),
    minZ, maxZ, avgZ: sumZ / points.length,
    // bounding-box extent in map units (a first-order footprint for the card)
    estimatedArea: Math.abs((maxX - minX) * (maxY - minY)),
    pointCount: points.length,
    xyUnit,
    // metres per map unit, exact for US survey feet (the engine prefers it)
    xyToM: Number.isFinite(meta.xyToM) ? meta.xyToM : xyToMOf(xyUnit),
    depthUnit: meta.depthUnit || xyUnit,
    zConvention: meta.zConvention || 'elevation',
    crs: (meta.crs || '').trim() || null,
    registryId: meta.registryId || null,
    registryName: meta.registryName || null,
    depthRef: meta.depthRef || null,
    importNotes: meta.notes?.length ? meta.notes : undefined,
    // U2-005: the registry grid itself (frame, rotation, metres elevation);
    // the engine integrates on its nodes instead of re-gridding the points
    ...(meta.lattice ? { lattice: meta.lattice } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** Live nodes of a lattice as world points (rotation honoured). */
function latticePoints(z, spec) {
  const pts = [];
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const v = z[r * spec.nx + c];
      if (isNull(v)) continue;
      const { x, y } = gridXY(spec, r, c);
      pts.push({ x, y, z: v });
    }
  }
  return pts;
}

/**
 * A geo_surfaces row and its grid as an RCP surface, or the reason it
 * cannot be one.
 * @returns {{ok: true, surface: Object, notes: string[]} | {ok: false, reason: string, code: string}}
 */
export function surfaceFromRegistryRow(row, grid) {
  const r = readDepthSurface(row, grid, { accept: ['elevation'], as: 'elevation', xy: 'native' });
  if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
  const points = latticePoints(r.grid, r.spec);
  const notes = [...r.notes];
  if (r.depthRef && r.depthRef !== 'tvdss') {
    return { ok: false, code: 'depth-ref', reason: `"${row.name}" is referenced to ${r.depthRef.toUpperCase()}, not TVDSS; volumetrics need a structure below one datum.` };
  }
  if (Number(row.rotation_deg)) notes.push(`"${row.name}" is on a grid rotated ${Number(row.rotation_deg)} degrees; its nodes were placed with the rotation.`);
  const lattice = makeLattice(r.spec, r.grid);
  if (lattice) notes.push(`Volumes are integrated on the grid's own ${r.spec.nx} x ${r.spec.ny} nodes, as Mapping measures it (no re-gridding).`);
  else notes.push(`The grid has ${(r.spec.nx * r.spec.ny).toLocaleString('en-US')} nodes, more than RCP keeps with a project; it was thinned to ${MAX_POINTS.toLocaleString('en-US')} points and re-gridded, so volumes can differ slightly from Mapping's.`);
  const surface = buildImportedSurface(points, {
    name: row.name,
    format: 'registry',
    xyUnit: r.xyToM === 1 ? 'm' : (r.xyUnit || 'm'),
    xyToM: r.xyToM,
    depthUnit: 'm',
    zConvention: 'elevation',
    crs: r.crs || '',
    registryId: row.id,
    registryName: row.name,
    depthRef: r.depthRef,
    notes,
    lattice,
  });
  return { ok: true, surface, notes };
}

/**
 * Seismolord's legacy exports (seismic_exported_surfaces): depth in feet
 * with XY in metres, or two-way time, which is refused.
 * @returns {{ok: true, xyUnit: string, depthUnit: string} | {ok: false, reason: string}}
 */
export function seismolordExportUnits(row) {
  if (row?.domain === 'depth_ft') return { ok: true, xyUnit: 'm', depthUnit: 'ft' };
  if (row?.domain === 'depth_m') return { ok: true, xyUnit: 'm', depthUnit: 'm' };
  return {
    ok: false,
    reason: `"${row?.name || 'This export'}" is a two-way-time surface (ms), not depth. Depth-convert it in Seismolord or Mapping & Surface Studio and use the depth surface.`,
  };
}

/**
 * A surface file through the shared door. Grids (CPS-3, ZMAP+, Irap,
 * regular XYZ) become their live nodes; scattered or rotated-lattice
 * XYZ comes back as points. A file whose header says two-way time is
 * refused. Falls back (`ok: false, fallback: true`) when the door cannot
 * read it, so the caller can try its own parser (ESRI ASCII, GeoJSON).
 * @returns {{ok: true, points: Array, notes: string[], hint: Object} | {ok: false, reason: string, fallback?: boolean}}
 */
export function pointsFromSurfaceFile(text) {
  let read;
  try { read = readSurfaceFile(text); } catch (e) {
    const msg = String(e?.message || e);
    if (/lines file/.test(msg)) return { ok: false, reason: msg };
    return { ok: false, reason: msg, fallback: true };
  }
  const notes = [...(read.notes || [])];
  if (read.hint?.domain === 'time') {
    return { ok: false, reason: 'The file header names two-way time (TWT, ms). Volumetrics need a depth structure: depth-convert it first (Mapping & Surface Studio or Seismolord).' };
  }
  let points;
  if (read.g) {
    points = latticePoints(read.g.z, { x0: read.g.x0, y0: read.g.y0, dx: read.g.dx, dy: read.g.dy, nx: read.g.nx, ny: read.g.ny, ...(read.g.rotation_deg ? { rotation_deg: read.g.rotation_deg } : {}) });
    notes.push(`Read a ${String(read.g.format || 'grid').toUpperCase()} grid, ${read.g.nx} x ${read.g.ny} nodes, ${points.length.toLocaleString('en-US')} live.`);
  } else {
    points = read.points || [];
  }
  if (points.length < 3) return { ok: false, reason: 'Fewer than three live points were read from the file.', fallback: true };
  return { ok: true, points, notes, hint: read.hint || {} };
}
