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
import { wellTies, zoneControlPoints } from '../engine/wellties';
import { populateZoneProperty } from '../engine/properties';
import { zoneVolumes, zoneVolumesWithContacts } from '../engine/volumes';
import { normalizeTag, isTransformableTag, consensusTag } from '@/lib/crs/tags';
import { surfaceZToDepthDown } from '@/lib/surfaceConvention';
import { maskOutsidePolygon } from '@/lib/gridding/gridmath';

/** Registry property keys for the three populated properties. */
export const PROP_KEYS = { phi: 'phi_avg', sw: 'sw_avg', ntg: 'ntg' };

export const DEFAULT_KRIGE = { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025, fit: true, detrend: true };
export const POPULATION_METHODS = Object.freeze([
  { key: 'constant', label: 'constant (weighted mean)' },
  { key: 'trend', label: 'trend (LSQ plane)' },
  { key: 'okrige', label: 'ordinary kriging (fitted variogram)' },
  { key: 'krige', label: 'simple kriging (typed variogram, legacy)' },
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
});

/**
 * The dock's typed fluids (text, contacts in the unit they were typed in)
 * as engine fluids: contacts in metres positive down, FVFs as numbers.
 * Throws a plain message on a value that is not a number or an FVF <= 0.
 */
export function parseFluidsInput(inputs = []) {
  const FT = 0.3048;
  return (inputs || []).map((f, i) => {
    if (!f) return null;
    const num = (v, what) => {
      if (v === undefined || v === null || String(v).trim() === '') return null;
      const x = Number(v);
      if (!Number.isFinite(x)) throw new Error(`Zone ${i + 1}: ${what} must be a number.`);
      return x;
    };
    const depth = (v, what) => { const x = num(v, what); return x === null ? null : (f.unit === 'ft' ? x * FT : x); };
    const out = { goc: depth(f.goc, 'the GOC'), owc: depth(f.owc, 'the OWC'), bo: num(f.bo, 'Bo'), bg: num(f.bg, 'Bg') };
    if (out.bo !== null && !(out.bo > 0)) throw new Error(`Zone ${i + 1}: Bo must be greater than zero.`);
    if (out.bg !== null && !(out.bg > 0)) throw new Error(`Zone ${i + 1}: Bg must be greater than zero.`);
    if (out.goc !== null && out.owc !== null && out.goc > out.owc) throw new Error(`Zone ${i + 1}: the GOC is deeper than the OWC.`);
    return out;
  });
}

/** A mis-tie beyond this (metres) is reported after a build (T1 EM-T1-003). */
export const MISTIE_WARN_M = 10;

/** True when a zone's fluids carry any contact or FVF. */
export const hasFluids = (f) => !!f && ['goc', 'owc', 'bo', 'bg'].some((k) => Number.isFinite(f[k]));

/**
 * HCPV and in-place volumes at a low and a high property case (T1 E1): the
 * kriged properties shifted by 1.2816 standard deviations, porosity and NTG
 * down and Sw up for P90, the reverse for P10, every node moving together
 * (a fully correlated property case). Null when no property was kriged.
 */
export function volumeRange(spec, zone, labels, fluids, top, base) {
  const vars = zone.variance || {};
  if (!['phi', 'sw', 'ntg'].some((k) => vars[k])) return null;
  const K = 1.2815515655446004;
  const shifted = (sgn) => {
    const out = {};
    for (const k of ['phi', 'sw', 'ntg']) {
      const g = zone.props[k];
      if (!g) continue;
      const v = vars[k];
      const dir = k === 'sw' ? -sgn : sgn;
      out[k] = Float64Array.from(g, (x, i) => {
        if (!v || !Number.isFinite(v[i]) || v[i] < 0 || Math.abs(x) >= 1e29) return x;
        return Math.min(1, Math.max(0, x + dir * K * Math.sqrt(v[i])));
      });
    }
    return out;
  };
  const vol = (props) => (hasFluids(fluids)
    ? zoneVolumesWithContacts(spec, top, base, labels, props, fluids)
    : zoneVolumes(spec, zone.thickness, labels, props)).total;
  const low = vol(shifted(-1));
  const high = vol(shifted(1));
  const mid = zone.volumes.total;
  const pick = (b) => ({ hcpv_m3: b.hcpv_m3, stoiip_m3: b.stoiip_m3 ?? null, giip_m3: b.giip_m3 ?? null });
  return { p90: pick(low), p50: pick(mid), p10: pick(high) };
}

