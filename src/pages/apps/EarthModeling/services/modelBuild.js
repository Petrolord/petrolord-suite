// Model build glue (Earth Modeling G8.2): a model DEFINITION (small,
// persistable jsonb — surface ids, zone table, fault polygons,
// methods) plus registry data in -> the full computed model out, via
// the oracle-validated engine. Grids are deterministic outputs and are
// recomputed on load, never blobbed (plan decision 2). Pure except for
// backend.downloadSurfaceGrid.

import { resampleStack, clampStack, zoneThickness } from '../engine/framework';
import { adjustSurfaces, defaultRadius } from '../engine/adjust';
import { computeDerivedGrid, allSurfaceRows } from './derivedSurfaces';
import { populateZonePropertyOk } from './propertyKriging';
import { labelBlocks, blockCensus, pointInPolygon, validatePolygon } from '../engine/blocks';
import { wellTies, zoneControlPoints, minCurvature, positionAtMd } from '../engine/wellties';
import { populateZoneProperty } from '../engine/properties';
import { zoneVolumes, zoneVolumesWithContacts } from '../engine/volumes';
import { normalizeTag, isTransformableTag, consensusTag } from '@/lib/crs/tags';
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';
import { maskOutsidePolygon, gridBBox, isNull, sampleAtXY } from '@/lib/gridding/gridmath';
import { zoneLogControl, DEFAULT_CUTOFFS, mdAtTvdss, extendTrajectory } from './logUpscale';
import { populateZonePropertyIdw } from './propertyIdw';
import { NULL_VALUE } from '@/lib/gridding/numeric';
import { readDepthSurface } from '@/lib/readDepthSurface';
import { readWellDatum, refElevOrNull } from '@/lib/wellDatum';
import { convert } from '@/lib/units/registry';
import { isPrePt9aZone } from '@/lib/petroProvenance';
import { boundLegByClosure } from './trapBound';
import { shmSwGrid } from './shmGrid';
import { hangingWallAtSurface } from './seismicFaultZones';
import { ntgFromNetMap, swFromHcpvMap, isMdKey } from './propertyMaps';
import { resampleTo } from '@/lib/gridding/gridmath';
import { isopach } from '@/lib/gridding/isopach';
import { GRID_DEFAULTS, FT as M_PER_FT, gridLayerFrames } from './grid3d/layering';
import { resampleSmooth, smoothFrame, dataLimitRings } from './grid3d/boundary';
import { expandFramework, DEFAULT_CAP } from './grid3d/zonesFromTops';
import { sgsZonePorosity, sgsParams, faciesLayer } from './grid3d/properties';

/** Registry property keys for the three populated properties. */
export const PROP_KEYS = { phi: 'phi_avg', sw: 'sw_avg', ntg: 'ntg' };

/**
 * A published zone's value for one model property (Ekene walk 2026-10-14).
 * NTG is net RESERVOIR over gross (net_res_tvt_m / gross_tvt_m, the rock
 * cutoffs only) when Petrophysics published those thicknesses: its `ntg`
 * key is net PAY over gross, which already holds a water saturation cutoff,
 * so a model that also cuts the column at the OWC counted the contact twice
 * (Ekene: wet wells read NTG 0 and the field 2.8 MMstb against the booked
 * 12.14). ReservoirCalc Pro reads the same net reservoir ratio (#1035).
 * Porosity and Sw stay the zone's pay averages (null in a well with no pay).
 * @returns {{v: number|null, basis: 'net reservoir'|'net pay'|null}}
 */
export function zonePropertyValue(properties, prop) {
  const p = properties || {};
  if (prop === 'ntg') {
    const g = Number.isFinite(p.gross_tvt_m) && p.gross_tvt_m > 0 ? p.gross_tvt_m : (Number.isFinite(p.gross_m) && p.gross_m > 0 ? p.gross_m : null);
    const n = Number.isFinite(p.gross_tvt_m) && p.gross_tvt_m > 0 ? p.net_res_tvt_m : p.net_res_m;
    if (g !== null && Number.isFinite(n)) return { v: Math.min(1, Math.max(0, n / g)), basis: 'net reservoir' };
    return Number.isFinite(p.ntg) ? { v: p.ntg, basis: 'net pay' } : { v: null, basis: null };
  }
  const v = p[PROP_KEYS[prop]];
  return { v: Number.isFinite(v) ? v : null, basis: null };
}

/**
 * Nodes that hold a hydrocarbon column, per block and in total (Ekene walk
 * 2026-10-14): the area ReservoirCalc Pro reports as HC Area. A node counts
 * when its zone interval reaches above the deepest hydrocarbon contact at
 * that node (the zone base when no OWC applies). The OWC is the engine's
 * shape: a number, {[block]: depth} or one value per node.
 */
export function hcCellCounts(top, base, labels, fluids = {}) {
  const perNode = (c) => c !== null && typeof c === 'object' && (Array.isArray(c) || ArrayBuffer.isView(c));
  const at = (c, lab, j) => {
    if (c === null || c === undefined) return null;
    if (typeof c === 'number') return Number.isFinite(c) ? c : null;
    const v = perNode(c) ? c[j] : (Object.prototype.hasOwnProperty.call(c, lab) ? c[lab] : null);
    return Number.isFinite(v) ? v : null;
  };
  const out = { total: 0 };
  for (let j = 0; j < top.length; j++) {
    const zt = top[j]; const zb = base[j];
    if (isNull(zt) || isNull(zb)) continue;
    const lab = String(labels ? labels[j] : 0);
    const w = at(fluids?.owc ?? null, lab, j);
    const bottom = w === null ? zb : Math.min(zb, w);
    if (bottom - zt > 0) { out[lab] = (out[lab] || 0) + 1; out.total += 1; }
  }
  return out;
}

export const DEFAULT_KRIGE = { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025, fit: true, detrend: true };
export const POPULATION_METHODS = Object.freeze([
  { key: 'constant', label: 'constant (weighted mean)' },
  { key: 'trend', label: 'trend (LSQ plane)' },
  { key: 'okrige', label: 'ordinary kriging (fitted variogram)' },
  // 3D grid upgrade (owner decision 4): porosity by sequential Gaussian simulation
  { key: 'sgs', label: 'sequential Gaussian simulation (seeded)', only: 'phi' },
  // Ekene walk: inverse distance for few wells, and a typed (booked) value
  { key: 'idw', label: 'inverse distance (power 2)' },
  { key: 'typed', label: 'typed value (the same everywhere)' },
  { key: 'krige', label: 'simple kriging (typed variogram, legacy)' },
  // U2-002: Sw only
  { key: 'shm', label: 'saturation-height (SCAL Studio), Sw only', only: 'sw' },
  // U2-008: Petrophysics maps per zone (net pay for NTG, HCPV for Sw)
  { key: 'map', label: 'Petrophysics map per zone (net pay, HCPV)', only: ['ntg', 'sw'] },
]);

/** A fresh, empty model definition. */
export const emptyDefinition = () => ({
  name: 'New model',
  surfaceIds: [],
  topNames: [],
  zones: [],
  faultPolygons: [],
  methods: { phi: 'constant', sw: 'constant', ntg: 'constant' },
  krige: { ...DEFAULT_KRIGE },
  // EM0: the model frame; cellM empty = the top surface's cell, boundaryId
  // = a geo_culture boundary polygon the model is clipped to
  frame: { cellM: '', boundaryId: '' },
  // EM1: well adjustment; radiusM empty = three times the median tie spacing
  adjust: { enabled: false, radiusM: '' },
  // EM2: derived horizons (parallel-to, proportional) that can join the stack
  derived: [],
  // T1 (EM-T1-001): per zone {goc, owc} in metres below datum (positive
  // down) and {bo, bg} formation volume factors; null = not given
  fluids: [],
  // Ekene walk (2026-10-14): where the property control comes from
  // ('zones' = the published zone averages, 'logs' = the wells' curves
  // upscaled to each layer), the net reservoir cutoffs for the logs, and the
  // IDW power. Layers and typed values live on each zone ({layers, typed}).
  control: 'zones',
  cutoffs: { vsh: '', phi: '' },
  idw: { power: 2 },
  // 3D grid upgrade (2026-10-17): the fine grid (layer thickness in feet and
  // the layering style; off keeps the layer-cake of earlier releases), the cap
  // slab above the top surface, and the SGS variogram and seed. A zone's
  // splitTops cut it at well tops ({splitTops: ['Ekene Sand Middle', ...]}).
  grid: { enabled: false, layerFt: GRID_DEFAULTS.layerFt, style: GRID_DEFAULTS.style },
  cap: { ...DEFAULT_CAP },
  sgs: { seed: '2026', rangeM: '', rangeVFt: '10', nugget: '0.1', model: 'spherical' },
});

/**
 * A new model in the workstation (owner decisions 1 and 2, 2026-10-17): the
 * fine grid on, 25 m cells with the smooth edge, 2.5 ft proportional layers,
 * porosity by SGS. emptyDefinition stays the earlier layer-cake so saved
 * rows, the engine goldens and the dev harness keep their numbers.
 */
export const newModelDefinition = () => {
  const e = emptyDefinition();
  return {
    ...e,
    frame: { ...e.frame, cellM: String(GRID_DEFAULTS.cellM), edge: 'smooth' },
    grid: { ...e.grid, enabled: true },
    methods: { ...e.methods, phi: 'sgs' },
  };
};

/**
 * A saved definition from any earlier release in today's shape (U1,
 * EM-U1-010, PL5). G8 rows (2026-07) have no frame, adjust, derived or
 * fluids; EM0 to EM6 rows no fluids; T1 rows type both contacts in one
 * `unit`. Missing keys take today's defaults, fault polygon vertices given
 * as {x, y} become [x, y], and the per-zone arrays are padded. Idempotent;
 * the stored row is not rewritten until the user saves.
 */
