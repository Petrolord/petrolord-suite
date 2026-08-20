/**
 * Horizon amplitude-map export: the workflow extracts the attribute
 * lattice (caller's brick extractor), then bilinearly RESAMPLES it
 * onto the structure export grid — exact on world-linear fields
 * (bilinear composed with the affine is closed-form), never a TPS fit.
 * Attribute surfaces are map-only in display and keep their physical
 * sign (no negative-down flip).
 */
import { gridHorizonAmplitude } from '@/pages/apps/Seismolord/services/surfaceWorkflow';
import { loadHorizonGrid } from '@/pages/apps/Seismolord/services/horizonsService';
import {
  surveyAffine, ilxlToWorld, surveyBounds,
} from '@/pages/apps/Seismolord/engine/surveyGeometry';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import {
  surfaceSectionGrid, loadSurfaceMapLayer,
} from '@/pages/apps/Seismolord/services/surfacesService';
import { downloadSurfaceGrid } from '@/lib/surfacesRegistry';

jest.mock('@/pages/apps/Seismolord/services/horizonsService', () => ({
  loadHorizonGrid: jest.fn(),
  listHorizons: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/surfacesRegistry', () => ({
  ...jest.requireActual('@/lib/surfacesRegistry'),
  downloadSurfaceGrid: jest.fn(),
}));

const NULL_F32 = Math.fround(NULL_VALUE);

// rotated 30-degree survey, 25 m il / 12.5 m xl bins
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const MANIFEST = {
  geometry: {
    il: { min: 100, step: 2, count: 21 },
    xl: { min: 200, step: 1, count: 31 },
    ns: 40,
    dt_us: 4000,
    affine: {
      origin: { x: 5000, y: 12000 },
      il_vec: { x: 25 * COS, y: 25 * SIN },
      xl_vec: { x: -12.5 * SIN, y: 12.5 * COS },
    },
  },
  brick: { size: 16, grid: [2, 2, 3] },
};
const GEOM = { nIl: 21, nXl: 31 };
const HORIZON = { id: 'h1', name: 'Dome Top', volume_id: 'v1' };

const fullPicks = () => {
  const p = new Float32Array(GEOM.nIl * GEOM.nXl);
  for (let c = 0; c < p.length; c++) p[c] = 12.5;
  return p;
};

/** Extractor stand-in: a field linear in WORLD coordinates, so the
 *  bilinear resample must reproduce it exactly at every live node. */
const linearExtract = (A, B, C, aff) => async (picks) => {
  const v = new Float32Array(picks.length).fill(NULL_F32);
  for (let i = 0; i < GEOM.nIl; i++) {
    for (let j = 0; j < GEOM.nXl; j++) {
      const cell = i * GEOM.nXl + j;
      if (picks[cell] === NULL_F32) continue;
      const w = ilxlToWorld(aff, i, j);
      v[cell] = A + B * w.x + C * w.y;
    }
  }
  return v;
};

