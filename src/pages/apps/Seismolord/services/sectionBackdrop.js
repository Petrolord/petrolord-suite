// Seismic backdrop along a well section path (upgrade U2-002, WC-U2-017).
// Read only: a Seismolord volume is sampled along the polyline through the
// section wells' surface locations, in section order, with the same
// traverse assembly the Seismolord Traverse window uses (resampleTraverse:
// one trace per crossline bin of ground distance; assembleTraverse: bricks
// read once each). Each well is anchored to the trace nearest its
// location, so the receiving section can hang the seismic between its
// columns well to well. Nothing is written.
//
// PL4: a well that cannot be placed is named with the reason (another CRS
// that cannot be transformed, a local grid, off the survey); fewer than two
// placed wells is refused with the reason.

import { surveyAffine, worldToIlxl } from '../engine/surveyGeometry';
import { resampleTraverse, assembleTraverse } from '../engine/traverse';
import { placeWellsForHost } from '@/lib/crs/guards';

/** Longest backdrop, in traces (about 100 km at 25 m bins). */
export const BACKDROP_MAX_TRACES = 4000;
const NULL_F32 = Math.fround(1.0e30);

/**
 * The traverse through the section wells.
 * @param {Array<{id, name, surface_x, surface_y, crs?}>} wells section order
 * @param {{geometry: object, geom: {nIl, nXl}, volumeCrs?: ?string, customDefs?: object}} ctx
 * @returns {{positions?: Array, stepM?: number, anchors: {id, name, col}[],
 *   skipped: {name, reason}[], error?: string}}
 */
export function backdropPath(wells, {
  geometry, geom, volumeCrs = null, customDefs = {},
}) {
  const skipped = [];
  const candidates = [];
  for (const w of wells || []) {
    const x = Number(w.surface_x ?? w.surfaceX);
    const y = Number(w.surface_y ?? w.surfaceY);
    if (w.surface_x == null || w.surface_y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      skipped.push({ name: w.name, reason: 'no surface location' });
      continue;
    }
    candidates.push({ ...w, surfaceX: x, surfaceY: y });
  }
  const placed = placeWellsForHost(candidates, volumeCrs, customDefs);
  for (const s of placed.skipped) skipped.push({ name: s.name, reason: s.reason });
  const affine = surveyAffine(geometry);
  const vertices = [];
  const onSurvey = [];
  for (const w of placed.wells) {
    const ij = affine ? worldToIlxl(affine, w.surfaceX, w.surfaceY) : null;
    if (!ij || ij.i < -0.5 || ij.j < -0.5 || ij.i > geom.nIl - 0.5 || ij.j > geom.nXl - 0.5) {
      skipped.push({ name: w.name, reason: 'outside the survey' });
      continue;
    }
    vertices.push({ il: ij.i, xl: ij.j });
    onSurvey.push(w);
  }
  if (vertices.length < 2) {
    return {
      anchors: [],
      skipped,
      error: `The backdrop needs two section wells on the survey; ${vertices.length} ${vertices.length === 1 ? 'is' : 'are'} on it.`,
    };
  }
  const path = resampleTraverse(vertices, geom, geometry);
  if (!path) {
    return { anchors: [], skipped, error: 'The section wells sit in the same trace, so there is no line to draw.' };
  }
  if (path.positions.length > BACKDROP_MAX_TRACES) {
    return {
      anchors: [],
      skipped,
      error: `The path is ${path.positions.length} traces long; the backdrop draws up to ${BACKDROP_MAX_TRACES}.`,
    };
  }
  // anchor each well on the nearest trace, walking forward along the path
  const anchors = [];
  let from = 0;
  vertices.forEach((v, k) => {
    let best = from;
    let bestD = Infinity;
    for (let c = from; c < path.positions.length; c++) {
      const p = path.positions[c];
      const d = Math.hypot(p.il - v.il, p.xl - v.xl);
      if (d < bestD) { bestD = d; best = c; }
    }
    anchors.push({ id: onSurvey[k].id, name: onSurvey[k].name, col: best });
    from = best;
  });
  return {
    positions: path.positions, stepM: path.stepM, anchors, skipped,
  };
}

/** RMS of the live samples (display scaling of the backdrop). */
export function liveRms(data) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === NULL_F32 || !Number.isFinite(v)) continue;
    s += v * v;
    n += 1;
  }
  return n ? Math.sqrt(s / n) : 0;
}

/**
 * Assemble the backdrop.
 * @returns {Promise<{data?: Float32Array, ns?: number, nTraces?: number,
 *   dtMs?: number, anchors: Array, skipped: Array, rms?: number,
 *   stepM?: number, error?: string}>} data is trace-major (trace * ns + sample)
 */
export async function assembleSectionBackdrop({
  getBrick, geom, geometry, wells, volumeCrs = null, customDefs = {},
}) {
  const p = backdropPath(wells, {
    geometry, geom, volumeCrs, customDefs,
  });
  if (p.error) return p;
  const slice = await assembleTraverse(getBrick, geom, p.positions);
  return {
    data: slice.data,
    ns: geom.ns,
    nTraces: p.positions.length,
    dtMs: geometry.dt_us / 1000,
    anchors: p.anchors,
    skipped: p.skipped,
    stepM: p.stepM,
    rms: liveRms(slice.data),
  };
}

/**
 * The real reader: the volume's manifest and a brick source through the
 * Seismolord slice worker. Loaded lazily so Well Correlation pulls the
 * seismic code only when a backdrop is asked for.
 */
export async function loadVolumeBackdrop(volume, wells) {
  const [{ getManifest }, { geomFromManifest }, { getSliceClient }, { getAccessToken }, { supabase }] = await Promise.all([
    import('./volumesService'),
    import('../engine/sliceAssembly'),
    import('../sources/sliceWorkerClient'),
    import('./accessToken'),
    import('@/lib/customSupabaseClient'),
  ]);
  if (volume.kind && volume.kind !== 'seismic') throw new Error(`${volume.name} is a ${volume.kind} volume; choose a seismic volume.`);
  const manifest = await getManifest(volume);
  const geom = geomFromManifest(manifest);
  const supabaseUrl = supabase.storage.from('seismic').getPublicUrl('x').data.publicUrl.split('/storage/v1/')[0];
  const src = await getSliceClient().openBricks({
    manifest, storagePath: volume.storage_path, supabaseUrl, getToken: getAccessToken,
  });
  try {
    const out = await assembleSectionBackdrop({
      getBrick: (i, j, k) => src.getBrick(i, j, k),
      geom,
      geometry: manifest.geometry,
      wells,
      volumeCrs: volume.crs || manifest.geometry?.crs || null,
    });
    return { ...out, volumeName: volume.name };
  } finally {
    src.close();
  }
}

/** Seismic volumes a backdrop can come from (ready, time domain, not derived). */
export async function listBackdropVolumes() {
  const { listVolumes } = await import('./volumesService');
  const rows = await listVolumes();
  return rows.filter((v) => (v.status || 'ready') === 'ready' && (!v.kind || v.kind === 'seismic'));
}