export function upgradeDefinition(def) {
  const e = emptyDefinition();
  const d = def && typeof def === 'object' ? def : {};
  const ids = Array.isArray(d.surfaceIds) ? d.surfaceIds.filter((x) => typeof x === 'string') : [];
  const vert = (v) => (Array.isArray(v) ? [Number(v[0]), Number(v[1])] : [Number(v?.x), Number(v?.y)]);
  return {
    ...e,
    ...d,
    name: typeof d.name === 'string' && d.name.trim() ? d.name : e.name,
    surfaceIds: ids,
    topNames: ids.map((_, i) => (Array.isArray(d.topNames) && typeof d.topNames[i] === 'string' ? d.topNames[i] : '')),
    zones: Array.isArray(d.zones) ? d.zones.filter(Boolean).map((z, i) => ({
      name: z.name || `Zone ${i + 1}`, registryZone: z.registryZone || '', ...(z.maps ? { maps: z.maps } : {}),
      ...(z.layers ? { layers: z.layers } : {}), ...(z.typed ? { typed: z.typed } : {}),
      ...(Array.isArray(z.splitTops) ? { splitTops: z.splitTops.filter((t) => typeof t === 'string' && t) } : {}),
    })) : [],
    faultPolygons: Array.isArray(d.faultPolygons) ? d.faultPolygons.filter((p) => Array.isArray(p?.vertices)).map((p, i) => ({ ...p, name: p.name || `Fault ${i + 1}`, vertices: p.vertices.map(vert) })) : [],
    methods: { ...e.methods, ...(d.methods || {}) },
    krige: { ...e.krige, ...(d.krige || {}) },
    frame: { ...e.frame, ...(d.frame || {}) },
    adjust: { ...e.adjust, ...(d.adjust || {}) },
    derived: Array.isArray(d.derived) ? d.derived : [],
    fluids: Array.isArray(d.fluids) ? d.fluids : [],
    control: d.control === 'logs' ? 'logs' : 'zones',
    cutoffs: { ...e.cutoffs, ...(d.cutoffs || {}) },
    idw: { ...e.idw, ...(d.idw || {}) },
    grid: { ...e.grid, ...(d.grid || {}) },
    cap: { ...e.cap, ...(d.cap || {}) },
    sgs: { ...e.sgs, ...(d.sgs || {}) },
  };
}

/** Gas FVF units the dock offers (Suite unit family fvfGas); rm3/sm3 = rcf/scf. */
export const BG_UNITS = Object.freeze(['m3/m3', 'rcf/scf', 'RB/Mscf']);

/**
 * The dock's typed fluids (text, each contact in the unit it was typed in)
 * as engine fluids: contacts in metres positive down, FVFs as numbers in
 * reservoir volume per surface volume. Throws a plain message on a value
 * that is not a number or an FVF <= 0.
 *
 * U1 (EM-U1-006, -007): each contact carries its own unit (`gocUnit`,
 * `owcUnit`; older rows share `unit`), so switching the display unit
 * between the two entries no longer reinterprets the first. A negative
 * contact is an elevation (the Mapping sign) and is read as depth below
 * the datum, with a note. Bg is converted from its unit (`bgUnit`,
 * default m3/m3): 0.8 RB/Mscf is 0.0045 rm3/sm3. Bg with no Bo and no GOC
 * makes a gas zone: gas from the zone top down to the contact.
 */
export function parseFluidsInput(inputs = []) {
  const FT = 0.3048;
  return (inputs || []).map((f, i) => {
    if (!f) return null;
    const notes = [];
    const num = (v, what) => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const x = Number(v);
      if (!Number.isFinite(x)) throw new Error(`Zone ${i + 1}: ${what} must be a number.`);
      return x;
    };
    const depth = (v, unit, what) => {
      const x = num(v, what);
      if (x === null) return null;
      const m = (unit || f.unit) === 'ft' ? x * FT : x;
      if (m < 0) {
        notes.push(`Zone ${i + 1}: ${what} ${x} ${unit || f.unit || 'm'} is negative, so it was read as an elevation: ${(-x)} ${unit || f.unit || 'm'} below the datum.`);
        return -m;
      }
      return m;
    };
    const bgRaw = num(f.bg, 'Bg');
    const bgUnit = f.bgUnit || 'm3/m3';
    if (!BG_UNITS.includes(bgUnit)) throw new Error(`Zone ${i + 1}: Bg unit "${bgUnit}" is not one of ${BG_UNITS.join(', ')}.`);
    const out = {
      goc: depth(f.goc, f.gocUnit, 'the GOC'),
      owc: depth(f.owc, f.owcUnit, 'the OWC'),
      bo: num(f.bo, 'Bo'),
      bg: bgRaw === null ? null : convert('fvfGas', bgRaw, bgUnit, 'm3/m3'),
    };
    if (out.bo !== null && !(out.bo > 0)) throw new Error(`Zone ${i + 1}: Bo must be greater than zero.`);
    if (out.bg !== null && !(out.bg > 0)) throw new Error(`Zone ${i + 1}: Bg must be greater than zero.`);
    if (out.goc !== null && out.owc !== null && out.goc > out.owc) throw new Error(`Zone ${i + 1}: the GOC is deeper than the OWC.`);
    // U2-005: contacts per fault block override the zone's (block 0 is
    // outside every fault polygon); each keeps the unit it was typed in
    const blocks = {};
    for (const [lab, b] of Object.entries(f.blocks || {})) {
      if (!b) continue;
      const bg = depth(b.goc, b.gocUnit, `the GOC of block ${lab}`);
      const bw = depth(b.owc, b.owcUnit, `the OWC of block ${lab}`);
      if (bg === null && bw === null) continue;
      const eg = bg ?? out.goc; const ew = bw ?? out.owc;
      if (eg !== null && ew !== null && eg > ew) throw new Error(`Zone ${i + 1}, block ${lab}: the GOC is deeper than the OWC.`);
      blocks[lab] = { goc: bg, owc: bw };
    }
    if (Object.keys(blocks).length) out.blocks = blocks;
    // U2-006: bound the leg by the closure and spill of the zone top
    if (f.trap === 'closure') out.trap = 'closure';
    if (out.bg !== null && out.bo === null && out.goc === null && !Object.values(blocks).some((b) => b.goc !== null)) {
      out.gasZone = true;
      notes.push(`Zone ${i + 1}: Bg with no Bo and no GOC, so the zone is gas from its top down to ${out.owc === null ? 'its base' : 'the contact'}.`);
    }
    if (notes.length) out.notes = notes;
    return out;
  });
}

/**
 * The contact of one kind ('goc' or 'owc') at every node (U2-005, U2-006):
 * the block's own contact when one was typed, else the zone's; NaN where
 * none applies (the engine's "no contact given"). Null when the zone has
 * no contact of that kind anywhere.
 */
export function contactGrid(f, kind, labels, n) {
  if (!f) return null;
  const zoneV = Number.isFinite(f[kind]) ? f[kind] : null;
  const byBlock = {};
  for (const [lab, b] of Object.entries(f.blocks || {})) if (Number.isFinite(b?.[kind])) byBlock[lab] = b[kind];
  if (zoneV === null && !Object.keys(byBlock).length) return null;
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const lab = String(labels ? labels[j] : 0);
    out[j] = lab in byBlock ? byBlock[lab] : (zoneV ?? NaN);
  }
  return out;
}

/** The contact of one kind in a block (the block's own, else the zone's), or null. */
export const blockContact = (f, kind, lab) => {
  const b = f?.blocks?.[String(lab)]?.[kind];
  if (Number.isFinite(b)) return b;
  return Number.isFinite(f?.[kind]) ? f[kind] : null;
};

/**
 * Engine fluids for a zone: a gas zone puts the GOC at the contact (or
 * deeper than any node). With contacts per block (U2-005) the contacts go
 * to the engine per node, so a block with none typed falls back to the zone's.
 */
export function engineFluids(f, labels = null, n = 0) {
  if (!f) return f;
  const { notes, gasZone, blocks, ...rest } = f;
  if (blocks && n > 0) {
    const owc = contactGrid(f, 'owc', labels, n);
    const goc = gasZone
      ? (owc ? Float64Array.from(owc, (v) => (Number.isFinite(v) ? v : 1e12)) : 1e12)
      : contactGrid(f, 'goc', labels, n);
    return { ...rest, goc, owc };
  }
  if (gasZone) return { ...rest, goc: rest.owc === null ? 1e12 : rest.owc };
  return rest;
}

/** Thrown when a build is cancelled (U2-004). */
export class BuildCancelled extends Error {
  constructor() { super('Build cancelled.'); this.name = 'BuildCancelled'; this.cancelled = true; }
}

/** A mis-tie beyond this (metres) is reported after a build (T1 EM-T1-003). */
export const MISTIE_WARN_M = 10;

/** True when a zone's fluids carry any contact or FVF. */
export const hasFluids = (f) => !!f && (['goc', 'owc', 'bo', 'bg'].some((k) => Number.isFinite(f[k]) || ArrayBuffer.isView(f[k]) || Array.isArray(f[k])) || Object.keys(f.blocks || {}).length > 0);

/**
 * HCPV and in-place volumes at a low and a high property case (T1 E1): the
 * kriged properties shifted by 1.2816 standard deviations, porosity and NTG
 * down and Sw up for P90, the reverse for P10, every node moving together
 * (a fully correlated property case). Null when no property was kriged.
 */
