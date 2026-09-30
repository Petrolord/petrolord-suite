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
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';
import { maskOutsidePolygon, gridBBox, isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';
import { readDepthSurface } from '@/lib/readDepthSurface';
import { convert } from '@/lib/units/registry';
import { isPrePt9aZone } from '@/lib/petroProvenance';

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
    zones: Array.isArray(d.zones) ? d.zones.filter(Boolean).map((z, i) => ({ name: z.name || `Zone ${i + 1}`, registryZone: z.registryZone || '' })) : [],
    faultPolygons: Array.isArray(d.faultPolygons) ? d.faultPolygons.filter((p) => Array.isArray(p?.vertices)).map((p, i) => ({ ...p, name: p.name || `Fault ${i + 1}`, vertices: p.vertices.map(vert) })) : [],
    methods: { ...e.methods, ...(d.methods || {}) },
    krige: { ...e.krige, ...(d.krige || {}) },
    frame: { ...e.frame, ...(d.frame || {}) },
    adjust: { ...e.adjust, ...(d.adjust || {}) },
    derived: Array.isArray(d.derived) ? d.derived : [],
    fluids: Array.isArray(d.fluids) ? d.fluids : [],
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
    if (out.bg !== null && out.bo === null && out.goc === null) {
      out.gasZone = true;
      notes.push(`Zone ${i + 1}: Bg with no Bo and no GOC, so the zone is gas from its top down to ${out.owc === null ? 'its base' : 'the contact'}.`);
    }
    if (notes.length) out.notes = notes;
    return out;
  });
}

/** Engine fluids for a zone: a gas zone puts the GOC at the contact (or deeper than any node). */
export function engineFluids(f) {
  if (!f) return f;
  const { notes, gasZone, ...rest } = f;
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
  kb_m: w.kb_m || 0,
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
export function contactEdgeReport(spec, top, fluids) {
  const contact = fluids && Number.isFinite(fluids.owc) ? fluids.owc : null;
  if (!Number.isFinite(contact)) return { open: null, nodes: 0 };
  const { nx, ny } = spec;
  let nodes = 0;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const j = r * nx + c;
      const v = top[j];
      if (isNull(v) || v >= contact) continue;
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
  const name = `${modelName} · ${zoneName} ${isVar ? `${layer.slice(0, -4)} variance` : layer}`;
  return {
    name,
    kind,
    spec: built.spec,
    crs: built.crs || null,
    xyUnit: built.xyUnit || null,
    zDomain: kind === 'attribute' ? 'attribute' : 'depth',
    zUnit: kind === 'attribute' ? (isVar ? 'fraction^2' : 'fraction') : 'm',
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
  const totalSteps = (definition.surfaceIds || []).length + 1 + nZones * 4;
  let step = 0;
  const progress = (label) => {
    if (signal?.aborted) throw new BuildCancelled();
    step += 1;
    if (onProgress) onProgress({ label, step: Math.min(step, totalSteps), total: totalSteps, fraction: Math.min(1, step / totalSteps) });
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
  const specM = modelFrame(specOfRow(stack[0]), definition.frame?.cellM);
  const spec = scaleSpec(specM, 1 / k);
  if (stack[0].rotation_deg) notes.push(`The top surface is rotated ${stack[0].rotation_deg} degrees; the model frame is its unrotated extent.`);

  // wells: a well in another known CRS cannot be placed on this frame
  const modelTag = crs ? normalizeTag(crs) : null;
  const skipped = [];
  const placed = [];
  for (const w of wells || []) {
    const t = normalizeTag(w.crs);
    if (modelTag && isTransformableTag(t) && t !== modelTag) skipped.push(`${w.name} (${t})`);
    else placed.push(w);
  }
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
  let resampled = resampleStack(grids.map((z, i) => ({ z, spec: specOfRow(stack[i]) })), specM);
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
  const thickness = [];
  for (let i = 0; i + 1 < clamped.length; i++) thickness.push(zoneThickness(clamped[i], clamped[i + 1]));
  progress('Framework stacked and clamped');
  const framework = { grids: resampled, clamped, counts, thickness };

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

  const ties = wellTies(eWells, framework.clamped, specM, surfIndexByTop).map((t) => {
    const before = adjustment?.tiesBefore.find((b) => b.well === t.well && b.top === t.top);
    const native = { ...t, x: t.x / k, y: t.y / k };
    return before ? { ...native, residualBeforeM: before.residualM } : native;
  });

  const totalPhi = [];
  const propertyClamps = [];
  const parsedFluids = definition.fluidsInput ? parseFluidsInput(definition.fluidsInput) : (definition.fluids || []);
  for (const f of parsedFluids) for (const n of f?.notes || []) notes.push(n);
  const zones = (definition.zones || []).map((zdef, i) => {
    const zThickness = framework.thickness[i];
    const props = {};
    const variance = {};
    const provenance = {};
    for (const [prop, key] of Object.entries(PROP_KEYS)) {
      const base = zoneControlPoints(eWells, zdef.registryZone);
      const all = [];
      for (const cp of base) {
        const well = placed.find((w) => w.name === cp.well);
        const zone = (well?.zones || []).find((z) => z.name === zdef.registryZone);
        const v = zone?.properties?.[key];
        if (Number.isFinite(v)) all.push({ x: cp.x, y: cp.y, v, w: cp.w });
        // PETRO-U2-013: a pre-PT9a Studio summary's phi_avg is total porosity
        if (prop === 'phi' && Number.isFinite(v) && isPrePt9aZone(zone.properties)) totalPhi.push({ zone: zdef.name, well: cp.well });
      }
      const byBlock = {};
      for (const p of all) {
        let lab = 0;
        for (let q = 0; q < polygons.length; q++) {
          if (pointInPolygon(p.x, p.y, polygons[q])) { lab = q + 1; break; }
        }
        (byBlock[lab] = byBlock[lab] || []).push(p);
      }
      const method = definition.methods?.[prop] || 'constant';
      // EM4: ordinary kriging with a fitted variogram and a variance grid
      const out = method === 'okrige'
        ? populateZonePropertyOk(specM, labels, byBlock, all, definition.krige || DEFAULT_KRIGE)
        : populateZoneProperty(specM, labels, byBlock, all, method, definition.krige || DEFAULT_KRIGE);
      // EM-U1-005: a trend or kriging extrapolated past the wells stays a fraction
      const n = clampFractionGrid(out.z);
      if (n) propertyClamps.push({ zone: zdef.name, prop, nodes: n });
      props[prop] = out.z;
      if (out.variance) variance[prop] = out.variance;
      provenance[prop] = out.provenance;
      progress(`${zdef.name}: ${prop === 'phi' ? 'porosity' : prop === 'sw' ? 'Sw' : 'NTG'} populated`);
    }
    const fluids = parsedFluids[i] || null;
    const eng = engineFluids(fluids);
    const top = framework.clamped[i];
    const base = framework.clamped[i + 1];
    const volumes = hasFluids(fluids)
      ? zoneVolumesWithContacts(specM, top, base, labels, props, eng)
      : zoneVolumes(specM, zThickness, labels, props);
    const zone = { name: zdef.name, registryZone: zdef.registryZone, thickness: zThickness, props, variance, provenance, volumes, fluids };
    zone.range = volumeRange(specM, zone, labels, eng, top, base);
    zone.openEdge = contactEdgeReport(specM, top, fluids);
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

  return {
    spec, specM, xyToM: k, xyUnit, crs, ...framework, clampMasks, labels, census, ties, zones, boundary, adjustment,
    fallbacks, misties, totalPhi, propertyClamps, notes,
  };
}
