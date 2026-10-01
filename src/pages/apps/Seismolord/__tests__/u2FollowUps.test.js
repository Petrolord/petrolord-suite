/**
 * U2-017 small follow-ups: the co-render overlay in sessions, the fault
 * version chain, true-north dip azimuth, delete-undo under the same id,
 * and published pay zones on the well track. (Cube co-render is proven in
 * the browser: e2e/seismolord-u2.spec.js.)
 */
import fs from 'fs';
import path from 'path';
import { captureOverlay, overlayRestorePlan } from '../lib/sessionSnapshot';
import { rotateAffineBearing, surveyConvergence, affineForNorth } from '../lib/northReference';
import { mapGradientTransform, northAzimuth } from '../engine/structureAttributes';
import { payIntervals, payMask } from '../lib/wellDisplay';
import { convergenceAt, toLonLat } from '@/lib/crs';

const mockCalls = [];
let mockRows = [];
jest.mock('@/lib/customSupabaseClient', () => {
  const chain = (table) => {
    const q = { table, filters: [] };
    const b = {
      select: () => b,
      eq: (c, v) => { q.filters.push(['eq', c, v]); return b; },
      in: (c, v) => { q.filters.push(['in', c, v]); return b; },
      not: (c, op, v) => { q.filters.push(['not', c, op, v]); return b; },
      order: () => Promise.resolve({ data: mockRows, error: null }),
      insert: (payload) => { mockCalls.push(['insert', table, payload]); return { select: () => ({ single: () => Promise.resolve({ data: { ...payload, id: payload.id || 'new-id' }, error: null }) }) }; },
      update: (payload) => { mockCalls.push(['update', table, payload]); return { eq: (c, v) => { mockCalls.push(['update-eq', c, v]); return Promise.resolve({ error: null }); } }; },
      delete: () => ({ in: (c, v) => { mockCalls.push(['delete', table, v]); return Promise.resolve({ error: null }); } }),
    };
    return b;
  };
  return {
    supabase: {
      from: (t) => chain(t),
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } }, error: null }) },
      storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
    },
  };
});

// eslint-disable-next-line import/first
import {
  listFaults, saveFaultVersion, faultChainOf, deleteFault, saveFault,
} from '../services/faultsService';
// eslint-disable-next-line import/first
import { saveHorizon } from '../services/horizonsService';

beforeEach(() => { mockCalls.length = 0; mockRows = []; });

describe('co-render overlay in sessions', () => {
  test('captured with the session, restored onto a same-lattice candidate', () => {
    const o = captureOverlay({ volumeId: 'v-env', colormap: 'magma', opacity: 1.7, blend: 'multiply' });
    expect(o).toEqual({ volume_id: 'v-env', colormap: 'magma', opacity: 1, blend: 'multiply' });
    expect(captureOverlay({ volumeId: null })).toBeNull();
    expect(overlayRestorePlan(o, [{ id: 'v-env' }], ['magma'])).toEqual({ select: 'v-env', colormap: 'magma', opacity: 1, blend: 'multiply' });
    expect(overlayRestorePlan({ ...o, colormap: 'nope', blend: 'x' }, [{ id: 'v-env' }], ['magma'])).toMatchObject({ colormap: null, blend: 'mix' });
  });

  test('a gone overlay volume is said, sessions saved before U2-017 restore with it off', () => {
    expect(overlayRestorePlan({ volume_id: 'gone' }, [{ id: 'v-env' }]).problem).toMatch(/no longer on this survey/);
    const dir = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'seis', 'saved');
    const sessions = fs.readdirSync(dir).filter((f) => /session/i.test(f));
    expect(sessions.length).toBeGreaterThan(0);
    for (const f of sessions) {
      const payload = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(overlayRestorePlan((payload.payload || payload).overlay, [])).toBeNull();
    }
  });
});

describe('fault version chain (W4.3 columns, no schema change)', () => {
  test('a new version: version + 1, parent link, the old head archived', async () => {
    const f = {
      id: 'f1', volume_id: 'v1', name: 'F1', version: 2, sticks: [{ points: [{ il: 1, xl: 1, s: 1 }, { il: 1, xl: 2, s: 9 }] }], params: { a: 1 },
    };
    const head = await saveFaultVersion({ fault: f });
    const ins = mockCalls.find((c) => c[0] === 'insert')[2];
    expect(ins).toMatchObject({ version: 3, parent_version_id: 'f1', name: 'F1', volume_id: 'v1' });
    expect(mockCalls.find((c) => c[0] === 'update')[2].archived_at).toEqual(expect.any(String));
    expect(mockCalls.find((c) => c[0] === 'update-eq')).toEqual(['update-eq', 'id', 'f1']);
    expect(head.version).toBe(3);
  });

  test('restore puts the old sticks into a new head; the chain walks back; heads exclude archived rows', async () => {
    const v1 = { id: 'a', version: 1, sticks: [{ points: [] }] };
    const v2 = { id: 'b', version: 2, parent_version_id: 'a' };
    const head = { id: 'c', version: 3, parent_version_id: 'b', volume_id: 'v1', name: 'F', sticks: [] };
    expect(faultChainOf(head, [v1, v2]).map((v) => v.id)).toEqual(['b', 'a']);
    await saveFaultVersion({ fault: head, sticks: v1.sticks, params: { restored_from_version: 1 } });
    expect(mockCalls.find((c) => c[0] === 'insert')[2]).toMatchObject({ sticks: v1.sticks, version: 4, params: { restored_from_version: 1 } });
    mockRows = [{ id: 'c', user_id: 'u1' }, { id: 'b', user_id: 'u1', archived_at: '2026-10-01' }];
    expect((await listFaults('v1')).map((r) => r.id)).toEqual(['c']);
    await deleteFault(head, [v2, v1]);
    expect(mockCalls.find((c) => c[0] === 'delete')[2]).toEqual(['c', 'b', 'a']);
  });
});