/**
 * The zone's property grids shifted by z kriging standard deviations each
 * (every node moving together), held to 0..1. `zs` is {phi, sw, ntg}; a
 * property without a variance grid is returned unshifted, and so is a node
 * with no variance (a block that fell back to a trend or a constant).
 */
export function shiftProps(zone, zs = {}) {
  const vars = zone.variance || {};
  const out = {};
  for (const k of ['phi', 'sw', 'ntg']) {
    const g = zone.props[k];
    if (!g) continue;
    const v = vars[k];
    const z = Number(zs[k]) || 0;
    if (!v || z === 0) { out[k] = g; continue; }
    out[k] = Float64Array.from(g, (x, i) => {
      // a block that fell back from kriging carries no variance (the grid's
      // null marker): shifting by its square root sent every node to 0 or 1
      // (Ekene: STOIIP P90 0 against P50 4.9 MMstb)
      if (!Number.isFinite(v[i]) || v[i] < 0 || isNull(v[i]) || v[i] > 1 || Math.abs(x) >= 1e29) return x;
      return Math.min(1, Math.max(0, x + z * Math.sqrt(v[i])));
    });
  }
  return out;
}

export function volumeRange(spec, zone, labels, fluids, top, base, useContacts = hasFluids(fluids)) {
  const frames = zoneLayerFrames(zone, top, base);
  if (!frames.some((L) => ['phi', 'sw', 'ntg'].some((k) => L.variance?.[k]))) return null;
  if (!zone.volumes?.total) return null;
  const K = 1.2815515655446004;
  const vol = (sgn) => layeredVolumes(spec, zone, labels, fluids, top, base, { useContacts, zs: { phi: sgn * K, sw: -sgn * K, ntg: sgn * K } }).total;
  const low = vol(-1);
  const high = vol(1);
  const mid = zone.volumes.total;
  const pick = (b) => ({ hcpv_m3: b.hcpv_m3, stoiip_m3: b.stoiip_m3 ?? null, giip_m3: b.giip_m3 ?? null });
  return { p90: pick(low), p50: pick(mid), p10: pick(high) };
}

/** Proportional layers a zone is cut into (1 to 50; 1 = the zone itself). */
export const MAX_LAYERS = 50;
export const zoneLayerCount = (zdef) => Math.max(1, Math.min(MAX_LAYERS, Math.floor(Number(zdef?.layers) || 1)));

/**
 * The zone cut into n proportional layers (Ekene walk 2026-10-14): layer k
 * spans the fraction k/n to (k+1)/n of the zone between its top and base at
 * every node, so the layers thin and thicken with the zone. A null node is
 * null in every layer.
 * @returns {Array<{top, base, thickness, index, count}>}
 */
export function proportionalLayers(top, base, n = 1) {
  if (n <= 1) {
    return [{ top, base, thickness: zoneThickness(top, base), index: 0, count: 1 }];
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = new Float64Array(top.length); const b = new Float64Array(top.length);
    for (let j = 0; j < top.length; j++) {
      if (isNull(top[j]) || isNull(base[j])) { t[j] = NULL_VALUE; b[j] = NULL_VALUE; continue; }
      const h = base[j] - top[j];
      t[j] = top[j] + (h * k) / n;
      b[j] = k === n - 1 ? base[j] : top[j] + (h * (k + 1)) / n;
    }
    out.push({ top: t, base: b, thickness: zoneThickness(t, b), index: k, count: n });
  }
  return out;
}

/** Net reservoir cutoffs typed in the dock, as numbers (blank keeps the default). */
export function cutoffsOf(c = {}) {
  const out = {};
  for (const k of ['vsh', 'phi']) {
    const v = c?.[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0 || x > 1) throw new Error(`The ${k === 'vsh' ? 'Vsh' : 'porosity'} cutoff must be a fraction between 0 and 1.`);
    out[k] = x;
  }
  return out;
}

/** A property typed by the user for the whole zone (the booked value), every block the same. */
export function typedGrid(spec, labels, value, prop, zoneName) {
  const v = value === undefined || value === null || String(value).trim() === '' ? NaN : Number(value);
  const what = prop === 'phi' ? 'porosity' : prop === 'sw' ? 'Sw' : prop === 'ntg' ? 'NTG' : prop;
  if (!Number.isFinite(v)) throw new Error(`${zoneName}: type a value for ${what} in the dock, or pick another method.`);
  if (v < 0 || v > 1) throw new Error(`${zoneName}: the typed ${what} must be a fraction between 0 and 1.`);
  const z = new Float64Array(spec.nx * spec.ny).fill(v);
  const blocks = labels ? [...new Set(labels)].sort((a, b) => a - b) : [0];
  return { z, provenance: blocks.map((block) => ({ block, methodUsed: 'typed', wells: 0, fellBack: false, note: `${v}` })) };
}

/**
 * The zone's properties seen as one (for the map, the prospect and the
 * exports of a layered zone): NTG the mean of the layers (proportional
 * layers share the thickness), porosity weighted by NTG, Sw by NTG x
 * porosity, so the zone's pore and hydrocarbon pore volumes without
 * contacts equal the sum of its layers.
 */
export function aggregateLayerProps(layers) {
  const n = layers[0].props.phi?.length || layers[0].top.length;
  const out = {};
  const has = (k) => layers.every((L) => L.props[k]);
  if (has('ntg')) out.ntg = new Float64Array(n);
  if (has('phi')) out.phi = new Float64Array(n);
  if (has('sw')) out.sw = new Float64Array(n);
  if (has('perm')) out.perm = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let sN = 0; let sNP = 0; let sNPW = 0; let sLk = 0; let c = 0; let dead = false;
    for (const L of layers) {
      const t = L.thickness[j];
      const ntg = L.props.ntg ? L.props.ntg[j] : 1; const phi = L.props.phi ? L.props.phi[j] : 0; const sw = L.props.sw ? L.props.sw[j] : 0;
      if (isNull(t) || [ntg, phi, sw].some((v) => isNull(v) || !Number.isFinite(v))) { dead = true; break; }
      sN += ntg; sNP += ntg * phi; sNPW += ntg * phi * sw; c += 1;
      if (L.props.perm && Number.isFinite(L.props.perm[j]) && !isNull(L.props.perm[j]) && L.props.perm[j] > 0) sLk += Math.log(L.props.perm[j]);
    }
    if (dead || !c) { for (const g of Object.values(out)) g[j] = NULL_VALUE; continue; }
    if (out.ntg) out.ntg[j] = sN / c;
    if (out.phi) out.phi[j] = sN > 0 ? sNP / sN : 0;
    if (out.sw) out.sw[j] = sNP > 0 ? sNPW / sNP : 1;
    if (out.perm) out.perm[j] = Math.exp(sLk / c);
  }
  return out;
}

/** Each property's provenance rows of every layer, tagged with the layer (1-based). */
export function mergeLayerProvenance(layers) {
  const out = {};
  layers.forEach((L, k) => {
    for (const [prop, rows] of Object.entries(L.provenance)) {
      (out[prop] = out[prop] || []).push(...rows.map((r) => ({ ...r, layer: k + 1 })));
    }
  });
  return out;
}

/** The zone's cell layers: its proportional layers, or the zone itself. */
export const zoneLayerFrames = (zone, top, base) => (zone.layers?.length
  ? zone.layers
  : [{ top, base, thickness: zone.thickness, props: zone.props, variance: zone.variance || {} }]);

function mergeVolumes(sum, v, first) {
  for (const [blk, b] of Object.entries(v)) {
    const s = sum[blk] || (sum[blk] = {});
    for (const [key, x] of Object.entries(b)) {
      if (key === 'cells') { if (first || s.cells === undefined) s.cells = x; continue; }
      if (x === null) { if (!(key in s)) s[key] = null; continue; }
      s[key] = (s[key] || 0) + x;
    }
  }
}

/**
 * Zone volumes summed over its layers (each with its own properties), with
 * or without contacts; `zs` shifts the kriged properties of every layer by
 * that many kriging standard deviations (the range and the distribution).
 */
export function layeredVolumes(spec, zone, labels, fluids, top, base, { zs = null, useContacts = hasFluids(fluids) } = {}) {
  const frames = zoneLayerFrames(zone, top, base);
  const sum = {};
  frames.forEach((L, k) => {
    const props = zs && Object.values(zs).some((z) => Number(z) !== 0) ? shiftProps(L, zs) : L.props;
    const v = useContacts
      ? zoneVolumesWithContacts(spec, L.top, L.base, labels, props, fluids || {})
      : zoneVolumes(spec, L.thickness, labels, props);
    mergeVolumes(sum, v, k === 0);
  });
  return sum;
}

/**
 * The model against its control (Ekene walk): at each control point of each
 * layer, the control value beside the model's value at that point. Kriging
 * and IDW honour the wells, so the difference is zero there; a constant or
 * a trend leaves a misfit the table shows.
 */
export function wellMatchRows(spec, layers, pointsFor) {
  const rows = [];
  layers.forEach((L, k) => {
    for (const prop of ['phi', 'sw', 'ntg', 'perm']) {
      const g = L.props[prop];
      if (!g) continue;
      for (const p of pointsFor(prop, k) || []) {
        const raw = sampleAtXY(g, spec, p.x, p.y);
        const model = isNull(raw) || !Number.isFinite(raw) ? null : raw;
        const control = prop === 'perm' ? 10 ** p.v : p.v;
        rows.push({ well: p.well || '', layer: k + 1, prop, control, model, diff: model === null ? null : model - control });
      }
    }
  });
  return rows;
}

/**
 * The model frame from the top surface's frame and an optional cell
 * size (EM0): same origin and extent, nodes recounted for the new cell
 * (at least 2 x 2, at most four million nodes). The cell is in the
 * spec's own units; buildModel passes a metre spec and a metre cell.
 */
