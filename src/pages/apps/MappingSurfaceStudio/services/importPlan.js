// Import planning for a surface file (Mapping MS2, 2026-09-05): pure
// resolution of sign, unit, domain and CRS into the registry row the
// backend saves. The registry convention is elevation for depth
// (negative below datum, m or ft per z_unit), positive TWT ms for time,
// raw for attributes. The file's CRS is what the user declares; a
// transformable declaration converts into the Project CRS (the
// Seismolord import door's rule), a local grid cannot be placed on a
// georeferenced project and is refused.

import { surfaceGridStats } from '@/lib/gridding/surfaceImport';
import { reprojectSurfaceGrid, crsUnit } from '@/lib/crs';
import { normalizeTag, compareTags, isTransformableTag, UNKNOWN } from '@/lib/crs/tags';

export const IMPORT_DOMAINS = [
  { key: 'depth', label: 'Depth (structure, stored as elevation)' },
  { key: 'time', label: 'Time (TWT, ms)' },
  { key: 'attribute', label: 'Attribute (raw values)' },
];
export const IMPORT_SIGNS = [
  { key: 'auto', label: 'Detect from the data' },
  { key: 'negative', label: 'Negative down (elevation)' },
  { key: 'positive', label: 'Positive down (depth)' },
];
export const SURFACE_FORMAT_LABELS = {
  xyz: 'XYZ points (regular grid)',
  cps3: 'CPS-3 grid',
  zmap: 'ZMAP+ grid',
  irap: 'Irap classic grid',
};

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

/** Mostly-negative live z = negative down (elevation), else positive down. */
export function detectSign(z) {
  let neg = 0;
  let pos = 0;
  for (const v of z) {
    if (isNull(v)) continue;
    if (v < 0) neg += 1;
    else if (v > 0) pos += 1;
  }
  return neg >= pos ? 'negative' : 'positive';
}

const flipped = (z) => {
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) out[i] = isNull(z[i]) ? z[i] : -z[i];
  return out;
};

/**
 * @param {{g:{format,nx,ny,x0,y0,dx,dy,z}, fileName:string, name?:string,
 *   domain?:'depth'|'time'|'attribute', zUnit?:'m'|'ft', zSign?:'auto'|'negative'|'positive',
 *   declaredTag?:?string, projectTag?:?string, customDefs?:Object}} p
 * @returns {{name, kind, spec, grid, zDomain, zUnit, crs, xyUnit, crsProvenance, provenance,
 *   effSign, stats, reprojected}}
 */
export function planImport({
  g, fileName = 'surface', name = '', domain = 'depth', zUnit = 'ft', zSign = 'auto',
  declaredTag = null, projectTag = null, customDefs = {},
}) {
  if (!g || !g.z) throw new Error('No grid to import.');
  if (!['depth', 'time', 'attribute'].includes(domain)) throw new Error(`Unknown surface domain "${domain}".`);
  if (!['m', 'ft'].includes(zUnit)) throw new Error(`Unknown depth unit "${zUnit}".`);
  const stats = surfaceGridStats(g);
  if (!stats.live) throw new Error('The grid has no live nodes.');

  let z = Float32Array.from(g.z);
  let effSign = null;
  if (domain === 'depth') {
    effSign = zSign === 'auto' ? detectSign(g.z) : zSign;
    if (effSign === 'positive') z = flipped(z);          // store elevation
  } else if (domain === 'time') {
    effSign = detectSign(g.z);
    if (effSign === 'negative') z = flipped(z);          // TWT is positive
  }

  let spec = { x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny };
  const declared = declaredTag ? normalizeTag(declaredTag) : null;
  const project = projectTag ? normalizeTag(projectTag) : null;
  let tag = declared && declared !== UNKNOWN ? declared : null;
  let reprojected = null;
  if (declared && project && declared !== project) {
    const rel = compareTags(declared, project);
    if (rel === 'transformable') {
      const r = reprojectSurfaceGrid({ spec, z, fromTag: declared, toTag: project, customDefs });
      spec = { ...r.spec };
      z = r.z;
      tag = project;
      reprojected = { from: declared, to: project, coverage: r.coverage };
    } else if (rel === 'local-mismatch') {
      throw new Error('The file is on a local grid and the project is georeferenced (or the reverse). Declare a matching CRS or import it as unknown placement.');
    }
  }

  const kind = domain === 'attribute' ? 'attribute' : 'structure';
  const finalStats = surfaceGridStats({ z });
  return {
    name: (name || fileName.replace(/\.[^.]+$/, '') || 'Imported surface').trim(),
    kind,
    spec,
    grid: z,
    zDomain: domain,
    zUnit: domain === 'depth' ? zUnit : domain === 'time' ? 'ms' : null,
    crs: tag,
    xyUnit: tag && isTransformableTag(tag) ? crsUnit(tag, customDefs) : null,
    crsProvenance: { source: 'import', declared: declared || null, converted: !!reprojected },
    provenance: {
      engine: 'mapping-surface-studio',
      imported_from: { file_name: fileName, format: g.format || null },
      stats: { live: finalStats.live, nulls: finalStats.nulls, z_min: finalStats.zMin, z_max: finalStats.zMax },
      z_sign_in: effSign,
      z_convention: domain === 'depth' ? 'elevation' : domain === 'time' ? 'twt_positive' : 'raw',
      reprojected,
      imported_at: new Date().toISOString(),
    },
    effSign,
    stats,
    reprojected,
  };
}
