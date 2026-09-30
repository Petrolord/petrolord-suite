// Fault polygon and boundary files that are not GIS files (Mapping &
// Surface Studio upgrade U2-004, 2026-09-30). Petrel exports fault
// polygons as "ZMAP+ lines" and RMS/Irap as "Irap classic lines"; a
// mapper brings those, not a shapefile. Both are read here into the
// normalized culture features of src/lib/cultureImport ({type:'polygon',
// rings, props} or {type:'polyline', paths, props}), so the shared
// Culture import dialog stores them in geo_culture like any other layer.
//
// ZMAP+ lines: a header block between '@' lines (the first names the
// set and says POLYGON or LINE), then "x y z id" rows. A row of nulls
// (1E+30, the header's null value) ends a segment; a change of id starts
// a new one. Irap classic lines: "x y z" rows; a "999 999 999" row ends
// each line. A segment that closes on itself (or any segment of a
// POLYGON set with three or more distinct vertices) is a polygon; the
// rest are polylines. Pure, no I/O.

const NULL_ABS = 1e29;
const numbersOf = (s) => s.trim().split(/[\s,;]+/).filter(Boolean).map(Number);
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** 'zmap-lines', 'irap-lines' or null from the file text. */
export function detectPolygonFileFormat(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('!') && !l.startsWith('#'));
  if (!lines.length) return null;
  if (lines[0].startsWith('@') && /\b(POLYGON|LINE|LINES)\b/i.test(lines[0])) return 'zmap-lines';
  const rows = lines.slice(0, 50).map(numbersOf);
  if (rows.every((r) => r.length >= 3 && r.every(Number.isFinite)) && rows.some((r) => r[0] === 999 && r[1] === 999)) return 'irap-lines';
  return null;
}

function segmentsToFeatures(segments, { polygonSet, baseName }) {
  const features = [];
  let skipped = 0;
  segments.forEach((seg, i) => {
    const pts = [];
    for (const p of seg.points) if (!pts.length || !same(pts[pts.length - 1], p)) pts.push(p);
    const closed = pts.length >= 4 && same(pts[0], pts[pts.length - 1]);
    const ring = closed ? pts.slice(0, -1) : pts;
    const name = `${baseName} ${seg.id ?? i + 1}`;
    if ((closed || polygonSet) && ring.length >= 3) {
      features.push({ type: 'polygon', rings: [[...ring, ring[0]]], props: { NAME: name, ID: seg.id ?? i + 1 } });
    } else if (pts.length >= 2) {
      features.push({ type: 'polyline', paths: [pts], props: { NAME: name, ID: seg.id ?? i + 1 } });
    } else skipped += 1;
  });
  return { features, skipped };
}

/** Petrel ZMAP+ lines (fault polygons, fault traces). */
export function parseZmapLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  let i = 0;
  const content = () => { while (i < lines.length && (!lines[i].trim() || /^\s*[!#]/.test(lines[i]))) i += 1; };
  content();
  const head = (lines[i] || '').trim();
  if (!head.startsWith('@')) throw new Error('Not a ZMAP+ lines file: the first line after the comments must start with @.');
  const polygonSet = /\bPOLYGON\b/i.test(head);
  const baseName = head.replace(/^@/, '').split(',')[0].replace(/\bHEADER\b/i, '').trim() || 'Polygon';
  i += 1;
  let nullValue = 1e30;
  // header lines until the closing '@'
  while (i < lines.length && !lines[i].trim().startsWith('@')) {
    const f = lines[i].split(',').map((s) => s.trim());
    if (f.length >= 2 && Number.isFinite(Number(f[1])) && f[1] !== '') nullValue = Number(f[1]);
    i += 1;
  }
  if (i >= lines.length) throw new Error('The ZMAP+ lines header has no closing @ line.');
  i += 1;
  const isNullV = (v) => !Number.isFinite(v) || Math.abs(v) >= NULL_ABS || v === nullValue;
  const segments = [];
  let cur = null;
  let bad = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('!') || t.startsWith('#')) continue;
    const n = numbersOf(t);
    if (n.length < 2 || Number.isNaN(n[0]) || Number.isNaN(n[1])) { bad += 1; continue; }
    const id = n.length >= 4 && Number.isFinite(n[3]) ? n[3] : null;
    if (isNullV(n[0]) || isNullV(n[1])) { cur = null; continue; }
    if (!cur || (id != null && cur.id !== id)) { cur = { id, points: [] }; segments.push(cur); }
    cur.points.push([n[0], n[1]]);
  }
  const out = segmentsToFeatures(segments, { polygonSet, baseName });
  return { ...out, skipped: out.skipped + bad, format: 'zmap-lines' };
}

/** Irap classic lines ("x y z" rows, "999 999 999" ends each line). */
export function parseIrapLines(text) {
  const segments = [];
  let cur = null;
  let bad = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('!') || t.startsWith('#')) continue;
    const n = numbersOf(t);
    if (n.length < 2 || !Number.isFinite(n[0]) || !Number.isFinite(n[1])) { bad += 1; continue; }
    if (n[0] === 999 && n[1] === 999) { cur = null; continue; }
    if (!cur) { cur = { id: segments.length + 1, points: [] }; segments.push(cur); }
    cur.points.push([n[0], n[1]]);
  }
  const out = segmentsToFeatures(segments, { polygonSet: false, baseName: 'Line' });
  return { ...out, skipped: out.skipped + bad, format: 'irap-lines' };
}

/** Read either lines format; refuses anything else with the formats named. */
export function parsePolygonLinesFile(text) {
  const fmt = detectPolygonFileFormat(text);
  if (fmt === 'zmap-lines') return parseZmapLines(text);
  if (fmt === 'irap-lines') return parseIrapLines(text);
  throw new Error('Not a polygon lines file. Culture import reads GeoJSON, shapefiles, Petrel ZMAP+ lines (@ header) and Irap classic lines (999 999 999 between lines).');
}

/**
 * Every polygon of a culture row as an open ring of [x, y] (outer rings;
 * holes are not fault blocks). MAP-U1-020: the map used the first feature
 * only, so a file with two fault polygons made one block.
 */
export function polygonRingsOf(features) {
  const rings = [];
  for (const f of features || []) {
    if (f?.type !== 'polygon' && !f?.rings) continue;
    const ring = (f.rings?.[0] || []).map((v) => (Array.isArray(v) ? [v[0], v[1]] : [v.x, v.y]));
    if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