export function frameSpec(topSpec, cellM) {
  const cell = Number(cellM);
  if (!(cell > 0)) return { ...topSpec };
  const extX = (topSpec.nx - 1) * topSpec.dx;
  const extY = (topSpec.ny - 1) * topSpec.dy;
  const nx = Math.max(2, Math.floor(extX / cell) + 1);
  const ny = Math.max(2, Math.floor(extY / cell) + 1);
  if (nx * ny > 4_000_000) throw new Error('That cell size makes more than four million nodes. Use a larger cell.');
  return { ...topSpec, dx: cell, dy: cell, nx, ny };
}

/**
 * The model frame (U1, EM-U1-004): the top surface's frame at its cell or
 * the typed one. A rotated top (Petrel and Irap lattices) gives its
 * axis-aligned extent at the smaller of its two cells, because property
 * population, fault blocks and the painters work on an unrotated lattice;
 * the stack is resampled onto it honouring the rotation.
 */
export function modelFrame(topSpec, cell) {
  let base = topSpec;
  if (Number.isFinite(topSpec.rotation_deg) && topSpec.rotation_deg !== 0) {
    const bb = gridBBox(topSpec);
    const c = Math.min(Math.abs(topSpec.dx), Math.abs(topSpec.dy));
    base = { x0: bb.xmin, y0: bb.ymin, dx: c, dy: c, nx: Math.ceil((bb.xmax - bb.xmin) / c - 1e-9) + 1, ny: Math.ceil((bb.ymax - bb.ymin) / c - 1e-9) + 1 };
    if (base.nx * base.ny > 4_000_000) throw new Error('The rotated top surface spans more than four million unrotated nodes. Type a larger model cell.');
  }
  const { rotation_deg: _r, ...plain } = frameSpec(base, cell);
  return plain;
}

export const specOf = (s) => ({ x0: s.origin_x, y0: s.origin_y, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny, ...(s.rotation_deg ? { rotation_deg: s.rotation_deg } : {}) });

/** A spec with every horizontal length multiplied by k (native units to metres and back). */
export const scaleSpec = (spec, k) => (k === 1 ? { ...spec } : { ...spec, x0: spec.x0 * k, y0: spec.y0 * k, dx: spec.dx * k, dy: spec.dy * k });

/**
 * Engine well shape from a registry row (with tops + zones embedded). `k`
 * is metres per unit of the model frame: the engine works in metres (the
 * survey offsets are metres), so a feet wellhead is scaled (EM-U1-001).
 */
export const engineWell = (w, k = 1) => ({
  name: w.name,
  x: w.surface_x * k,
  y: w.surface_y * k,
  // the reference elevation through the shared datum module; a well with
  // none never reaches the engine (buildModel leaves it out and says so)
  kb_m: refElevOrNull(w) ?? 0,
  deviation: w.deviation || [],
  tops: w.tops || [],
  zones: w.zones || [],
});

/** Clamp a populated fraction grid (phi, Sw, NTG) to 0..1; returns the count clamped (EM-U1-005). */
export function clampFractionGrid(z) {
  let n = 0;
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    if (isNull(v)) continue;
    if (v < 0) { z[i] = 0; n += 1; } else if (v > 1) { z[i] = 1; n += 1; }
  }
  return n;
}

/**
 * Does the hydrocarbon leg reach the edge of the model (EM-U1-008)? True
 * when a live edge node of the zone top (frame edge, or a node beside a
 * null) is shallower than the deepest hydrocarbon contact, so the
 * accumulation is not closed inside the frame and its volume depends on
 * where the frame stops. Null when there is no contact (the no-OWC
 * warning covers that case).
 */
export function contactEdgeReport(spec, top, fluids, labels = null) {
  // U2-005: the contact of each node's own block
  const grid = contactGrid(fluids, 'owc', labels, top.length);
  if (!grid) return { open: null, nodes: 0 };
  const { nx, ny } = spec;
  let nodes = 0;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const j = r * nx + c;
      const v = top[j];
      const contact = grid[j];
      if (isNull(v) || !Number.isFinite(contact) || v >= contact) continue;
      const edge = r === 0 || c === 0 || r === ny - 1 || c === nx - 1
        || isNull(top[j - 1]) || isNull(top[j + 1]) || isNull(top[j - nx]) || isNull(top[j + nx]);
      if (edge) nodes += 1;
    }
  }
  return { open: nodes > 0, nodes };
}

/** Throw the door's reason in the words of the stack. */
function readOrThrow(row, grid, opts, role) {
  const r = readDepthSurface(row, grid, opts);
  if (!r.ok) throw new Error(`${r.reason}${role ? ` (${role})` : ''}`);
  return r;
}

/**
 * The layer the ribbon's Publish sends to geo_surfaces (U1, EM-U1-003):
 * the model's native frame with its CRS and XY unit, structure layers as
 * elevation in metres, thickness as a metre isochore, properties as
 * fraction attributes, variances as attributes.
 */
export function publishPayload(built, { layer, grid, modelName, zoneName, methods }) {
  const kind = layer === 'thickness' ? 'isochore'
    : (layer === 'top' || layer === 'base') ? 'structure' : 'attribute';
  const isVar = layer.endsWith('_var');
  // U2-017: the isopach leaves as a length attribute, named so no reader takes it for an isochore
  const isIso = layer === 'isopach';
  const name = `${modelName} · ${zoneName} ${isIso ? 'isopach (true stratigraphic thickness, m)' : isVar ? `${layer.slice(0, -4)} variance` : layer}`;
  return {
    name,
    kind,
    spec: built.spec,
    crs: built.crs || null,
    xyUnit: built.xyUnit || null,
    zDomain: kind === 'attribute' ? 'attribute' : 'depth',
    zUnit: kind === 'attribute' ? (isIso ? 'm' : isVar ? 'fraction^2' : 'fraction') : 'm',
    provenance: {
      engine: 'earth-modeling',
      model: modelName,
      zone: zoneName,
      layer,
      methods,
      ...(kind === 'structure' ? { depth_ref: 'tvdss' } : {}),
    },
    // structure layers leave as registry elevation (negative below
    // datum, metres); thickness and attributes are raw
    grid: kind === 'structure' ? depthDownToSurfaceZ(grid) : Float32Array.from(grid),
  };
}

/**
 * Build the model. Throws with a specific message on an unbuildable
 * definition; per-block population shortfalls degrade through the
 * engine's explicit fallback ladder instead (recorded in provenance).
 *
 * U1 (EM-U1-001, -002): every registry grid enters through the shared
 * door (`readDepthSurface`): only depth structures stack, an isochore is
 * read in metres, and the XY frame is known. The engine runs on a METRE
 * frame (wells, polygons, boundary, cell, radius and variogram range all
 * in metres); `spec` is the same lattice in the surfaces' own units for
 * the map, the section and publishing, `specM` the metre frame and
 * `xyToM` the factor between them.
 * @returns {{spec, specM, xyToM, xyUnit, clamped, counts, thickness, labels, census, ties, zones, notes}}
 */
