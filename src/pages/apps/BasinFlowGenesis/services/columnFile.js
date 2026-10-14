// A stratigraphic column file for Basin & Charge Modeling (2026-10-14, Ekene
// basin videos). One table that sets up a 1D model the way a basin modeller
// keeps it: a row per surface (top) with its age, and optionally its depth,
// its type and hiatus, the lithology of the layer below it and the source
// rock of that layer.
//
// Two doors use it:
//  - Formation tops: the file has depths, so it IS the stratigraphy (a
//    pseudo-well in a kitchen, or a well that is not in the registry).
//  - Registry well: the well gives the depths (TVD through its survey); the
//    file dates its tops and sets the lithologies by surface name, so the
//    model stays tied to the well (Well data, Open in, Petrophysics logs).
//
// Before this, the tops import read only a name and a depth (ages were
// placeholders and the unit stated in a header such as "md_m" was ignored,
// so metres were read as feet), and a registry well whose tops were not
// dated in Stratigraphy Studio gave placeholder ages only.
//
// Columns (header words, any order, case and punctuation ignored):
//   name      name, top, top_name, surface, formation, marker, horizon
//   depth     depth, md, tvd, z (+ unit in the header: md_m, depth_ft, "Depth (ft)")
//   age       age, age_ma, age (Ma)       the surface's age, Ma
//   hiatus    hiatus_end_ma, hiatus_to_ma, hiatus   an unconformity's older bound
//   type      surface_type, type          (unconformity, sb, mfs, ...)
//   lithology lithology, lith             the layer BELOW the surface
//   mix       sand_pct, shale_pct, limestone_pct (parts; makes the layer mixed)
//   source    toc (wt %), hi (mg HC/g TOC), kerogen (type2, pc-B, ...)
//   eroded    eroded_m, eroded_ft: section removed at an unconformity (its
//             erosion event's amount; unit from the header, else the depth unit)
// A row named TD, Total depth or Base (with a depth and an age) closes the
// last layer: its base depth and its base age.

