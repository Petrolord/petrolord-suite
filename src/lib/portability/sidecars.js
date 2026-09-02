// Open-format sidecars for a Geoscience .pld (Project Portability PP1,
// PLAN principle 5: readable without Petrolord).
//
//   open/wells/<slug>.las         LAS 2.0, every log of the well, depth first
//   open/wells/<slug>-tops.csv    name, md_m, interpreter
//   open/wells/<slug>-zones.csv   name, top_md_m, base_md_m
//   open/surfaces/<slug>.zmap     ZMAP+ grid (rotation is not representable)
//   README.txt                    what the package is and how to read it
//
// The writers are the Suite's existing, round-trip-gated ones: writeLas
// (packages/engines/engines/welldata/lasWrite.js) and writeZMAP
// (packages/engines/lib/gridding/surfaceExport.js). Nothing here formats
// numbers itself.

import { writeLas } from '@/pages/apps/WellDataManager/engine/lasWrite';
import { writeZMAP } from '@/lib/gridding/surfaceExport';

const DEPTH_MNEMONICS = new Set(['DEPT', 'DEPTH', 'MD']);
const base = (m) => String(m || '').toUpperCase().split(':')[0];

export function slug(name, fallback = 'item') {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || fallback;
}

/** Unique open/ path for a name; `used` is a Set the caller keeps across calls. */
export function uniquePath(dir, name, ext, used, fallback) {
  const s = slug(name, fallback);
  let candidate = `${dir}/${s}${ext}`;
  let i = 2;
  while (used.has(candidate)) { candidate = `${dir}/${s}-${i}${ext}`; i += 1; }
  used.add(candidate);
  return candidate;
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/** Pick the depth log of a well (DEPT/DEPTH/MD by base mnemonic), or null. */
export function findDepthLog(logs) {
  return logs.find((l) => DEPTH_MNEMONICS.has(base(l.mnemonic))) || null;
}

/**
 * LAS 2.0 text for one well. `curves` is a Map/obj of log id -> ArrayLike
 * samples (already downloaded). Returns null when the well has no depth
 * log (LAS needs one); the caller records a note.
 */
export function wellLasText(well, logs, curvesById) {
  const depth = findDepthLog(logs);
  if (!depth || !curvesById[depth.id]) return null;
  const n = depth.n_samples ?? curvesById[depth.id].length;
  const others = logs.filter((l) => l.id !== depth.id && curvesById[l.id] && curvesById[l.id].length === n);
  const curves = [depth, ...others].map((l) => ({
    mnemonic: base(l.mnemonic) === base(depth.mnemonic) && l.id === depth.id ? 'DEPT' : l.mnemonic,
    unit: l.unit || (l.id === depth.id ? 'M' : ''),
    descr: l.description || '',
    data: curvesById[l.id],
  }));
  return writeLas({
    wellName: well.name || '',
    uwi: well.uwi || '',
    depthUnit: 'M',
    curves,
    params: [
      { name: 'SOURCE', value: 'Petrolord Project Package', descr: 'open-format sidecar' },
      { name: 'WELLID', value: well.id, descr: 'registry id at export' },
      ...(well.kb_m != null ? [{ name: 'EKB', unit: 'M', value: well.kb_m, descr: 'kelly bushing' }] : []),
    ],
    other: 'Written by Petrolord Project Package export. Curves are the registry logs of this well; computed curves carry their method in the log description.',
  });
}

export function topsCsv(tops) {
  return csv(['name', 'md_m', 'interpreter'], tops.map((t) => [t.name, t.md_m, t.interpreter]));
}

export function zonesCsv(zones) {
  return csv(['name', 'top_md_m', 'base_md_m'], zones.map((z) => [z.name, z.top_md_m, z.base_md_m]));
}

/**
 * ZMAP+ text for a surface row plus its grid (Float32Array, row-major from
 * origin). Returns { text, note } where note is set when rotation was lost.
 */
export function surfaceZmapText(surface, grid) {
  const { nx, ny, dx, dy, origin_x: x0, origin_y: y0 } = surface;
  const x = Array.from({ length: nx }, (_, c) => x0 + c * dx);
  const y = Array.from({ length: ny }, (_, r) => y0 + r * dy);
  const text = writeZMAP({ x, y, z: grid, nx, ny, name: surface.name || 'surface', crsLabel: surface.crs || surface.crs_note || undefined });
  const note = surface.rotation_deg ? `Surface "${surface.name}" is rotated ${surface.rotation_deg} deg in the registry; ZMAP+ cannot carry rotation, so the sidecar is unrotated. The registry row in data/geo_surfaces.jsonl keeps the true geometry.` : null;
  return { text, note };
}

export function readmeText({ manifestSummary, platform, roots, notes }) {
  const lines = [
    'PETROLORD PROJECT PACKAGE (.pld)',
    '',
    `Created ${manifestSummary.created_at} with Petrolord Suite ${platform.version} (${platform.sha}).`,
    `Package id ${manifestSummary.package_id}${manifestSummary.name ? `, name "${manifestSummary.name}"` : ''}.`,
    '',
    'WHAT THIS IS',
    'A self-contained copy of the items listed under CONTENTS, taken from the',
    'Petrolord Suite registry. Open it in Petrolord with Import package to get an',
    'independent copy under your own account (nothing you already have is',
    'touched). Every file in the archive is listed in manifest.json with its',
    'size and sha256, so the package can be checked for completeness without',
    'Petrolord.',
    '',
    'LAYOUT',
    '  manifest.json        inventory, versions, checksums',
    '  data/<table>.jsonl   one registry row per line, as stored',
    '  blobs/<bucket>/...   binary data (float32 curves and grids, JSON features)',
    '  open/wells/*.las     LAS 2.0 per well, readable by any log viewer',
    '  open/wells/*-tops.csv, *-zones.csv',
    '  open/surfaces/*.zmap ZMAP+ grids, readable by any mapping package',
    '',
    'CONTENTS',
    ...roots.map((r) => `  ${r.kind}: ${r.name || r.id}`),
    '',
    'TABLES',
    ...Object.entries(manifestSummary.tables).map(([t, i]) => `  ${t}: ${i.rows} row${i.rows === 1 ? '' : 's'}`),
  ];
  if (notes.length) lines.push('', 'NOTES', ...notes.map((n) => `  - ${n}`));
  lines.push('', 'Depths are metres measured depth unless a column says otherwise. Coordinates', 'carry the CRS recorded on each row (crs, xy_unit).', '');
  return lines.join('\n');
}