export async function buildModel(definition, wells, surfaces, backend, { onProgress = null, signal = null } = {}) {
  // U2-004: progress in steps (surfaces read, framework, each zone's three
  // properties and its volumes), and a cancel checked between steps
  const nZones = Math.max(0, (definition.surfaceIds || []).length - 1);
  let totalSteps = (definition.surfaceIds || []).length + 1 + nZones * 4;
  let step = 0;
  const progress = (label) => {
    if (signal?.aborted) throw new BuildCancelled();
    step += 1;
    if (onProgress) onProgress({ label, step: Math.min(step, totalSteps), total: totalSteps, fraction: Math.min(1, step / totalSteps) });
  };
  // a long step (the simulation of a 1 M cell zone) reports its own fraction
  const subProgress = (label, f) => {
    if (onProgress) onProgress({ label, step: Math.min(step, totalSteps), total: totalSteps, fraction: Math.min(1, (step + Math.max(0, Math.min(1, f))) / totalSteps) });
  };
  // registry rows plus the definition's derived horizons (EM2)
  const rows = allSurfaceRows(surfaces, definition);
  const stack = definition.surfaceIds.map((id) => {
    const s = rows.find((x) => x.id === id);
    if (!s) throw new Error('A stacked surface is no longer in the registry. Remove it from the stack.');
    return s;
  });
  if (stack.length < 2) throw new Error('A framework needs at least 2 surfaces (top and base).');
  (definition.faultPolygons || []).forEach((p) => validatePolygon(p.vertices));

  // CRS guard (Phase 5): two surfaces in DIFFERENT known systems must
  // not be stacked by raw index math. Unknown tags pass (legacy data;
  // the model's own tag then stays unverified).
  const known = [...new Set(stack.map((s) => normalizeTag(s.crs))
    .filter((t) => isTransformableTag(t)))];
  if (known.length > 1) {
    throw new Error(`The stacked surfaces are in different coordinate systems (${known.join(' vs ')}). Convert them to one CRS before building.`);
  }
  const crs = consensusTag(stack.map((s) => s.crs));

  // the shared door: depth structures positive down in metres, isochores
  // in metres; the XY factor of every registry row read is recorded
  const notes = [];
  const reads = new Map();
  const readRow = async (s, accept, role) => {
    const key = `${s.id}|${accept.join()}`;
    if (reads.has(key)) return reads.get(key);
    const g = await backend.downloadSurfaceGrid(s);
    const r = readOrThrow(s, g, { accept, as: 'depth' }, role);
    for (const n of r.notes) if (!notes.includes(n)) notes.push(n);
    reads.set(key, r);
    return r;
  };
  const loadDepthDown = async (s) => (await readRow(s, ['elevation'], 'a surface in the model stack')).grid;
  const loadIsochore = async (s) => (await readRow(s, ['isochore'], 'the thickness of a derived horizon')).grid;
  const grids = await Promise.all(stack.map(async (s) => {
    const g = await (s.derived
      ? computeDerivedGrid(s.provenance.derived, rows, loadDepthDown, loadIsochore)
      : loadDepthDown(s));
    progress(`Read ${s.name}`);
    return g;
  }));

  // one XY unit for the whole stack: the registry rows read (derived rows
  // take their sources' frame)
  const factors = [];
  for (const r of reads.values()) factors.push({ k: r.xyToM, unit: r.xyUnit || 'm' });
  const k = factors.length ? factors[0].k : 1;
  const xyUnit = factors.length ? factors[0].unit : 'm';
  const odd = factors.find((f) => Math.abs(f.k - k) > 1e-12);
  if (odd) {
    throw new Error(`The stacked surfaces are in different XY units (${xyUnit} and ${odd.unit}). Reproject them to one CRS before building.`);
  }

  // the model frame: the TOP surface's frame at its cell or the one the
  // definition asks for (EM0), in metres for the engine
  const specOfRow = (s) => scaleSpec(specOf(s), k);
  // 3D grid upgrade: the smooth edge traces the data limit halfway past the
  // last live node, on a frame grown by half the top surface's cell (a
  // rotated lattice keeps the node edge)
  const smooth = definition.frame?.edge === 'smooth' && !stack.some((s) => s.rotation_deg);
  if (definition.frame?.edge === 'smooth' && !smooth) notes.push('A stacked surface is rotated, so the model keeps the node edge (the smooth edge needs an unrotated lattice).');
  const specM = smooth ? smoothFrame(specOfRow(stack[0]), definition.frame?.cellM) : modelFrame(specOfRow(stack[0]), definition.frame?.cellM);
  const spec = scaleSpec(specM, 1 / k);
  if (stack[0].rotation_deg) notes.push(`The top surface is rotated ${stack[0].rotation_deg} degrees; the model frame is its unrotated extent.`);

  // wells: a well in another known CRS cannot be placed on this frame
  const modelTag = crs ? normalizeTag(crs) : null;
  const skipped = [];
  const noDatum = [];
  const placed = [];
  for (const w of wells || []) {
    const t = normalizeTag(w.crs);
    if (modelTag && isTransformableTag(t) && t !== modelTag) skipped.push(`${w.name} (${t})`);
    // no reference elevation: its tops have no subsea depth to tie the surfaces to
    else if (!readWellDatum(w).tvdssOk) noDatum.push(w.name);
    else placed.push(w);
  }
  if (noDatum.length) notes.push(`${noDatum.length} well${noDatum.length === 1 ? ' has' : 's have'} no depth reference elevation, so ${noDatum.length === 1 ? 'its' : 'their'} tops have no subsea depth and ${noDatum.length === 1 ? 'it was' : 'they were'} left out of ties and properties: ${noDatum.join(', ')}. Set the depth reference in Well Data Manager (Header tab).`);
  if (skipped.length) notes.push(`${skipped.length} well${skipped.length === 1 ? ' is' : 's are'} in another CRS than the model (${modelTag}) and ${skipped.length === 1 ? 'was' : 'were'} left out of ties and properties: ${skipped.join(', ')}. Reproject them in Well Data Manager.`);
  const eWells = placed.map((w) => engineWell(w, k));
  const surfIndexByTop = {};
  (definition.topNames || []).forEach((topName, i) => {
    if (topName) surfIndexByTop[topName] = i;
  });

  // resample, then (EM1) adjust each tied surface through its tie
  // residuals, then clamp: the adjustment is a geometric correction of
  // the input surfaces, the clamp stays the stacking rule
  // a derived row carries its source's frame (allSurfaceRows)
  let resampled = smooth
    ? grids.map((z, i) => resampleSmooth(z, specOfRow(stack[i]), specM))
    : resampleStack(grids.map((z, i) => ({ z, spec: specOfRow(stack[i]) })), specM);
  // the data limit of the top surface, for the map, section and 3D outline (native units)
  const outline = dataLimitRings(grids[0], specOfRow(stack[0])).map((ring) => ring.map(([x, y]) => [x / k, y / k]));
  let adjustment = null;
  if (definition.adjust?.enabled) {
    const tiesBefore = wellTies(eWells, resampled, specM, surfIndexByTop)
      .map((t) => ({ ...t, surfaceIndex: surfIndexByTop[t.top] }));
    const radius = Number(definition.adjust.radiusM) > 0 ? Number(definition.adjust.radiusM) : defaultRadius(tiesBefore);
    const a = adjustSurfaces(resampled, specM, tiesBefore, { radius });
    resampled = a.grids;
    adjustment = { radius, report: a.report, tiesBefore };
  }
  const { clamped, counts } = clampStack(resampled);
  // T1 (EM-T1-004): which nodes each surface had clamped, for the map
  const clampMasks = clamped.map((z, i) => {
    const m = new Uint8Array(z.length);
    for (let j = 0; j < z.length; j++) if (z[j] !== resampled[i][j]) m[j] = 1;
    return m;
  });
  // 3D grid upgrade: the cap slab above the top and zones split at well tops
  // join the framework as horizons of their own
  const exp = expandFramework({
    spec: specM, clamped, topNames: definition.topNames || [], surfaceNames: stack.map((s) => s.name),
    zones: definition.zones || [], cap: definition.cap, wells: eWells,
  });
  for (const n of exp.notes) notes.push(n);
  {
    let q = 0;
    const map = exp.inserted.map((ins) => (ins ? -1 : q++));
    const xGrids = []; const xMasks = []; const xCounts = [];
    exp.clamped.forEach((g, i) => {
      xGrids.push(map[i] < 0 ? g : resampled[map[i]]);
      xMasks.push(map[i] < 0 ? new Uint8Array(g.length) : clampMasks[map[i]]);
      xCounts.push(map[i] < 0 ? 0 : counts[map[i]]);
    });
    resampled = xGrids; clampMasks.length = 0; clampMasks.push(...xMasks); counts.length = 0; counts.push(...xCounts);
  }
  const xClamped = exp.clamped;
  totalSteps += (exp.zones.length - nZones) * 4;
  const thickness = [];
  for (let i = 0; i + 1 < xClamped.length; i++) thickness.push(zoneThickness(xClamped[i], xClamped[i + 1]));
  progress('Framework stacked and clamped');
  const framework = { grids: resampled, clamped: xClamped, counts, thickness };
  const surfIndexX = {};
  exp.topNames.forEach((t, i) => { if (t) surfIndexX[t] = i; });

  // EM0: a boundary polygon (geo_culture kind boundary) clips the model:
  // nodes outside it are null on every surface and thickness, so the
  // map, the section and the volumes all stop at the lease line. Every
  // ring of a multi-part boundary counts (the union).
  let boundary = null;
  let boundaryRow = null;
  if (definition.frame?.boundaryId && backend.listBoundaries) {
    const bRows = await backend.listBoundaries();
    const hit = bRows.find((b) => b.id === definition.frame.boundaryId);
    if (!hit) throw new Error('The boundary polygon the model is clipped to is no longer in the registry. Clear it in the dock.');
    boundary = { id: hit.id, name: hit.name };
    boundaryRow = hit;
    const rings = (hit.rings && hit.rings.length ? hit.rings : [hit.vertices]).map((ring) => ring.map(([x, y]) => [x * k, y * k]));
    const clip = (z) => {
      const parts = rings.map((ring) => maskOutsidePolygon(z, specM, ring));
      const out = new Float64Array(z.length).fill(NULL_VALUE);
      for (let j = 0; j < z.length; j++) for (const p of parts) if (!isNull(p[j])) { out[j] = p[j]; break; }
      return out;
    };
    framework.clamped = framework.clamped.map(clip);
    framework.thickness = framework.thickness.map(clip);
  }

  // EM-U1-012: a polygon from another known CRS cannot be placed on this frame
  for (const p of [...(definition.faultPolygons || []), ...(boundaryRow ? [boundaryRow] : [])]) {
    const t = normalizeTag(p.crs);
    if (modelTag && isTransformableTag(t) && t !== modelTag) {
      throw new Error(`${p.name} is in ${t} but the model is in ${modelTag}. Reproject it in Mapping & Surface Studio, or remove it.`);
    }
  }
  const polygons = (definition.faultPolygons || []).map((p) => p.vertices.map(([x, y]) => [x * k, y * k]));
  const labels = polygons.length ? labelBlocks(specM, polygons) : null;
  const census = labels ? blockCensus(labels) : { 0: specM.nx * specM.ny };
  // U2-001: a Seismolord fault (rails down its surface) is cut with each zone
  // top, so a sloping fault moves its block boundary from zone to zone
  let polygonsByZone = null;
  if ((definition.faultPolygons || []).some((p) => Array.isArray(p.rails) && p.rails.length >= 2)) {
    polygonsByZone = [];
    for (let i = 0; i + 1 < framework.clamped.length; i++) {
      polygonsByZone.push((definition.faultPolygons || []).map((p, q) => {
        if (!Array.isArray(p.rails) || p.rails.length < 2) return polygons[q];
        const rails = p.rails.map((rail) => rail.map(([x, y, d]) => ({ x: x * k, y: y * k, d })));
        const r = hangingWallAtSurface(rails, framework.clamped[i], specM);
        if (r.error) {
          notes.push(`${p.name}: ${r.error} (zone ${i + 1}), so its polygon at the first top is used there.`);
          return polygons[q];
        }
        return r.polygon;
      }));
    }
  }
  const labelsByZone = polygonsByZone ? polygonsByZone.map((ps) => labelBlocks(specM, ps)) : null;

  const ties = wellTies(eWells, framework.clamped, specM, surfIndexX).map((t) => {
    const before = adjustment?.tiesBefore.find((b) => b.well === t.well && b.top === t.top);
    const native = { ...t, x: t.x / k, y: t.y / k };
    return before ? { ...native, residualBeforeM: before.residualM } : native;
  });

  // U2-008: each zone's Petrophysics maps (attribute rows in metres), on the model frame
  const readMap = async (id, role) => {
    if (!id) return null;
    const row = surfaces.find((x) => x.id === id);
    if (!row) throw new Error(`A Petrophysics map the model uses (${role}) is no longer in the registry. Pick another in the dock.`);
    const r = await readRow(row, ['attribute'], role);
    if (r.zUnit !== 'm') throw new Error(`${row.name} is not a thickness in metres or feet (z unit ${row.z_unit || 'none'}), so it cannot be ${role}.`);
    if (isMdKey(row)) notes.push(`${row.name} is measured-depth thickness; in deviated wells it is longer than the vertical zone thickness. Grid the TVT key in Mapping for a true ratio.`);
    return resampleTo(r.grid, scaleSpec(specOf(row), r.xyToM), specM);
  };
  const zoneMaps = await Promise.all((definition.zones || []).map(async (zd) => ({
    ntg: definition.methods?.ntg === 'map' ? await readMap(zd.maps?.ntg, `the net pay map of ${zd.name}`) : null,
    sw: definition.methods?.sw === 'map' ? await readMap(zd.maps?.sw, `the HCPV map of ${zd.name}`) : null,
  })));

  const totalPhi = [];
  const propertyClamps = [];
  const parsedFluids = definition.fluidsInput ? parseFluidsInput(definition.fluidsInput) : (definition.fluids || []);
  for (const f of parsedFluids) for (const n of f?.notes || []) notes.push(n);
  const gridOn = !!definition.grid?.enabled;
  const parentControl = new Map();
  const gridLayerM = (Number(definition.grid?.layerFt) > 0 ? Number(definition.grid.layerFt) : GRID_DEFAULTS.layerFt) * M_PER_FT;
  const gridStyle = ['proportional', 'top', 'base'].includes(definition.grid?.style) ? definition.grid.style : 'proportional';
  const zones = exp.zones.map((ez, i) => {
    const zdef = ez.def;
    // the definition zone this one comes from (a sub-zone shares its parent's
    // methods, typed values, maps and fluids; the cap takes the first zone's fluids)
    const pi = ez.parent < 0 ? 0 : ez.parent;
    const isCap = ez.kind === 'cap';
    const zThickness = framework.thickness[i];
    // U2-001: this zone's own blocks when a fault slopes
    const zLabels = labelsByZone ? labelsByZone[i] : labels;
    const zPolygons = polygonsByZone ? polygonsByZone[i] : polygons;
    const top = framework.clamped[i];
    const base = framework.clamped[i + 1];
    const nNodes = specM.nx * specM.ny;
    // Ekene walk: proportional layers inside the zone (1 = the zone itself)
    let nL; let frames;
    if (gridOn) {
      const g = gridLayerFrames(top, base, { layerM: gridLayerM, style: gridStyle });
      nL = g.count; frames = g.frames;
    } else {
      nL = zoneLayerCount(zdef);
      frames = proportionalLayers(top, base, nL);
    }
    const layering = gridOn ? { layerM: gridLayerM, style: gridStyle } : null;

    const fluids = parsedFluids[pi] || null;
    const eng = engineFluids(fluids, zLabels, nNodes);
    // U2-006: the leg bounded by Mapping's closure and spill engine
    let trap = null;
    if (fluids?.trap === 'closure') {
      const owcGrid = contactGrid(fluids, 'owc', zLabels, nNodes);
      if (owcGrid) {
        trap = boundLegByClosure(specM, top, owcGrid);
        eng.owc = trap.owc;
        if (fluids.gasZone) eng.goc = Float64Array.from(trap.owc, (v) => (Number.isFinite(v) ? v : 1e12));
        trap.traps = trap.traps.map((t) => ({ ...t, spillXY: t.spillXY ? { x: t.spillXY.x / k, y: t.spillXY.y / k } : null }));
      }
    }

    // where the property control comes from: the published zone averages
    // (one value per well) or the wells' logs upscaled to each layer
    const control = definition.control === 'logs' ? 'logs' : 'zones';
    let logControl = null;
    if (control === 'logs') {
      const curves = definition.logsResolved?.curves || {};
      if (!Object.keys(curves).length) throw new Error('Rock properties from the well logs needs computed PHIE and VSH curves in the wells. Publish them from Petrophysics Studio, or use the zone averages.');
      const owc = eng?.owc;
      const owcAt = owc === null || owc === undefined ? null
        : typeof owc === 'number' ? () => owc
          : (x, y) => { const v = sampleAtXY(owc, specM, x, y); return Number.isFinite(v) ? v : null; };
      // the cap's interval at a well: the slab of its thickness above the top pick
      const intervalAt = isCap ? (w) => {
        const baseMd = (w.tops || []).find((t) => t.name === ez.baseName)?.md_m;
        if (!Number.isFinite(baseMd)) return null;
        const traj = extendTrajectory(minCurvature(w.deviation || [], w.kb_m, w.x, w.y), baseMd + 50);
        const tv = positionAtMd(traj, baseMd).tvdss;
        return { topMd: mdAtTvdss(traj, 0, baseMd, tv - ez.capM), baseMd, source: `${ez.capM.toFixed(1)} m above ${ez.baseName}` };
      } : null;
      logControl = zoneLogControl(eWells, curves, { topName: ez.topName || '', baseName: ez.baseName || '', registryZone: zdef.registryZone, ...(intervalAt ? { intervalAt } : {}) }, {
        layers: nL, cutoffs: { ...DEFAULT_CUTOFFS, ...cutoffsOf(definition.cutoffs) }, owcAt, layering, grossFill: isCap,
      });
      // a zone split at well tops falls back on its parent zone's upscaled values
      // (Ekene Sand Lower is below the OWC in every well, so it has no Sw of its own)
      if (ez.kind === 'subzone') {
        const key = `${ez.parent}`;
        if (!parentControl.has(key)) {
          parentControl.set(key, zoneLogControl(eWells, curves, { topName: definition.topNames?.[ez.parent] || '', baseName: definition.topNames?.[ez.parent + 1] || '', registryZone: zdef.registryZone }, {
            layers: 1, cutoffs: { ...DEFAULT_CUTOFFS, ...cutoffsOf(definition.cutoffs) }, owcAt,
          }).zone);
        }
        logControl.parent = parentControl.get(key);
      }
      if (!logControl.rows.length) notes.push(`${zdef.name}: no well has PHIE and VSH over the zone, so its properties have no log control.`);
    }
    const zoneBases = new Set();
    const zonePointsCache = {};
    const zoneAveragePoints = (prop) => {
      if (zonePointsCache[prop]) return zonePointsCache[prop];
      const all = [];
      if (prop === 'perm') return (zonePointsCache[prop] = all);
      for (const cp of zoneControlPoints(eWells, zdef.registryZone)) {
        const well = placed.find((w) => w.name === cp.well);
        const zone = (well?.zones || []).find((z) => z.name === zdef.registryZone);
        const { v, basis } = zonePropertyValue(zone?.properties, prop);
        if (Number.isFinite(v)) { all.push({ well: cp.well, x: cp.x, y: cp.y, v, w: cp.w }); if (basis) zoneBases.add(basis); }
        // PETRO-U2-013: a pre-PT9a Studio summary's phi_avg is total porosity
        if (prop === 'phi' && Number.isFinite(v) && isPrePt9aZone(zone.properties)) totalPhi.push({ zone: zdef.name, well: cp.well });
      }
      return (zonePointsCache[prop] = all);
    };
    // a layer no well can speak for (Sw in a layer below the OWC in every
    // well) takes the zone's upscaled values, and the provenance says so
    const borrowed = new Set();
    const borrowedParent = new Set();
    const pointsFor = (prop, kLayer) => {
      if (control !== 'logs') return zoneAveragePoints(prop);
      const own = logControl.layers[kLayer][prop];
      if (own.length) return own;
      if (logControl.zone[prop].length) { borrowed.add(`${prop}|${kLayer}`); return logControl.zone[prop]; }
      if (logControl.parent?.[prop]?.length) { borrowedParent.add(`${prop}|${kLayer}`); return logControl.parent[prop]; }
      return own;
    };

    const populateOne = (prop, all, typedV) => {
      const byBlock = {};
      for (const p of all) {
        let lab = 0;
        for (let q = 0; q < zPolygons.length; q++) {
          if (pointInPolygon(p.x, p.y, zPolygons[q])) { lab = q + 1; break; }
        }
        (byBlock[lab] = byBlock[lab] || []).push(p);
      }
      let method = definition.methods?.[prop === 'perm' ? 'phi' : prop === 'vsh' ? 'ntg' : prop] || 'constant';
      if ((prop === 'perm' || prop === 'vsh') && method === 'typed') method = 'constant';
      if (method === 'map' || method === 'shm') method = 'constant'; // no map for this zone: the weighted mean, said in provenance
      // SGS is porosity's; anything else it reaches (no data, permeability without a transform) is kriged
      if (method === 'sgs') method = 'okrige';
      // Vsh is shown, never in a volume: inverse distance keeps a 1.5 M cell build quick
      if (prop === 'vsh') method = 'idw';
      if (method === 'typed') return typedGrid(specM, zLabels, typedV, prop, zdef.name);
      // the cap with no control (zone averages: no registry zone for a slab of seal) is seal rock
      if (isCap && !all.length && ['phi', 'sw', 'ntg'].includes(prop)) {
        const v = prop === 'sw' ? 1 : 0;
        return { z: new Float64Array(specM.nx * specM.ny).fill(v), provenance: [{ block: 0, methodUsed: 'typed', wells: 0, fellBack: false, note: `${v} (the cap has no control of its own: seal rock; read the logs for its porosity)` }] };
      }
      // 3D grid upgrade: every well reads the same value (the cap's NTG is 0 at every
      // well): the field is that value, said plainly instead of a variogram that cannot fit
      if (['okrige', 'krige', 'trend'].includes(method) && all.length >= 2 && all.every((p) => Math.abs(p.v - all[0].v) < 1e-12)) {
        const z = new Float64Array(specM.nx * specM.ny).fill(all[0].v);
        return { z, provenance: [{ block: 0, methodUsed: 'constant', wells: new Set(all.map((p) => p.well)).size, fellBack: false, note: `every well reads ${Number(all[0].v.toPrecision(4))}` }] };
      }
      if (method === 'idw') return populateZonePropertyIdw(specM, zLabels, byBlock, all, { power: definition.idw?.power });
      // EM4: ordinary kriging with a fitted variogram and a variance grid
      if (method === 'okrige') return populateZonePropertyOk(specM, zLabels, byBlock, all, definition.krige || DEFAULT_KRIGE);
      return populateZoneProperty(specM, zLabels, byBlock, all, method, definition.krige || DEFAULT_KRIGE);
    };

    // U2-008: zone maps (net pay for NTG) are zone-wide and shared by the layers
    let ntgFromMap = null;
    if (definition.methods?.ntg === 'map' && !isCap && zoneMaps[pi]?.ntg) {
      ntgFromMap = ntgFromNetMap(zoneMaps[pi].ntg, zThickness);
      if (ntgFromMap.clamped) propertyClamps.push({ zone: zdef.name, prop: 'ntg', nodes: ntgFromMap.clamped });
    }
    const swMapPending = definition.methods?.sw === 'map' && !isCap && !!zoneMaps[pi]?.sw;
    const shmPending = definition.methods?.sw === 'shm';
    const shmR = shmPending ? definition.shmResolved : null;
    let fwlM = null;
    if (shmPending) {
      if (!shmR?.ok) throw new Error(shmR?.errors?.[0] || 'Sw from saturation-height needs a SCAL Studio project. Pick one in the dock.');
      fwlM = Number.isFinite(shmR.fwlM) ? shmR.fwlM : shmR.fwlTvdssM;
      if (!Number.isFinite(fwlM)) throw new Error('Sw from saturation-height needs a free-water level: the SCAL project has none, so type one in the dock.');
    }
    const owcAtNodes = eng && eng.owc !== null && eng.owc !== undefined
      ? (typeof eng.owc === 'number' ? new Float64Array(nNodes).fill(eng.owc) : eng.owc) : null;
    const usedFwl = shmPending && (!owcAtNodes || !Array.from(owcAtNodes).some(Number.isFinite));

    const clampSum = {};
    let transitionNodes = 0;
    // 3D grid upgrade: porosity of the whole zone by sequential Gaussian simulation
    let sgsOut = null;
    if (definition.methods?.phi === 'sgs') {
      const meanT = (() => { let s2 = 0; let n2 = 0; for (const v of zThickness) if (!isNull(v)) { s2 += v; n2 += 1; } return n2 ? s2 / n2 : 0; })();
      const dz = gridOn && gridStyle !== 'proportional' ? gridLayerM : Math.max(1e-3, meanT / nL);
      const params = sgsParams(definition.sgs, definition.krige);
      sgsOut = sgsZonePorosity({
        spec: specM, frames, pointsAt: (kL) => pointsFor('phi', kL), layerM: dz, params: { ...params, seed: params.seed + 101 * i },
        onProgress: (f) => subProgress(`${zdef.name}: simulating porosity (${frames.length} layers)`, 0.7 * f),
      });
      if (!sgsOut) notes.push(`${zdef.name}: no well gives porosity, so the simulation had no data and porosity was kriged instead.`);
    }
    // with simulated porosity, permeability follows it through the wells' phi-k transform
    let phiK = null;
    if (sgsOut && control === 'logs') {
      const pairs = (logControl.rows || []).filter((r) => Number.isFinite(r.phi) && Number.isFinite(r.perm) && r.perm > 0);
      if (pairs.length >= 3) {
        const mx = pairs.reduce((a, r) => a + r.phi, 0) / pairs.length; const my = pairs.reduce((a, r) => a + Math.log10(r.perm), 0) / pairs.length;
        let sxy = 0; let sxx = 0;
        for (const r of pairs) { sxy += (r.phi - mx) * (Math.log10(r.perm) - my); sxx += (r.phi - mx) ** 2; }
        if (sxx > 0) { const b = sxy / sxx; phiK = { a: my - b * mx, b, n: pairs.length }; }
      }
    }
    const f32 = (g) => (gridOn && g && !(g instanceof Float32Array) ? Float32Array.from(g) : g);
    const layerOut = frames.map((F, kL) => {
      const props = {}; const variance = {}; const provenance = {};
      for (const prop of ['phi', 'sw', 'ntg', ...(control === 'logs' ? ['perm', 'vsh'] : [])]) {
        if (prop === 'phi' && sgsOut) { props.phi = sgsOut.grids[kL]; provenance.phi = [sgsOut.provenance]; continue; }
        // the cap: shale has no permeability log over net rock, so it is a seal of 0.001 md
        if (prop === 'perm' && isCap && !pointsFor('perm', kL).length) {
          props.perm = Float32Array.from(F.thickness, (v) => (isNull(v) ? NULL_VALUE : 0.001));
          provenance.perm = [{ block: 0, methodUsed: 'typed', wells: 0, fellBack: false, note: '0.001 (no permeability log over net rock in the cap: a seal)' }];
          continue;
        }
        if (prop === 'perm' && phiK) {
          const pg = props.phi;
          props.perm = Float32Array.from(pg, (v) => (isNull(v) ? NULL_VALUE : 10 ** (phiK.a + phiK.b * v)));
          provenance.perm = [{ block: 0, methodUsed: 'phik', wells: phiK.n, fellBack: false, note: `log10 k = ${phiK.a.toFixed(3)} + ${phiK.b.toFixed(2)} x porosity, from ${phiK.n} well cells` }];
          continue;
        }
        if (prop === 'ntg' && ntgFromMap) {
          props.ntg = ntgFromMap.z;
          provenance.ntg = [{ block: 0, methodUsed: 'map', wells: 0, fellBack: false, note: 'net pay map / zone thickness' }];
          continue;
        }
        if (prop === 'sw' && (swMapPending || shmPending)) continue; // after porosity and NTG
        const out = populateOne(prop, pointsFor(prop, kL), zdef.typed?.[prop]);
        if (prop === 'perm') {
          props.perm = (gridOn ? Float32Array : Float64Array).from(out.z, (v) => (isNull(v) ? v : 10 ** v));
        } else {
          // EM-U1-005: a trend or kriging extrapolated past the wells stays a fraction
          const n = clampFractionGrid(out.z);
          if (n && prop !== 'vsh') clampSum[prop] = (clampSum[prop] || 0) + n;
          props[prop] = f32(out.z);
        }
        if (out.variance) variance[prop] = f32(out.variance);
        if (borrowed.has(`${prop}|${kL}`)) out.provenance = out.provenance.map((r) => ({ ...r, note: `${r.note ? `${r.note}; ` : ''}no well has a value in this layer, so the zone's upscaled values` }));
        if (borrowedParent.has(`${prop}|${kL}`)) out.provenance = out.provenance.map((r) => ({ ...r, note: `${r.note ? `${r.note}; ` : ''}no well has a value in this zone, so the whole ${definition.zones?.[ez.parent]?.name || 'parent zone'}'s upscaled values` }));
        provenance[prop] = definition.methods?.[prop] === 'map'
          ? out.provenance.map((r) => ({ ...r, fellBack: true, note: `no Petrophysics map picked for this zone${r.note ? `; ${r.note}` : ''}` }))
          : out.provenance;
      }
      if (swMapPending) {
        const r = swFromHcpvMap(zoneMaps[pi].sw, zThickness, props.ntg, props.phi);
        props.sw = r.z;
        if (r.clamped) clampSum.sw = (clampSum.sw || 0) + r.clamped;
        provenance.sw = [{ block: 0, methodUsed: 'map', wells: 0, fellBack: false, note: '1 - HCPV map / (thickness x NTG x porosity)' }];
      } else if (shmPending) {
        const g = shmSwGrid({ spec: specM, top: F.top, base: F.base, contact: owcAtNodes, shm: shmR, fwlM, rock: definition.shm?.rock || 'project', phi: props.phi });
        props.sw = g.sw;
        transitionNodes = Math.max(transitionNodes, g.transitionNodes || 0);
        // SCAL-U2-009: the kr-1 source words of the J function travel with the zone into the report
        provenance.sw = [{ block: 0, methodUsed: 'shm', wells: 0, fellBack: false, note: `${shmR.name || 'SCAL project'}, FWL ${fwlM.toFixed(1)} m, rock from ${definition.shm?.rock === 'model' ? 'the modelled porosity' : 'the project'}${shmR.sourceText ? `; SCAL source: ${shmR.sourceText}` : ''}` }];
      }
      // facies by indicator from the upscaled facies log (see grid3d/properties.js)
      if (control === 'logs') {
        const fac = faciesLayer(specM, F.thickness, pointsFor('facies', kL));
        if (fac) { props.facies = fac; provenance.facies = [{ block: 0, methodUsed: 'indicator', wells: new Set(pointsFor('facies', kL).map((p) => p.well)).size, fellBack: false, note: 'indicator inverse distance of the upscaled RP_FACIES codes, the most likely code' }]; }
      }
      return { ...F, props, variance, provenance };
    });
    for (const w of ['porosity', 'Sw', 'NTG']) progress(`${zdef.name}: ${w} populated`);
    for (const [prop, n] of Object.entries(clampSum)) propertyClamps.push({ zone: zdef.name, prop, nodes: n });
    // a property with no control anywhere leaves its nodes empty, and an empty node holds no volume: say so
    layerOut.forEach((L, kL) => {
      for (const prop of ['phi', 'sw', 'ntg']) {
        const g = L.props[prop];
        if (g && !g.some((v) => !isNull(v) && Number.isFinite(v))) notes.push(`${zdef.name}${layerOut.length > 1 ? ` layer ${kL + 1}` : ''}: no well gives ${prop === 'phi' ? 'porosity' : prop === 'sw' ? 'Sw' : 'NTG'}, so its nodes are empty and hold no volume.`);
      }
    });
    if (zoneBases.size) {
      const b = [...zoneBases].join(' and ');
      for (const L of layerOut) if (L.provenance.ntg && !ntgFromMap) L.provenance.ntg = L.provenance.ntg.map((r) => ({ ...r, note: `${r.note ? `${r.note}; ` : ''}${b} over gross` }));
      if (zoneBases.has('net pay')) notes.push(`${zdef.name}: NTG from ${zoneBases.has('net reservoir') ? 'some wells' : 'the wells'} is net PAY over gross (the zone summary has no net reservoir thickness), which already cuts water; republish the zone from Petrophysics Studio for net reservoir.`);
    }
    if (control === 'logs') {
      const cut = { ...DEFAULT_CUTOFFS, ...cutoffsOf(definition.cutoffs) };
      for (const L of layerOut) for (const prop of Object.keys(L.provenance)) {
        if (L.provenance[prop].some((r) => ['shm', 'map', 'typed'].includes(r.methodUsed))) continue;
        L.provenance[prop] = L.provenance[prop].map((r) => ({ ...r, note: `${r.note ? `${r.note}; ` : ''}well logs upscaled (Vsh <= ${cut.vsh}, PHIE >= ${cut.phi}${prop === 'sw' ? ', above the OWC' : ''})` }));
      }
    }

    let shm = null;
    if (shmPending) {
      shm = { project: shmR.name || 'SCAL project', fwlM, rock: definition.shm?.rock || 'project', transitionNodes, fwlAsContact: usedFwl, source: shmR.sourceText || null };
      if (usedFwl) {
        // no OWC typed: the FWL bounds the hydrocarbon leg, or the water below it would count
        if (eng) eng.owc = fwlM;
        notes.push(`${zdef.name}: no OWC typed, so the free-water level (${fwlM.toFixed(1)} m) bounds the hydrocarbon leg; the transition zone above it is in Sw.`);
      }
    }
    const volFluids = shmPending && shm?.fwlAsContact ? (eng || { owc: shm.fwlM }) : eng;
    const useContacts = !!(hasFluids(fluids) || (shmPending && shm?.fwlAsContact));
    const layered = nL > 1;
    const zone = {
      name: zdef.name, registryZone: zdef.registryZone, ...(labelsByZone ? { labels: zLabels, census: blockCensus(zLabels) } : {}),
      thickness: zThickness, fluids, ...(shm ? { shm } : {}),
      control,
      ...(layered ? { layers: layerOut } : {}),
      props: layered ? aggregateLayerProps(layerOut) : layerOut[0].props,
      variance: layered ? {} : layerOut[0].variance,
      provenance: layered ? mergeLayerProvenance(layerOut) : layerOut[0].provenance,
      ...(logControl ? { logRows: logControl.rows, logSamples: logControl.samples } : {}),
      kind: ez.kind, parent: ez.parent, topName: ez.topName, baseName: ez.baseName,
      ...(gridOn ? { grid: { layers: nL, layerM: gridLayerM, style: gridStyle } } : {}),
      ...(sgsOut ? { sgs: sgsOut.stats } : {}),
      ...(phiK ? { phiK } : {}),
    };
    const volumes = layeredVolumes(specM, zone, zLabels, volFluids, top, base, { useContacts });
    // Ekene walk: rock volume and area above the contacts, the numbers RCP prints
    if (useContacts) {
      const hc = hcCellCounts(top, base, zLabels, volFluids || {});
      const cellM2 = specM.dx * specM.dy;
      for (const [key, b] of Object.entries(volumes)) {
        b.hc_bulk_m3 = (b.gas_bulk_m3 || 0) + (b.oil_bulk_m3 || 0);
        b.hc_cells = hc[key] || 0;
        b.hc_area_m2 = b.hc_cells * cellM2;
      }
    }
    zone.volumes = volumes;
    // Ekene walk: the averages over the hydrocarbon leg (what a single-tank
    // calculation would need to give this volume): NTG over the rock above the
    // contacts, porosity over its net rock, Sw pore-volume weighted
    if (useContacts && volumes.total?.hc_bulk_m3 > 0) {
      const ones = new Float64Array(nNodes).fill(1); const zeros = new Float64Array(nNodes);
      const swap = (over) => ({ ...zone, layers: zone.layers?.map((L) => ({ ...L, props: { ...L.props, ...over(L.props) } })), props: { ...zone.props, ...over(zone.props) } });
      const net = layeredVolumes(specM, swap(() => ({ phi: ones, sw: zeros })), zLabels, volFluids, top, base, { useContacts }).total.hcpv_m3;
      const pore = layeredVolumes(specM, swap(() => ({ sw: zeros })), zLabels, volFluids, top, base, { useContacts }).total.hcpv_m3;
      const t = volumes.total;
      zone.hcAverages = {
        ntg: net / t.hc_bulk_m3,
        phi: net > 0 ? pore / net : null,
        sw: pore > 0 ? 1 - t.hcpv_m3 / pore : null,
      };
    }
    zone.range = volumeRange(specM, zone, zLabels, volFluids, top, base, useContacts);
    // U2-010: what a volume distribution needs to re-run this zone's volumes
    zone.mc = { fluids: volFluids || null, trap: !!trap, owcBase: trap ? contactGrid(fluids, 'owc', zLabels, nNodes) : null, hasFluids: useContacts };
    if (trap) {
      zone.trap = { traps: trap.traps, cutNodes: trap.cutNodes, openEdge: trap.openEdge };
      zone.openEdge = trap.openEdge ? { open: true, nodes: 0, spillAtEdge: true } : { open: false, nodes: 0 };
    } else {
      zone.openEdge = contactEdgeReport(specM, top, fluids, zLabels);
    }
    // the model against its control: each control point's value beside the
    // model's at that point (exact for kriging and IDW, a misfit for a trend or constant)
    zone.wellMatch = wellMatchRows(specM, layerOut, (prop, kL) => pointsFor(prop, kL) || []);
    // U2-017: the zone's isopach (true stratigraphic thickness) beside its isochore,
    // Mapping's engine (TST = TVT cos(dip), dip from the zone's mid-surface)
    {
      const elevTop = Float64Array.from(top, (v) => (isNull(v) ? NULL_VALUE : -v));
      const elevBase = Float64Array.from(base, (v) => (isNull(v) ? NULL_VALUE : -v));
      const iso = isopach(elevTop, elevBase, specM, { xyToM: 1, dipFrom: 'mid' });
      let sTst = 0; let sTvt = 0; let nIso = 0;
      for (let j = 0; j < iso.tst.length; j++) {
        if (isNull(iso.tst[j]) || isNull(iso.tvt[j])) continue;
        sTst += iso.tst[j]; sTvt += iso.tvt[j]; nIso += 1;
      }
      zone.isopach = { tst: iso.tst, dip: iso.dip, maxDipDeg: iso.maxDipDeg, meanTstM: nIso ? sTst / nIso : null, meanTvtM: nIso ? sTvt / nIso : null };
    }
    progress(`${zdef.name}: volumes`);
    return zone;
  });

  // T1 (EM-T1-002, -003): what the build should say out loud
  const fallbacks = [];
  for (const z of zones) {
    for (const [prop, pRows] of Object.entries(z.provenance)) {
      for (const r of pRows) if (r.fellBack) fallbacks.push({ zone: z.name, prop, block: r.block, used: r.methodUsed, wells: r.wells });
    }
  }
  const misties = ties.filter((t) => Number.isFinite(t.residualM) && Math.abs(t.residualM) > MISTIE_WARN_M);

  // the fine grid's size: every layer of every zone over the live columns
  let cells = 0;
  for (const z of zones) {
    const live = z.thickness.reduce((a, v) => a + (isNull(v) ? 0 : 1), 0);
    cells += live * (z.layers?.length || 1);
  }
  return {
    spec, specM, xyToM: k, xyUnit, crs, ...framework, clampMasks, labels, census, ties, zones, boundary, adjustment,
    horizonNames: exp.horizonNames, outline, edge: smooth ? 'smooth' : 'nodes',
    grid: gridOn ? { layerM: gridLayerM, style: gridStyle, cells, layers: zones.map((z) => z.layers?.length || 1) } : null,
    ...(polygonsByZone ? { polygonsByZone: polygonsByZone.map((ps) => ps.map((ring) => ring.map(([x, y]) => [x / k, y / k]))) } : {}),
    fallbacks, misties, totalPhi, propertyClamps, notes,
  };
}
