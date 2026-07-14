// Model build glue (Earth Modeling G8.2): a model DEFINITION (small,
// persistable jsonb — surface ids, zone table, fault polygons,
// methods) plus registry data in -> the full computed model out, via
// the oracle-validated engine. Grids are deterministic outputs and are
// recomputed on load, never blobbed (plan decision 2). Pure except for
// backend.downloadSurfaceGrid.

import { buildFramework } from '../engine/framework';
import { labelBlocks, blockCensus, pointInPolygon, validatePolygon } from '../engine/blocks';
import { wellTies, zoneControlPoints } from '../engine/wellties';
import { populateZoneProperty } from '../engine/properties';
import { zoneVolumes } from '../engine/volumes';

/** Registry property keys for the three populated properties. */
export const PROP_KEYS = { phi: 'phi_avg', sw: 'sw_avg', ntg: 'ntg' };

export const DEFAULT_KRIGE = { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025 };

/** A fresh, empty model definition. */
export const emptyDefinition = () => ({
  name: 'New model',
  surfaceIds: [],
  topNames: [],
  zones: [],
  faultPolygons: [],
  methods: { phi: 'constant', sw: 'constant', ntg: 'constant' },
  krige: { ...DEFAULT_KRIGE },
});

export const specOf = (s) => ({ x0: s.origin_x, y0: s.origin_y, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny });

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
  const stack = definition.surfaceIds.map((id) => {
    const s = surfaces.find((x) => x.id === id);
    if (!s) throw new Error('A stacked surface is no longer in the registry — remove it from the stack.');
    return s;
  });
  if (stack.length < 2) throw new Error('A framework needs at least 2 surfaces (top and base).');
  (definition.faultPolygons || []).forEach((p) => validatePolygon(p.vertices));

  const grids = await Promise.all(stack.map((s) => backend.downloadSurfaceGrid(s)));
  const spec = specOf(stack[0]); // v1: the model frame is the TOP surface's frame
  const framework = buildFramework(grids.map((z, i) => ({ z, spec: specOf(stack[i]) })), spec);

  const polygons = (definition.faultPolygons || []).map((p) => p.vertices);
  const labels = polygons.length ? labelBlocks(spec, polygons) : null;
  const census = labels ? blockCensus(labels) : { 0: spec.nx * spec.ny };

  const eWells = wells.map(engineWell);
  const surfIndexByTop = {};
  (definition.topNames || []).forEach((topName, i) => {
    if (topName) surfIndexByTop[topName] = i;
  });
  const ties = wellTies(eWells, framework.clamped, spec, surfIndexByTop);

  const zones = (definition.zones || []).map((zdef, i) => {
    const thickness = framework.thickness[i];
    const props = {};
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
      const out = populateZoneProperty(spec, labels, byBlock, all, method, definition.krige || DEFAULT_KRIGE);
      props[prop] = out.z;
      provenance[prop] = out.provenance;
    }
    const volumes = zoneVolumes(spec, thickness, labels, props);
    return { name: zdef.name, registryZone: zdef.registryZone, thickness, props, provenance, volumes };
  });

  return { spec, ...framework, labels, census, ties, zones };
}