describe('gridHorizonAmplitude', () => {
  test('resamples a world-linear amplitude field exactly; off-survey bbox nodes stay null', async () => {
    const aff = surveyAffine(MANIFEST.geometry);
    loadHorizonGrid.mockResolvedValue(fullPicks());
    const A = 0.4;
    const B = 3e-4;
    const C = -1.5e-4;
    const extract = jest.fn(linearExtract(A, B, C, aff));

    const { g, spec, live, vMin, vMax, xyzText } = await gridHorizonAmplitude({
      manifest: MANIFEST, horizon: HORIZON, extract,
    });

    // the extractor received the pick lattice and the requested attribute
    expect(extract).toHaveBeenCalledWith(expect.any(Float32Array), { mode: 'value', window: 0 });

    // spec matches the structure export's grid (default cell = xl bin)
    const b = surveyBounds(aff, GEOM.nIl, GEOM.nXl);
    expect(spec.dx).toBeCloseTo(12.5, 10);
    expect(spec.x0).toBeCloseTo(b.x0, 10);

    // exact (to f32) at every live node; the rotated survey's bbox
    // corners fall outside and must be null
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(spec.nx * spec.ny);
    let checked = 0;
    for (let r = 0; r < spec.ny; r++) {
      for (let c = 0; c < spec.nx; c++) {
        const v = g.z[r * spec.nx + c];
        if (v === NULL_F32) continue;
        const truth = A + B * (spec.x0 + c * spec.dx) + C * (spec.y0 + r * spec.dy);
        expect(v).toBeCloseTo(truth, 5);
        checked += 1;
      }
    }
    expect(checked).toBe(live);
    expect(vMin).toBeLessThan(vMax);
    // XYZ text is the writers' shape: x y value rows
    expect(xyzText.split('\n')[0].trim().split(/\s+/)).toHaveLength(3);
  });

  test('windowed mode forwards the window and an all-null extraction is a domain error', async () => {
    loadHorizonGrid.mockResolvedValue(fullPicks());
    const extract = jest.fn(async (picks) => new Float32Array(picks.length).fill(NULL_F32));
    await expect(gridHorizonAmplitude({
      manifest: MANIFEST, horizon: HORIZON, extract, mode: 'rms', window: 6,
    })).rejects.toThrow(/no live amplitude/i);
    expect(extract).toHaveBeenCalledWith(expect.any(Float32Array), { mode: 'rms', window: 6 });
  });

  test('W2.5: a second horizon loads its grid and reaches the extractor as picksB', async () => {
    const aff = surveyAffine(MANIFEST.geometry);
    const picksA = fullPicks();
    const picksB = fullPicks();
    picksB.fill(20);
    loadHorizonGrid.mockImplementation(async (h) => (h.id === 'h2' ? picksB : picksA));
    const extract = jest.fn(linearExtract(0.4, 3e-4, -1.5e-4, aff));
    await gridHorizonAmplitude({
      manifest: MANIFEST,
      horizon: HORIZON,
      horizonB: { id: 'h2', name: 'Dome Base', volume_id: 'v1' },
      extract,
      mode: 'rms',
    });
    expect(loadHorizonGrid).toHaveBeenCalledWith(expect.objectContaining({ id: 'h2' }));
    const opts = extract.mock.calls[0][1];
    expect(opts.mode).toBe('rms');
    expect(opts.picksB).toBe(picksB);
    expect(opts.freqHz).toBeUndefined();
  });

  test('W2.5: a frequency reaches the extractor for isofrequency maps', async () => {
    const aff = surveyAffine(MANIFEST.geometry);
    loadHorizonGrid.mockResolvedValue(fullPicks());
    const extract = jest.fn(linearExtract(0.4, 3e-4, -1.5e-4, aff));
    await gridHorizonAmplitude({
      manifest: MANIFEST, horizon: HORIZON, extract, mode: 'isofreq', window: 8, freqHz: 30,
    });
    expect(extract.mock.calls[0][1]).toEqual({ mode: 'isofreq', window: 8, freqHz: 30 });
  });

  test('a pre-aborted signal cancels before touching bricks', async () => {
    loadHorizonGrid.mockResolvedValue(fullPicks());
    const extract = jest.fn();
    const ctl = new AbortController();
    ctl.abort();
    await expect(gridHorizonAmplitude({
      manifest: MANIFEST, horizon: HORIZON, extract, signal: ctl.signal,
    })).rejects.toThrow('Export cancelled');
    expect(extract).not.toHaveBeenCalled();
  });

  test('null pick holes shadow the resample (no invented amplitudes)', async () => {
    const aff = surveyAffine(MANIFEST.geometry);
    const picks = fullPicks();
    picks[10 * GEOM.nXl + 15] = NULL_F32;
    loadHorizonGrid.mockResolvedValue(picks);
    const { live } = await gridHorizonAmplitude({
      manifest: MANIFEST, horizon: HORIZON, extract: linearExtract(1, 0, 0, aff),
    });
    const full = await (async () => {
      loadHorizonGrid.mockResolvedValue(fullPicks());
      return gridHorizonAmplitude({
        manifest: MANIFEST, horizon: HORIZON, extract: linearExtract(1, 0, 0, aff),
      });
    })();
    expect(live).toBeLessThan(full.live);
  });
});

describe('attribute surfaces in display services', () => {
  const attrRow = {
    z_domain: 'attribute', z_unit: 'amp', nx: 2, ny: 2, dx: 10, dy: 10, origin_x: 0, origin_y: 0,
  };

  test('surfaceSectionGrid: attribute surfaces are map-only (null, even with a converter)', () => {
    const layer = { values: new Float32Array([1, 2, 3, 4]), unit: 'amp' };
    const conv = { toTwtMs: () => 100 };
    expect(surfaceSectionGrid(attrRow, layer, { nIl: 2, nXl: 2, ns: 50 }, 4, conv)).toBeNull();
  });

  test('loadSurfaceMapLayer: attribute values keep their physical sign; structure flips', async () => {
    // identity-friendly affine: 10 m axis-aligned bins, lattice == grid
    const aff = {
      origin: { x: 0, y: 0 }, ilVec: { x: 0, y: 10 }, xlVec: { x: 10, y: 0 },
    };
    const geom = { nIl: 2, nXl: 2 };
    downloadSurfaceGrid.mockResolvedValue(new Float32Array([0.5, -0.25, 0.75, -1]));

    // with ilVec=(0,10)/xlVec=(10,0), cell (i,j) lands on grid (r=i,c=j):
    // the lattice reads back in stored order
    const amp = await loadSurfaceMapLayer({ ...attrRow, name: 'amp' }, aff, geom);
    expect(Array.from(amp.values)).toEqual([0.5, -0.25, 0.75, -1]); // sign kept
    expect(amp.unit).toBe('amp');

    const depthRow = { ...attrRow, z_domain: 'depth', z_unit: 'ft', name: 'struct' };
    downloadSurfaceGrid.mockResolvedValue(new Float32Array([-6000, -6100, -6200, -6300]));
    const st = await loadSurfaceMapLayer(depthRow, aff, geom);
    expect(Array.from(st.values)).toEqual([6000, 6100, 6200, 6300]); // flipped positive-down
    expect(st.unit).toBe('ft');
  });
});
