// Seismolord's view of the shared geo_surfaces registry
// (src/lib/surfacesRegistry.js, the cross-app surface home used by
// Mapping & Surface Studio and ReservoirCalc Pro). Converting a
// horizon INTERPRETATION (picks) into a SURFACE persists a first-class
// registry object with full provenance; the explorer's Surfaces
// section lists the ones derived from the active volume, and any of
// them re-exports to XYZ / CPS-3 / ZMAP+ / Irap classic without
// re-gridding.

import {
  listSurfaces, saveSurface, deleteSurface, downloadSurfaceGrid,
} from '@/lib/surfacesRegistry';
import {
  writeXYZ, writeCPS3, writeZMAP, writeIrapClassic,
} from '@/lib/gridding/surfaceExport';

export const SURFACE_APP = 'seismolord';

/** True when a geo_surfaces row was converted from a horizon of this
 *  volume (pure — unit tested). */
export const isVolumeSurface = (row, volumeId) => (
  row?.provenance?.app === SURFACE_APP
  && row?.provenance?.volume?.id === volumeId
);

/** Registry surfaces derived from this volume's horizons. */
export async function listVolumeSurfaces(volumeId) {
  const all = await listSurfaces();
  return all.filter((s) => isVolumeSurface(s, volumeId));
}

/**
 * Persist a gridded horizon as a first-class surface in the shared
 * registry (visible to Mapping & Surface Studio and any later
 * consumer; org-shareable there).
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.horizon seismic_horizons row
 * @param {'depth'|'twt'} p.domain
 * @param {{z: Float32Array}} p.g gridded surface (gridHorizonSurface)
 * @param {{x0,y0,dx,dy,nx,ny}} p.spec export grid spec
 * @param {Object} p.params gridding/export provenance (the same params
 *   object the RCP handoff records)
 */
export async function saveHorizonAsSurface({ volume, horizon, domain, g, spec, params }) {
  return saveSurface({
    name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
    kind: 'structure',
    spec,
    zDomain: domain === 'depth' ? 'depth' : 'time',
    zUnit: domain === 'depth' ? 'ft' : 'ms',
    crsNote: 'Survey world metres XY; Z negative-down (Petrolord convention)',
    grid: g.z,
    provenance: {
      app: SURFACE_APP,
      volume: { id: volume.id, name: volume.name },
      horizon: { id: horizon.id, name: horizon.name },
      domain: domain === 'depth' ? 'depth_ft' : 'twt_ms',
      params,
      converted_at: new Date().toISOString(),
    },
  });
}

export const SURFACE_EXPORT_FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
  { key: 'irap', label: 'Irap classic grid (.dat)', ext: 'irap.dat' },
];

/** Rebuild the writers' grid shape from a registry row + its blob. */
export function surfaceToGrid(surface, grid) {
  return {
    z: grid,
    nx: surface.nx,
    ny: surface.ny,
    dx: surface.dx,
    dy: surface.dy,
    x: Array.from({ length: surface.nx }, (_, c) => surface.origin_x + c * surface.dx),
    y: Array.from({ length: surface.ny }, (_, r) => surface.origin_y + r * surface.dy),
  };
}

/**
 * Download a stored surface's grid and render it in the requested
 * format. @returns {Promise<{text: string, fileName: string}>}
 */
export async function exportStoredSurface(surface, formatKey) {
  const fmt = SURFACE_EXPORT_FORMATS.find((f) => f.key === formatKey);
  if (!fmt) throw new Error(`Unknown surface export format: ${formatKey}`);
  const grid = await downloadSurfaceGrid(surface);
  const g = surfaceToGrid(surface, grid);
  const safeName = surface.name.replace(/[^\w-]+/g, '_').toLowerCase();
  let text;
  if (formatKey === 'xyz') text = writeXYZ(g);
  else if (formatKey === 'cps3') text = writeCPS3(g);
  else if (formatKey === 'zmap') text = writeZMAP({ ...g, name: safeName });
  else text = writeIrapClassic(g);
  return { text, fileName: `${safeName}.${fmt.ext}` };
}

export { deleteSurface };
