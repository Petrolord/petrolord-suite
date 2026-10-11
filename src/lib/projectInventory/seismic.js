// Project Data Inventory: the seismic in the project. Seismolord volumes
// (seismic_volumes rows with their survey_meta) and the QI worker's files
// (qi_datasets: gather stores and SEG-Y uploads not yet converted) become
// rows a geophysicist reads at a glance: type, format and bit depth, extent
// and area, inline and crossline ranges, sample rate, record length, CRS,
// size and domain. Pure.

import { SAMPLE_FORMATS } from '@/pages/apps/Seismolord/lib/segyDoor';

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

// bits per sample of each SEG-Y format code
const BITS = { 1: 32, 2: 32, 3: 16, 4: 32, 5: 32, 6: 64, 7: 24, 8: 8, 9: 64, 10: 32, 11: 16, 12: 64, 15: 24, 16: 8 };
const SHORT_FORMAT = { 1: 'IBM float', 2: 'Integer', 3: 'Integer', 4: 'Fixed point', 5: 'IEEE float', 6: 'IEEE float', 7: 'Integer', 8: 'Integer', 9: 'Integer', 10: 'Unsigned', 11: 'Unsigned', 12: 'Unsigned', 15: 'Unsigned', 16: 'Unsigned' };

// derived volumes the QI worker and Seismolord write (attribute_params.name)
const DERIVED = {
  qi_inversion: 'Acoustic impedance (post-stack inversion)',
  qi_prestack_inversion: 'Elastic volumes (simultaneous inversion)',
  qi_matched_stack: 'Matched angle stack',
  qi_avo: 'AVO attribute',
  qi_property: 'Property prediction',
};

/** The type of a volume in words, and its role: delivered seismic or a derived product. */
export function volumeType(v) {
  const a = v?.attribute_params || {};
  if (v?.kind === 'attribute') {
    if (DERIVED[a.name]) return { type: DERIVED[a.name], role: a.name === 'qi_matched_stack' ? 'stack' : 'derived', stack: a.name === 'qi_matched_stack' ? 'angle' : null };
    const attr = v?.survey_meta?.attribute?.name || a.name || 'attribute';
    return { type: `Attribute (${String(attr).replace(/_/g, ' ')})`, role: 'derived', stack: null };
  }
  const n = String(v?.name || '').toLowerCase();
  if (/gather|cdp|cmp|prestack|pre-stack/.test(n)) return { type: 'Prestack gathers', role: 'gathers', stack: 'gathers' };
  if (/\bnear\b|near[-_ .]|_near|\bnr\b/.test(n)) return { type: 'Near angle stack', role: 'stack', stack: 'angle', angle: 'near' };
  if (/\bmid\b|mid[-_ .]|_mid/.test(n)) return { type: 'Mid angle stack', role: 'stack', stack: 'angle', angle: 'mid' };
  if (/ultra.?far/.test(n)) return { type: 'Ultra-far angle stack', role: 'stack', stack: 'angle', angle: 'ultrafar' };
  if (/\bfar\b|far[-_ .]|_far/.test(n)) return { type: 'Far angle stack', role: 'stack', stack: 'angle', angle: 'far' };
  if (/full|stack|fstk|pstm|psdm|migrat|final/.test(n)) return { type: 'Full stack', role: 'stack', stack: 'full' };
  return { type: 'Stack (type not stated in the name)', role: 'stack', stack: 'unknown' };
}

/** Time or depth: Seismolord stores time volumes unless the row says depth. */
export function volumeDomain(v) {
  const m = v?.survey_meta || {};
  const d = String(m.domain || m.z_domain || v?.attribute_params?.domain || '').toLowerCase();
  if (d.startsWith('depth')) return 'Depth';
  if (d.startsWith('time') || d.startsWith('twt')) return 'Time';
  if (/(^|[^a-z])(psdm|depth|dpth)([^a-z]|$)/i.test(String(v?.name || ''))) return 'Depth';
  return 'Time';
}

/** Bin sizes, area and the survey outline from the affine geometry (metres in a projected CRS). */
export function surveyGeometry(m) {
  const il = m?.il || {};
  const xl = m?.xl || {};
  const nIl = num(il.count) || (Number.isFinite(num(il.max)) && Number.isFinite(num(il.min)) ? Math.round((num(il.max) - num(il.min)) / (num(il.step) || 1)) + 1 : NaN);
  const nXl = num(xl.count) || (Number.isFinite(num(xl.max)) && Number.isFinite(num(xl.min)) ? Math.round((num(xl.max) - num(xl.min)) / (num(xl.step) || 1)) + 1 : NaN);
  const a = m?.affine;
  if (!a?.origin || !a?.il_vec || !a?.xl_vec || !(nIl > 0) || !(nXl > 0)) return { nIl, nXl, binIl: null, binXl: null, areaKm2: null, outline: null };
  const binIl = Math.hypot(a.il_vec.x, a.il_vec.y);
  const binXl = Math.hypot(a.xl_vec.x, a.xl_vec.y);
  const cross = Math.abs(a.il_vec.x * a.xl_vec.y - a.il_vec.y * a.xl_vec.x);
  // the outline of the bin centres, extended half a bin all round for the area
  const areaKm2 = (cross * nIl * nXl) / 1e6;
  const p = (i, j) => ({ x: a.origin.x + i * a.il_vec.x + j * a.xl_vec.x, y: a.origin.y + i * a.il_vec.y + j * a.xl_vec.y });
  const outline = [p(-0.5, -0.5), p(nIl - 0.5, -0.5), p(nIl - 0.5, nXl - 0.5), p(-0.5, nXl - 0.5)];
  return { nIl, nXl, binIl, binXl, areaKm2, outline };
}

