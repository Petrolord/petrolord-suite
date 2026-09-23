/**
 * Tops to Horizons, main-thread service: wells in the pipeline's shape,
 * logs for the automatic tie, the field's stratigraphic order, and saving
 * accepted horizons and faults with their provenance.
 */
import {
  pipelineWells, loadTieLogs, fieldTopOrder, freeName, saveFramework, saveAutoFaults,
} from '../services/topsToHorizons';

const well = (over = {}) => ({
  id: 'w1',
  name: 'W-1',
  surfaceX: 1,
  surfaceY: 2,
  kbM: 25,
  tops: [{ name: 'A', md: 700 }, { name: 'B', md: 900 }],
  checkshots: [{ tvdss_m: 0, twt_ms: 0 }, { tvdss_m: 1000, twt_ms: 900 }],
  checkshots_derived: null,
  deviation: [],
  path: [{ md: 0 }, { md: 1800 }],
  ...over,
});

test('pipeline wells: effective checkshots win when a tie was committed, TD from the path', () => {
  const tied = well({ checkshots_derived: { rows: [{ tvdss_m: 0, twt_ms: 0 }, { tvdss_m: 1000, twt_ms: 890 }] } });
  const [a, b] = pipelineWells([well(), tied], new Map([['w1', { md: [1], dtUsPerM: [2], rho: null }]]));
  expect(a).toMatchObject({ tdMdM: 1800, checkshotsDerived: false, logs: { md: [1] } });
  expect(a.checkshots[1].twt_ms).toBe(900);
  expect(b.checkshotsDerived).toBe(true);
  expect(b.checkshots[1].twt_ms).toBe(890);
  expect(a.tops).toEqual([{ name: 'A', md: 700 }, { name: 'B', md: 900 }]);
});

test('tie logs: sonic and density on a regular grid, the depth curve for an irregular one, null without a sonic', async () => {
  const logs = {
    w1: [
      { id: 's', mnemonic: 'DT', start_md_m: 100, step_m: 0.5 },
      { id: 'r', mnemonic: 'RHOB', start_md_m: 100, step_m: 0.5 },
    ],
    w2: [
      { id: 's2', mnemonic: 'DTC', start_md_m: null, step_m: null },
      { id: 'd2', mnemonic: 'DEPT', start_md_m: null, step_m: null },
    ],
    w3: [{ id: 'g', mnemonic: 'GR', start_md_m: 0, step_m: 1 }],
  };
  const curves = {
    s: Float32Array.from([300, 310, 320]),
    r: Float32Array.from([2.2, 2.3, 2.4]),
    s2: Float32Array.from([300, 305]),
    d2: Float32Array.from([10, 12.5]),
  };
  const out = await loadTieLogs([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], {
    listLogs: async (id) => logs[id],
    downloadCurve: async (l) => curves[l.id],
  });
  expect(Array.from(out.get('w1').md)).toEqual([100, 100.5, 101]);
  expect(Array.from(out.get('w1').rho)).toEqual([Math.fround(2.2), Math.fround(2.3), Math.fround(2.4)]);
  expect(Array.from(out.get('w2').md)).toEqual([10, 12.5]);
  expect(out.get('w2').rho).toBeNull();
  expect(out.get('w3')).toBeNull();
});

test('field order: the column first, then mean MD', () => {
  const wells = [
    { tops: [{ name: 'Deep', md: 2000, unitId: 'u2' }, { name: 'Shallow', md: 500 }, { name: 'Mid', md: 1200, unitId: 'u1' }] },
    { tops: [{ name: 'Shallow', md: 600 }, { name: 'Mid', md: 1300, unitId: 'u1' }] },
  ];
  // the column puts u2 above u1 (an overturned or reinterpreted section)
  expect(fieldTopOrder(wells, [{ id: 'u2' }, { id: 'u1' }])).toEqual(['Shallow', 'Deep', 'Mid']);
  expect(fieldTopOrder(wells)).toEqual(['Shallow', 'Mid', 'Deep']);
  expect(fieldTopOrder([])).toBeNull();
});

test('free names never overwrite an existing horizon', () => {
  const taken = new Set(['TOP_A', 'TOP_A (2)']);
  expect(freeName('TOP_A', taken)).toBe('TOP_A (3)');
  expect(freeName('TOP_B', taken)).toBe('TOP_B');
});

test('the accepted framework is saved named after the tops, with provenance', async () => {
  const calls = [];
  const saveHorizon = async (args) => { calls.push(args); return { id: `h${calls.length}`, name: args.name }; };
  const picks = new Float32Array(4);
  const conf = new Float32Array(4);
  const saved = await saveFramework({
    volume: { id: 'v' },
    dtUs: 4000,
    convention: { polarity: 'normal', phaseDeg: 0 },
    takenNames: new Set(['TOP_A']),
    saveHorizon,
    horizons: [
      {
        name: 'TOP_A', role: 'mapped', kind: 'peak', picks, confidence: conf,
        seeds: [{ well: 'W-1', il: 3, xl: 4, sample: 100.5, score: 0.9 }], jumps: [], stats: { tuned: 0 },
        lowo: { rmsMs: 1.2, reached: 5, n: 5, rows: [] },
      },
      {
        name: 'TOP_C2', role: 'conformable', representative: 'TOP_A', kind: null, picks, confidence: conf, seeds: [], jumps: [], stats: {},
      },
    ],
  });
  expect(calls.map((c) => c.name)).toEqual(['TOP_A (2)', 'TOP_C2']);
  expect(calls[0].seed).toEqual({ ilIdx: 3, xlIdx: 4, sample: 100.5 });
  expect(calls[0].params).toMatchObject({
    source: 'well_tops', top_name: 'TOP_A', role: 'mapped', mode: 'peak', lowo: { rmsMs: 1.2, reached: 5, n: 5 },
    tie_convention: { polarity: 'normal', phaseDeg: 0 },
  });
  expect(calls[1].params).toMatchObject({ role: 'conformable', representative: 'TOP_A', mode: 'peak' });
  expect(calls[1].seed).toBeNull();
  expect(saved[0].row.id).toBe('h1');
});

test('accepted automatic faults are saved with source auto and their confidence', async () => {
  const calls = [];
  await saveAutoFaults({
    volumeId: 'v',
    takenNames: new Set(['Auto-1']),
    saveFault: async (a) => { calls.push(a); return a; },
    faults: [{ name: 'Auto-1', sticks: [{ points: [] }], confidence: 0.6, stats: { voxels: 10 } }],
    aoi: { il0: 0 },
  });
  expect(calls[0]).toMatchObject({
    volumeId: 'v', name: 'Auto-1 (2)', params: { source: 'auto', confidence: 0.6, aoi: { il0: 0 } },
  });
});