/**
 * The model frame from the top surface's frame and an optional cell
 * size (EM0): same origin and extent, nodes recounted for the new cell
 * (at least 2 x 2, at most four million nodes).
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

export const specOf = (s) => ({ x0: s.origin_x, y0: s.origin_y, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny, ...(s.rotation_deg ? { rotation_deg: s.rotation_deg } : {}) });

/** Engine well shape from a registry row (with tops + zones embedded). */
export const engineWell = (w) => ({
  name: w.name,
  x: w.surface_x,
  y: w.surface_y,
  kb_m: w.kb_m || 0,
  deviation: w.deviation || [],
  tops: w.tops || [],
  zones: w.zones || [],
});

/**
 * Build the model. Throws with a specific message on an unbuildable
 * definition; per-block population shortfalls degrade through the
 * engine's explicit fallback ladder instead (recorded in provenance).
 * @returns {{spec, clamped, counts, thickness, labels, census, ties, zones}}
 */
export async function buildModel(definition, wells, surfaces, backend) {
  // registry rows plus the definition's derived horizons (EM2)
  const rows = allSurfaceRows(surfaces, definition);
  const stack = definition.surfaceIds.map((id) => {
    const s = rows.find((x) => x.id === id);
    if (!s) throw new Error('A stacked surface is no longer in the registry — remove it from the stack.');
    return s;
  });
  if (stack.length < 2) throw new Error('A framework needs at least 2 surfaces (top and base).');
  (definition.faultPolygons || []).forEach((p) => validatePolygon(p.vertices));

  // CRS guard (Phase 5): two surfaces in DIFFERENT known systems must
  // not be stacked by raw index math — that is exactly the silent
  // misregistration the CRS program exists to stop. Unknown tags pass
  // (legacy data; the model's own tag then stays unverified).
  const known = [...new Set(stack.map((s) => normalizeTag(s.crs))
    .filter((t) => isTransformableTag(t)))];
  if (known.length > 1) {
    throw new Error(`The stacked surfaces are in different coordinate systems (${known.join(' vs ')}). Convert them to one CRS before building.`);
  }
  const crs = consensusTag(stack.map((s) => s.crs));

  // Registry surfaces are elevation (negative below datum, m or ft);
  // the engine works in metres positive-down, so convert at the door.
  // registry depth surfaces convert at the door; isochores are raw
  // thickness; derived horizons compute from their sources (EM2)
  const loadDepthDown = async (s) => {
    const g = await backend.downloadSurfaceGrid(s);
    return s.kind === 'isochore' ? g : surfaceZToDepthDown(s, g);
  };
  const grids = await Promise.all(stack.map(async (s) => (s.derived
    ? computeDerivedGrid(s.provenance.derived, rows, loadDepthDown)
    : loadDepthDown(s))));
  // the model frame is the TOP surface's frame, at its cell or the one
  // the definition asks for (EM0)
  const spec = frameSpec(specOf(stack[0]), definition.frame?.cellM);
  const eWells = wells.map(engineWell);
  const surfIndexByTop = {};
  (definition.topNames || []).forEach((topName, i) => {
    if (topName) surfIndexByTop[topName] = i;
  });

  // resample, then (EM1) adjust each tied surface through its tie
  // residuals, then clamp: the adjustment is a geometric correction of
  // the input surfaces, the clamp stays the stacking rule
  let resampled = resampleStack(grids.map((z, i) => ({ z, spec: specOf(stack[i]) })), spec);
  let adjustment = null;
  if (definition.adjust?.enabled) {
    const tiesBefore = wellTies(eWells, resampled, spec, surfIndexByTop)
      .map((t) => ({ ...t, surfaceIndex: surfIndexByTop[t.top] }));
    const radius = Number(definition.adjust.radiusM) > 0 ? Number(definition.adjust.radiusM) : defaultRadius(tiesBefore);
    const a = adjustSurfaces(resampled, spec, tiesBefore, { radius });
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
  const thickness = [];
  for (let i = 0; i + 1 < clamped.length; i++) thickness.push(zoneThickness(clamped[i], clamped[i + 1]));
  const framework = { grids: resampled, clamped, counts, thickness };

  // EM0: a boundary polygon (geo_culture kind boundary) clips the model:
  // nodes outside it are null on every surface and thickness, so the
  // map, the section and the volumes all stop at the lease line
  let boundary = null;
  if (definition.frame?.boundaryId && backend.listBoundaries) {
    const rows = await backend.listBoundaries();
    const hit = rows.find((b) => b.id === definition.frame.boundaryId);
    if (!hit) throw new Error('The boundary polygon the model is clipped to is no longer in the registry. Clear it in the dock.');
    boundary = { id: hit.id, name: hit.name };
    framework.clamped = framework.clamped.map((z) => maskOutsidePolygon(z, spec, hit.vertices));
    framework.thickness = framework.thickness.map((z) => maskOutsidePolygon(z, spec, hit.vertices));
  }

  const polygons = (definition.faultPolygons || []).map((p) => p.vertices);
  const labels = polygons.length ? labelBlocks(spec, polygons) : null;
  const census = labels ? blockCensus(labels) : { 0: spec.nx * spec.ny };

  const ties = wellTies(eWells, framework.clamped, spec, surfIndexByTop).map((t) => {
    const before = adjustment?.tiesBefore.find((b) => b.well === t.well && b.top === t.top);
    return before ? { ...t, residualBeforeM: before.residualM } : t;
  });

  const zones = (definition.zones || []).map((zdef, i) => {
    const thickness = framework.thickness[i];
    const props = {};
    const variance = {};
    const provenance = {};
    for (const [prop, key] of Object.entries(PROP_KEYS)) {
      const base = zoneControlPoints(eWells, zdef.registryZone);
      const all = [];
      for (const cp of base) {
        const well = wells.find((w) => w.name === cp.well);
        const zone = (well?.zones || []).find((z) => z.name === zdef.registryZone);
        const v = zone?.properties?.[key];
        if (Number.isFinite(v)) all.push({ x: cp.x, y: cp.y, v, w: cp.w });
      }
      const byBlock = {};
      for (const p of all) {
        let lab = 0;
        for (let k = 0; k < polygons.length; k++) {
          if (pointInPolygon(p.x, p.y, polygons[k])) { lab = k + 1; break; }
        }
        (byBlock[lab] = byBlock[lab] || []).push(p);
      }
      const method = definition.methods?.[prop] || 'constant';
      // EM4: ordinary kriging with a fitted variogram and a variance grid
      const out = method === 'okrige'
        ? populateZonePropertyOk(spec, labels, byBlock, all, definition.krige || DEFAULT_KRIGE)
        : populateZoneProperty(spec, labels, byBlock, all, method, definition.krige || DEFAULT_KRIGE);
      props[prop] = out.z;
      if (out.variance) variance[prop] = out.variance;
      provenance[prop] = out.provenance;
    }
    const fluids = (definition.fluidsInput ? parseFluidsInput(definition.fluidsInput) : (definition.fluids || []))[i] || null;
    const top = framework.clamped[i];
    const base = framework.clamped[i + 1];
    const volumes = hasFluids(fluids)
      ? zoneVolumesWithContacts(spec, top, base, labels, props, fluids)
      : zoneVolumes(spec, thickness, labels, props);
    const zone = { name: zdef.name, registryZone: zdef.registryZone, thickness, props, variance, provenance, volumes, fluids };
    zone.range = volumeRange(spec, zone, labels, fluids, top, base);
    return zone;
  });

  // T1 (EM-T1-002, -003): what the build should say out loud
  const fallbacks = [];
  for (const z of zones) {
    for (const [prop, rows] of Object.entries(z.provenance)) {
      for (const r of rows) if (r.fellBack) fallbacks.push({ zone: z.name, prop, block: r.block, used: r.methodUsed, wells: r.wells });
    }
  }
  const misties = ties.filter((t) => Number.isFinite(t.residualM) && Math.abs(t.residualM) > MISTIE_WARN_M);

  return { spec, crs, ...framework, clampMasks, labels, census, ties, zones, boundary, adjustment, fallbacks, misties };
}