/** Point in a convex or concave polygon (ray casting). */
export function insidePolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

/** One volume row. */
export function volumeRow(v) {
  const m = v?.survey_meta || {};
  const t = volumeType(v);
  const fmt = num(m.sample_format);
  const derived = v?.kind === 'attribute';
  const geom = surveyGeometry(m);
  const dtMs = Number.isFinite(num(m.dt_us)) ? num(m.dt_us) / 1000 : null;
  const ns = num(m.ns);
  const recordMs = dtMs && ns > 0 ? (ns - 1) * dtMs : null;
  const domain = volumeDomain(v);
  return {
    id: v.id,
    name: v.name,
    ...t,
    derived,
    status: v.status || 'ready',
    format: derived ? 'Float (computed)' : Number.isFinite(fmt) ? (SHORT_FORMAT[fmt] || `Code ${fmt}`) : null,
    formatLong: Number.isFinite(fmt) ? (SAMPLE_FORMATS[fmt] || `SEG-Y format code ${fmt}`) : null,
    bits: derived ? 32 : (Number.isFinite(fmt) ? BITS[fmt] || null : null),
    il: m.il ? { min: num(m.il.min), max: num(m.il.max), step: num(m.il.step) || 1 } : null,
    xl: m.xl ? { min: num(m.xl.min), max: num(m.xl.max), step: num(m.xl.step) || 1 } : null,
    traces: geom.nIl > 0 && geom.nXl > 0 ? geom.nIl * geom.nXl : null,
    binIl: geom.binIl,
    binXl: geom.binXl,
    areaKm2: geom.areaKm2,
    outline: geom.outline,
    dtMs,
    samples: ns > 0 ? ns : null,
    recordMs,
    recordUnit: domain === 'Depth' ? 'depth units' : 'ms',
    domain,
    crs: v.crs || m.crs || null,
    bytes: Number.isFinite(num(m.storage_bytes)) ? num(m.storage_bytes) : null,
    parentId: v.parent_volume_id || m.parent_volume_id || null,
  };
}

/** Worker files a study reads that are not (yet) Seismolord volumes: gather stores, and SEG-Y uploads no volume or store came from. */
export function datasetRows(datasets = [], volumes = [], allNames = null) {
  const live = (datasets || []).filter((d) => !['deleted', 'failed', 'aborted'].includes(d.status));
  const usedSources = new Set(live.map((d) => d.meta?.source_dataset).filter(Boolean));
  const volumeNames = new Set((allNames || (volumes || []).map((v) => v.name)).map((n) => String(n || '').toLowerCase()));
  const rows = [];
  for (const d of live) {
    if (d.kind === 'gathers_offset' || /gather/.test(d.kind || '')) {
      rows.push({
        id: d.id, name: d.name || d.original_filename, type: 'Prestack gathers (offset bins)', role: 'gathers', stack: 'gathers',
        derived: false, format: 'IEEE float', bits: 32, traces: num(d.meta?.traces) || null, bins: num(d.meta?.bins) || null,
        binWidthM: num(d.meta?.bin_width_m) || null, bytes: num(d.bytes) || null, domain: 'Time', crs: null, store: true,
      });
    } else if (d.kind === 'segy_upload' && !usedSources.has(d.id) && !volumeNames.has(String(d.original_filename || d.name || '').toLowerCase())) {
      rows.push({
        id: d.id, name: d.original_filename || d.name, type: 'SEG-Y upload, not yet converted', role: 'upload', stack: null,
        derived: false, format: null, bits: null, bytes: num(d.bytes) || null, domain: null, crs: null, store: true,
      });
    }
  }
  return rows;
}

/** Human file size. */
export function fmtBytes(b) {
  if (!Number.isFinite(b) || b <= 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

/**
 * The seismic section: rows plus what the rules need (counts by kind,
 * geometry mismatches between the stacks, CRS gaps).
 */
export function seismicSummary(volumes = [], datasets = [], { allVolumeNames = null } = {}) {
  const vols = (volumes || []).filter((v) => (v.status || 'ready') === 'ready').map(volumeRow);
  const files = datasetRows(datasets, volumes, allVolumeNames);
  const delivered = vols.filter((v) => !v.derived || v.role === 'stack');
  const stacks = delivered.filter((v) => v.role === 'stack');
  const full = stacks.filter((v) => v.stack === 'full' || v.stack === 'unknown');
  const angle = stacks.filter((v) => v.stack === 'angle');
  const gathers = [...vols.filter((v) => v.role === 'gathers'), ...files.filter((f) => f.role === 'gathers')];
  const derived = vols.filter((v) => v.derived && v.role !== 'stack');
  const geomKey = (v) => (v.il && v.xl ? `${v.il.min}-${v.il.max}/${v.xl.min}-${v.xl.max}/${v.samples}/${v.dtMs}` : null);
  const keys = new Set(stacks.map(geomKey).filter(Boolean));
  const lowBits = delivered.filter((v) => v.bits && v.bits < 32);
  const noCrs = delivered.filter((v) => !v.crs);
  const area = Math.max(0, ...delivered.map((v) => v.areaKm2 || 0));
  return {
    rows: [...delivered, ...files, ...derived],
    delivered, stacks, full, angle, gathers, derived, files,
    geometryMismatch: keys.size > 1,
    lowBits, noCrs,
    areaKm2: area || null,
    depthVolumes: delivered.filter((v) => v.domain === 'Depth'),
  };
}