describe('delete undo restores under the same id', () => {
  test('saveFault and saveHorizon take the original id', async () => {
    await saveFault({ volumeId: 'v1', name: 'F1', sticks: [], id: 'keep-me' });
    expect(mockCalls.find((c) => c[0] === 'insert')[2].id).toBe('keep-me');
    mockCalls.length = 0;
    await saveHorizon({
      volume: { id: 'v1', user_id: 'u1', storage_path: 'u1/v1' }, name: 'H', picks: new Float32Array([1, 2]), seed: null, params: {}, dtUs: 4000, id: 'h-keep',
    });
    expect(mockCalls.find((c) => c[0] === 'insert')[2].id).toBe('h-keep');
    // negative control: without an id a fresh one is made
    mockCalls.length = 0;
    await saveFault({ volumeId: 'v1', name: 'F2', sticks: [] });
    expect(mockCalls.find((c) => c[0] === 'insert')[2].id).toBeUndefined();
  });
});

describe('true-north dip azimuth', () => {
  const aff = { origin: { x: 700000, y: 6000000 }, ilVec: { x: -12.5, y: 21.65 }, xlVec: { x: 21.65, y: 12.5 } };

  test('rotating the affine by the convergence turns grid azimuths into true azimuths (the engine itself)', () => {
    const g = 1.8;
    const Tg = mapGradientTransform(aff);
    const Tt = mapGradientTransform(affineForNorth(aff, { reference: 'true', convergenceDeg: g }));
    for (const [p, q] of [[0.3, 0.1], [-0.2, 0.25], [0.05, -0.4]]) {
      const grid = northAzimuth(p, q, Tg);
      const truth = northAzimuth(p, q, Tt);
      const diff = ((grid - g - truth) % 360 + 540) % 360 - 180;
      expect(Math.abs(diff)).toBeLessThan(1e-9);
    }
    expect(affineForNorth(aff, null)).toBe(aff);
    expect(rotateAffineBearing(aff, 0)).toBe(aff);
  });

  test('UTM 31N: zero convergence on the central meridian; east of it the published first-order value', () => {
    const atCm = convergenceAt('EPSG:32631', 500000, 6000000);
    expect(Math.abs(atCm)).toBeLessThan(1e-6);
    const x = 700000; const y = 6000000;
    const { lon, lat } = toLonLat('EPSG:32631', x, y);
    const snyder = (lon - 3) * Math.sin((lat * Math.PI) / 180);   // gamma ~ dLon sin(lat), degrees
    const g = convergenceAt('EPSG:32631', x, y);
    expect(Math.abs(Math.abs(g) - Math.abs(snyder))).toBeLessThan(0.05);
    const c = surveyConvergence(aff, { nIl: 100, nXl: 100 }, (px, py) => convergenceAt('EPSG:32631', px, py));
    expect(Math.abs(c.centreDeg)).toBeGreaterThan(2);
    expect(c.spreadDeg).toBeGreaterThan(0);
    expect(c.spreadDeg).toBeLessThan(0.1);
  });
});

describe('pay zones on the well track', () => {
  const zones = [
    { name: 'Sand A', top_md_m: 1500, base_md_m: 1520, properties: { published_at: '2026-09-20', net_m: 12, ntg: 0.6 } },
    { name: 'Sand B', top_md_m: 1600, base_md_m: 1650, properties: { net_m: 30 } },            // not published
    { name: 'Shale', top_md_m: 1700, base_md_m: 1710, properties: { published_at: '2026-09-20', net_m: 0 } },
  ];
  test('only published zones with net pay; the mask follows MD', () => {
    const pay = payIntervals(zones);
    expect(pay).toEqual([{ name: 'Sand A', top: 1500, base: 1520, net: 12, ntg: 0.6 }]);
    const pts = [1490, 1500, 1510, 1520, 1530, 1620].map((md) => ({ md }));
    expect(Array.from(payMask(pts, pay))).toEqual([0, 1, 1, 1, 0, 0]);
    expect(Array.from(payMask(pts, []))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(payIntervals(null)).toEqual([]);
  });
});
