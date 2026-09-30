// Saved em_models definitions, one per release (Earth Modeling upgrade
// U1, PL5, 2026-09-30). Surface ids are written as "@<fixture name>" and
// resolved to the harness registry ids when seeded, so the same rows open
// in jest and on /dev/earth-modeling?saved=1. Shapes are copied from the
// code of each release: G8 (2026-07-14), EM0 to EM6 (2026-09-06), T1
// (2026-09-26, one `unit` for both contacts) and U1 (per-field units).

export const SAVED_MODELS = Object.freeze([
  {
    name: 'G8 model (2026-07)',
    release: 'G8',
    definition: {
      name: 'G8 model (2026-07)',
      surfaceIds: ['@TopA', '@TopB', '@BaseB'],
      topNames: ['TopA', 'TopB', 'BaseB'],
      zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
      faultPolygons: [{ name: 'Fault 1', vertices: [{ x: 975, y: 1975 }, { x: 1575, y: 1975 }, { x: 1575, y: 2430 }, { x: 1275, y: 2430 }, { x: 1275, y: 2975 }, { x: 975, y: 2975 }] }],
      methods: { phi: 'krige', sw: 'constant', ntg: 'trend' },
      krige: { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025 },
    },
  },
  {
    name: 'EM series model (2026-09-06)',
    release: 'EM0-EM6',
    definition: {
      name: 'EM series model (2026-09-06)',
      surfaceIds: ['@TopA', 'derived-em2-1', '@BaseB'],
      topNames: ['TopA', '', 'BaseB'],
      zones: [{ name: 'Upper', registryZone: 'A' }, { name: 'Lower', registryZone: 'B' }],
      faultPolygons: [],
      methods: { phi: 'okrige', sw: 'constant', ntg: 'constant' },
      krige: { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025, fit: true, detrend: true },
      frame: { cellM: '25', boundaryId: 'cult-lease-dev' },
      adjust: { enabled: true, radiusM: '' },
      derived: [{ id: 'derived-em2-1', name: 'Mid A-B', kind: 'proportional', sourceId: '@TopA', baseId: '@BaseB', fraction: 0.5 }],
    },
  },
  {
    name: 'T1 model with contacts (2026-09-26)',
    release: 'T1',
    definition: {
      name: 'T1 model with contacts (2026-09-26)',
      surfaceIds: ['@TopA', '@TopB', '@BaseB'],
      topNames: ['TopA', 'TopB', 'BaseB'],
      zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
      faultPolygons: [],
      methods: { phi: 'constant', sw: 'constant', ntg: 'constant' },
      krige: { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025, fit: true, detrend: true },
      frame: { cellM: '', boundaryId: '' },
      adjust: { enabled: false, radiusM: '' },
      derived: [],
      fluids: [],
      fluidsInput: [{ goc: '5050', owc: '5200', bo: '1.25', bg: '', unit: 'ft' }, null],
    },
  },
  {
    name: 'U1 model, gas zone in field units (2026-09-30)',
    release: 'U1',
    definition: {
      name: 'U1 model, gas zone in field units (2026-09-30)',
      surfaceIds: ['@TopA', '@TopB'],
      topNames: ['TopA', 'TopB'],
      zones: [{ name: 'Gas sand', registryZone: 'A' }],
      faultPolygons: [],
      methods: { phi: 'constant', sw: 'constant', ntg: 'constant' },
      krige: { model: 'spherical', range: 900, sill: 0.0025, nugget: 0.00025, fit: true, detrend: true },
      frame: { cellM: '', boundaryId: '' },
      adjust: { enabled: false, radiusM: '' },
      derived: [],
      fluids: [],
      fluidsInput: [{ owc: '5250', owcUnit: 'ft', bg: '0.8', bgUnit: 'RB/Mscf' }],
    },
  },
]);

/** Replace "@Name" surface references with the ids of the rows of that name. */
export function resolveSavedModel(model, surfaces) {
  const idOf = (v) => (typeof v === 'string' && v.startsWith('@') ? (surfaces.find((s) => s.name === v.slice(1))?.id || v) : v);
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
    return idOf(x);
  };
  return { ...model, definition: walk(model.definition) };
}
