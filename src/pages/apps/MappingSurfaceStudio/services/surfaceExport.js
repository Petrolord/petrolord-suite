// Surface export for Mapping & Surface Studio (MS2, 2026-09-05): the
// byte-golden writers (lib/gridding/surfaceExport) on a registry row,
// with lengths converted to the display unit first, plus a control
// points CSV from the provenance the workstation records at grid time.
// Pure text builders; the download helper is the only DOM touch.

import { writeXYZ, writeCPS3, writeZMAP, writeIrapClassic } from '@/lib/gridding/surfaceExport';
import { convertZUnit } from '@/lib/gridding/gridmath';
import { normalizeTag, isTransformableTag } from '@/lib/crs/tags';
import { gridObject } from '../engine/surface';
import { downloadBlob } from '@/components/maps/mapPng';

export const EXPORT_FORMATS = [
  { key: 'xyz', label: 'XYZ points (.xyz)', ext: 'xyz' },
  { key: 'cps3', label: 'CPS-3 grid (.dat)', ext: 'cps3.dat' },
  { key: 'zmap', label: 'ZMAP+ grid (.dat)', ext: 'zmap.dat' },
  { key: 'irap', label: 'Irap classic grid (.dat)', ext: 'irap.dat' },
];

export const specOfSurface = (s) => ({ x0: s.origin_x, y0: s.origin_y, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny });

/** A length surface (depth elevation, thickness) follows the display unit. */
export const isLengthSurface = (s) => !!s && s.kind !== 'attribute' && s.z_domain !== 'attribute' && s.z_domain !== 'time';

export const safeName = (name) => String(name || 'surface').replace(/[^\w-]+/g, '_').toLowerCase();

const M_PER_FT = 0.3048;

/** Elevation in the row's unit -> the display unit (nulls kept). */
export function gridInUnit(surface, grid, unit) {
  if (!isLengthSurface(surface)) return grid;
  const from = surface.z_unit === 'ft' ? 'ft' : 'm';
  return from === unit ? grid : convertZUnit(grid, from, unit);
}

/**
 * @returns {{text:string, fileName:string, unit:?string}}
 */
export function exportSurfaceText(surface, grid, formatKey, { unit = 'm' } = {}) {
  const fmt = EXPORT_FORMATS.find((f) => f.key === formatKey);
  if (!fmt) throw new Error(`Unknown surface export format: ${formatKey}`);
  const length = isLengthSurface(surface);
  const z = gridInUnit(surface, grid, unit);
  const g = gridObject(specOfSurface(surface), z);
  const name = safeName(surface.name);
  const crsLabel = isTransformableTag(surface.crs) ? normalizeTag(surface.crs) : null;
  let text;
  if (formatKey === 'xyz') text = writeXYZ(g);
  else if (formatKey === 'cps3') text = writeCPS3(g);
  else if (formatKey === 'zmap') text = writeZMAP({ ...g, name, ...(crsLabel ? { crsLabel } : {}) });
  else text = writeIrapClassic(g);
  const tag = length ? unit : (surface.z_domain === 'time' ? 'ms' : 'attr');
  return { text, fileName: `${name}-${tag}.${fmt.ext}`, unit: length ? unit : null };
}

/** Control points the surface was gridded from (provenance.points). */
export function controlPointsCsv(surface, { unit = 'm' } = {}) {
  const pts = surface?.provenance?.points;
  if (!Array.isArray(pts) || !pts.length) throw new Error('This surface has no control points recorded (imported or computed surfaces have none).');
  const length = isLengthSurface(surface);
  const f = length && unit === 'ft' ? 1 / M_PER_FT : 1;
  const zHead = length ? `z_${unit}` : 'z';
  const rows = [...pts]
    .sort((a, b) => String(a.well).localeCompare(String(b.well)))
    .map((p) => [p.well, p.x, p.y, Number.isFinite(p.z) ? (p.z * f).toFixed(3) : '', Number.isFinite(p.md) ? p.md.toFixed(3) : '', p.extrapolated ? 'yes' : 'no'].join(','));
  return {
    text: `well,x,y,${zHead},md_m,extrapolated\n${rows.join('\n')}\n`,
    fileName: `${safeName(surface.name)}-control-points.csv`,
  };
}

/** One line of provenance for a row tooltip. */
export function describeSurface(s) {
  if (!s) return '';
  const parts = [];
  const unit = isLengthSurface(s) ? (s.z_unit || 'm') : s.z_domain === 'time' ? 'ms' : null;
  parts.push(`${s.kind || 'surface'} · ${s.z_domain || 'depth'}${unit ? ` (${unit})` : ''}`);
  parts.push(isTransformableTag(s.crs) ? normalizeTag(s.crs) : 'placement unverified (no CRS)');
  const p = s.provenance || {};
  if (p.imported_from?.file_name) parts.push(`imported from ${p.imported_from.file_name}`);
  else if (p.source?.type === 'top') parts.push(`gridded from top ${p.source.key} (${p.control_points ?? '?'} wells, ${p.depth_ref ? p.depth_ref.toUpperCase() : 'MD'}, cell ${p.cell_m ?? '?'} m)`);
  else if (p.source?.type === 'zone') parts.push(`gridded from zone ${p.source.zoneName || ''} ${p.source.key} (${p.control_points ?? '?'} wells, cell ${p.cell_m ?? '?'} m)`);
  else if (p.thickness) parts.push('thickness of two surfaces');
  else if (p.engine === 'earth-modeling') parts.push(`Earth Modeling ${p.layer || ''} layer`);
  else if (p.app === 'seismolord') parts.push('from Seismolord');
  if (Array.isArray(p.history) && p.history.length) parts.push(`re-gridded ${p.history.length}x`);
  return parts.join(' · ');
}

export function downloadText(text, fileName, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), fileName);
}