import { parseDelimitedText } from '@/lib/tabularFile';
import { headerUnit } from './calibrationImport';
import { layersFromDatedTops } from '@/lib/stratigraphy/basinLayers';
import { kineticsKey } from './lithologyMix';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, '');
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
const num = (s) => { const v = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const M_PER_FT = 0.3048;

const COLS = {
  name: ['name', 'topname', 'top', 'surface', 'formation', 'marker', 'horizon', 'layer'],
  depth: ['depth', 'md', 'tvd', 'tvdkb', 'z', 'mdm', 'mdft', 'depthm', 'depthft', 'tvdm', 'tvdft'],
  age: ['age', 'agema', 'ageofsurface'],
  hiatus: ['hiatusendma', 'hiatustoma', 'hiatusend', 'hiatusto', 'hiatus'],
  type: ['surfacetype', 'type', 'kind'],
  lithology: ['lithology', 'lith', 'rock'],
  sand: ['sandpct', 'sand', 'sandstonepct', 'sandstone'],
  shale: ['shalepct', 'shale'],
  limestone: ['limestonepct', 'limestone', 'carbonatepct'],
  toc: ['toc', 'tocwtpct', 'tocpct'],
  hi: ['hi', 'hydrogenindex'],
  kerogen: ['kerogen', 'kinetics', 'kerogentype'],
  eroded: ['erodedm', 'erodedft', 'eroded', 'erosion', 'erosionm', 'erosionft', 'erodedthickness'],
};

/** Column index by exact normalised header, then by the first word. */
function findCol(header, names, taken) {
  const free = (i) => i >= 0 && !taken.has(i);
  for (const n of names) { const i = header.findIndex((c, k) => free(k) && norm(c) === n); if (i >= 0) return i; }
  for (const n of names) { const i = header.findIndex((c, k) => free(k) && words(c)[0] === n); if (i >= 0) return i; }
  return -1;
}

const LITHS = { sandstone: 'sandstone', sand: 'sandstone', sst: 'sandstone', ss: 'sandstone', shale: 'shale', sh: 'shale', mudstone: 'shale', claystone: 'shale', limestone: 'limestone', lst: 'limestone', ls: 'limestone', chalk: 'limestone', carbonate: 'limestone', salt: 'salt', halite: 'salt', coal: 'coal', mixed: 'mixed' };
const BASE_ROW = /^(td|totaldepth|base|baseofmodel|basement)$/;

/**
 * @param {string} text
 * @returns {{ rows: Array, base: {depth?: number, age?: number}|null, units: {depth: 'm'|'ft'|null}, columns: object, problems: string[], hasDepth: boolean, hasAge: boolean }}
 *   rows in file order: {name, depth?, age?, hiatusTo?, type?, eroded?, lithology?, mix?, toc?, hi?, kerogen?}
 *   depths in the FILE's unit (units.depth says it when the header does)
 */
export function parseColumnText(text) {
  const { header, rows } = parseDelimitedText(text);
  const problems = [];
  if (!header) return { rows: [], base: null, units: { depth: null }, columns: {}, problems: ['No header row found: the column file needs named columns (name, age, depth, lithology ...).'], hasDepth: false, hasAge: false };
  const taken = new Set();
  const idx = {};
  for (const k of ['name', 'hiatus', 'eroded', 'age', 'depth', 'type', 'lithology', 'sand', 'shale', 'limestone', 'toc', 'hi', 'kerogen']) {
    const i = findCol(header, COLS[k], taken);
    idx[k] = i;
    if (i >= 0) taken.add(i);
  }
  const columns = Object.fromEntries(Object.entries(idx).filter(([, i]) => i >= 0).map(([k, i]) => [k, header[i]]));
  if (idx.name < 0) problems.push('No name column found (name, top, surface, formation).');
  const units = { depth: idx.depth >= 0 ? headerUnit(header[idx.depth], 'depth') : null, eroded: idx.eroded >= 0 ? headerUnit(header[idx.eroded], 'depth') : null };
  const out = []; let base = null;
  rows.forEach((r, k) => {
    const line = k + 2;
    const name = idx.name >= 0 ? String(r[idx.name] ?? '').trim() : '';
    if (!name) { if (r.some((c) => String(c ?? '').trim())) problems.push(`Row ${line}: no name.`); return; }
    const row = { name };
    const val = (key) => (idx[key] >= 0 ? String(r[idx[key]] ?? '').trim() : '');
    if (val('depth') !== '') { const d = num(val('depth')); if (Number.isFinite(d) && d >= 0) row.depth = d; else problems.push(`Row ${line}: depth "${val('depth')}" is not a depth.`); }
    if (val('age') !== '') { const a = num(val('age')); if (Number.isFinite(a) && a >= 0) row.age = a; else problems.push(`Row ${line}: age "${val('age')}" is not an age in Ma.`); }
    if (val('hiatus') !== '') { const h = num(val('hiatus')); if (Number.isFinite(h) && h >= 0) row.hiatusTo = h; else problems.push(`Row ${line}: hiatus "${val('hiatus')}" is not an age in Ma.`); }
    if (val('type') !== '') row.type = val('type');
    if (val('eroded') !== '') { const e = num(val('eroded')); if (Number.isFinite(e) && e >= 0) row.eroded = e; else problems.push(`Row ${line}: eroded thickness "${val('eroded')}" is not a thickness.`); }
    if (Number.isFinite(row.hiatusTo) && Number.isFinite(row.age) && !(row.hiatusTo > row.age)) { problems.push(`Row ${line}: ${name}'s hiatus ends at ${row.hiatusTo} Ma, which is not older than its age ${row.age} Ma; the hiatus is ignored.`); delete row.hiatusTo; }
    const lith = val('lithology');
    if (lith) { const l = LITHS[norm(lith)]; if (l) row.lithology = l; else problems.push(`Row ${line}: lithology "${lith}" is not one of sandstone, shale, limestone, salt, coal or mixed.`); }
    const parts = { sandstone: num(val('sand')), shale: num(val('shale')), limestone: num(val('limestone')) };
    if (Object.values(parts).some((v) => Number.isFinite(v) && v > 0)) {
      row.mix = Object.fromEntries(Object.entries(parts).map(([k2, v]) => [k2, Number.isFinite(v) && v > 0 ? v : 0]));
      const nz = Object.values(row.mix).filter((v) => v > 0).length;
      if (nz > 1) row.lithology = 'mixed';
      else if (!row.lithology) row.lithology = Object.keys(row.mix).find((k2) => row.mix[k2] > 0);
      if (row.lithology !== 'mixed') delete row.mix;
    }
    const toc = num(val('toc')); const hi = num(val('hi'));
    if (Number.isFinite(toc) && toc > 0) row.toc = toc;
    if (Number.isFinite(hi) && hi > 0) row.hi = hi;
    if (val('kerogen')) row.kerogen = kineticsKey(val('kerogen'));
    if (BASE_ROW.test(norm(name))) { base = { depth: row.depth, age: row.age }; return; }
    out.push(row);
  });
  return { rows: out, base, units, columns, problems, hasDepth: out.some((x) => Number.isFinite(x.depth)), hasAge: out.some((x) => Number.isFinite(x.age)) };
}

/** Surface names match ignoring case, spaces and punctuation. */
export const sameName = (a, b) => norm(a) === norm(b);

/** A row's depth in metres (file unit, or the unit the user picked when the header says none). */
export const rowDepthM = (d, unit) => (unit === 'ft' ? d * M_PER_FT : d);

/**
 * Dated tops for layersFromDatedTops from the column rows: md_m in metres,
 * age_ma, hiatus_to_ma, surface_type. `withDepths` are tops that already have
 * a depth (a registry well's); otherwise the rows' own depths are used.
 */
export function datedTops(rows, { fileUnit = 'm', withDepths = null } = {}) {
  if (withDepths) {
    return withDepths.map((t) => {
      const r = rows.find((x) => sameName(x.name, t.name));
      if (!r) return { ...t };
      return {
        ...t,
        ...(Number.isFinite(r.age) ? { age_ma: r.age } : {}),
        ...(Number.isFinite(r.hiatusTo) ? { hiatus_to_ma: r.hiatusTo } : {}),
        ...(r.type ? { surface_type: r.type } : {}),
      };
    });
  }
  return rows.filter((r) => Number.isFinite(r.depth)).map((r) => ({
    name: r.name, md_m: rowDepthM(r.depth, fileUnit),
    ...(Number.isFinite(r.age) ? { age_ma: r.age } : {}),
    ...(Number.isFinite(r.hiatusTo) ? { hiatus_to_ma: r.hiatusTo } : {}),
    ...(r.type ? { surface_type: r.type } : {}),
  }));
}

/**
 * Layers from dated tops with the base row closing the last layer: a pseudo
 * top at the base depth carries the base age, and the layer it would start is
 * dropped. Erosion events come back for every unconformity with a hiatus.
 */
export function layersFromColumn(tops, { baseDepthM = null, baseAge = null, idFor } = {}) {
  const withBase = Number.isFinite(baseDepthM) && Number.isFinite(baseAge)
    ? [...tops, { name: '__base__', md_m: baseDepthM, age_ma: baseAge }] : tops;
  const built = layersFromDatedTops(withBase, { baseDepth: Number.isFinite(baseDepthM) ? baseDepthM : null, idFor });
  const layers = built.layers.filter((l) => l.name !== '__base__');
  const problems = built.problems.filter((p) => !/__base__/.test(p));
  return { layers, erosionEvents: built.erosionEvents, problems };
}

/**
 * Erosion events with the amounts the rows give (metres): an event whose
 * surface has an eroded thickness in the file takes it and is no longer
 * "amount unknown".
 */
export function erosionWithAmounts(events, rows, unit = 'm') {
  return (events || []).map((e) => {
    const r = rows.find((x) => sameName(x.name, e.surface));
    if (!r || !Number.isFinite(r.eroded)) return e;
    return { ...e, amount: rowDepthM(r.eroded, unit), amountUnknown: false };
  });
}

/**
 * The lithology, mixture and source rock the rows give, onto layers of the
 * same name (the layer below each surface). Returns new layers and a count.
 */
export function applyColumnToLayers(layers, rows) {
  let lith = 0; let src = 0;
  const out = layers.map((l) => {
    const r = rows.find((x) => sameName(x.name, l.name));
    if (!r) return l;
    const next = { ...l };
    if (r.lithology) {
      next.lithology = r.lithology; lith += 1;
      if (r.lithology === 'mixed' && r.mix) next.lithologyMix = { ...r.mix };
      else delete next.lithologyMix;
      delete next.thermal; delete next.compaction; // the library of the new lithology
      next.provenance = { ...(next.provenance || {}), lithology_guessed: false, lithology_from: 'column file' };
      next.lithologyGuessed = false;
    }
    if (Number.isFinite(r.toc) || Number.isFinite(r.hi)) {
      src += 1;
      next.sourceRock = { isSource: true, toc: Number.isFinite(r.toc) ? r.toc : 2, hi: Number.isFinite(r.hi) ? r.hi : 400, kerogen: r.kerogen || l.sourceRock?.kerogen || 'type2' };
    }
    return next;
  });
  return { layers: out, lithologies: lith, sources: src };
}
