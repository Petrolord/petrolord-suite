/**
 * Survey affine geometry vs the oracle goldens (validation-first):
 *  - the least-squares fit recovers the exact affine truth from the
 *    header-coordinate grids segyio read, for every fixture including
 *    the rotated rectangular-bin one
 *  - ilxlToWorld reproduces every trace's header coordinates
 *  - the legacy corner fallback matches the old axis-aligned behavior
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { buildManifest } from '@/pages/apps/Seismolord/engine/manifest';
import {
  makeAffineFit,
  affineFitAdd,
  solveAffineFit,
  affineFromCorners,
  surveyAffine,
  affineToManifest,
  ilxlToWorld,
  worldToIlxl,
  cellSpacing,
  surveyBounds,
  gridAzimuthDeg,
  northDirInGrid,
} from '@/pages/apps/Seismolord/engine/surveyGeometry';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const blobToFloat64 = (blob) => {
  expect(blob.dtype).toBe('float64le');
  const bytes = Buffer.from(blob.base64, 'base64');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(blob.sha256);
  return new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8);
};

// dome_step: il/xl steps 2/3 + azimuth 180 (world coordinates DESCEND as
// line numbers ascend) — the L6 golden fixture
const VOLUMES = ['dome_ibm', 'dome_ieee', 'dome_oddbytes', 'dome_rot', 'dome_step'];

/** Fit an affine from a golden's full coordinate grids. */
function fitFromGolden(golden) {
  const g = golden.geometry;
  const ilStep = g.il_step || 1;
  const xlStep = g.xl_step || 1;
  const cx = blobToFloat64(golden.coord_grids.x);
  const cy = blobToFloat64(golden.coord_grids.y);
  const fit = makeAffineFit();
  for (let i = 0; i < g.n_il; i++) {
    for (let j = 0; j < g.n_xl; j++) {
      affineFitAdd(fit, g.ilines[0] + i * ilStep, g.xlines[0] + j * xlStep,
        cx[i * g.n_xl + j], cy[i * g.n_xl + j]);
    }
  }
  return solveAffineFit(fit, {
    ilMin: g.ilines[0], ilStep, xlMin: g.xlines[0], xlStep,
  });
}

describe.each(VOLUMES)('affine fit vs oracle truth: %s', (name) => {
  const golden = loadGolden(name);
  const aff = fitFromGolden(golden);

  test('fit recovers the exact affine within coordinate-scalar rounding', () => {
    // headers store centimetres (scalar -100); the LS fit averages the
    // rounding down well below one cm per vector component
    const t = golden.affine_truth;
    expect(aff).not.toBeNull();
    expect(Math.abs(aff.origin.x - t.origin.x)).toBeLessThan(0.01);
    expect(Math.abs(aff.origin.y - t.origin.y)).toBeLessThan(0.01);
    for (const [ours, truth] of [[aff.ilVec, t.il_vec], [aff.xlVec, t.xl_vec]]) {
      expect(Math.abs(ours.x - truth.x)).toBeLessThan(0.002);
      expect(Math.abs(ours.y - truth.y)).toBeLessThan(0.002);
    }
    expect(aff.fit.rmsM).toBeLessThan(0.01); // cm-rounding noise only
  });

  test('ilxlToWorld reproduces every header coordinate', () => {
    const g = golden.geometry;
    const cx = blobToFloat64(golden.coord_grids.x);
    const cy = blobToFloat64(golden.coord_grids.y);
    let maxErr = 0;
    for (let i = 0; i < g.n_il; i++) {
      for (let j = 0; j < g.n_xl; j++) {
        const w = ilxlToWorld(aff, i, j);
        maxErr = Math.max(maxErr,
          Math.abs(w.x - cx[i * g.n_xl + j]), Math.abs(w.y - cy[i * g.n_xl + j]));
      }
    }
    expect(maxErr).toBeLessThan(0.02); // header cm rounding + fit residual
  });

  test('worldToIlxl inverts ilxlToWorld', () => {
    const w = ilxlToWorld(aff, 7, 11);
    const g = worldToIlxl(aff, w.x, w.y);
    expect(g.i).toBeCloseTo(7, 6);
    expect(g.j).toBeCloseTo(11, 6);
  });

  test('cell spacing matches the model bins', () => {
    const s = cellSpacing(aff);
    expect(s.xl).toBeCloseTo(golden.geometry.bin_m, 2);
    expect(s.il).toBeCloseTo(golden.geometry.il_bin_m, 2);
  });

  test('grid azimuth matches the model', () => {
    // normalize both to [0, 360)
    const got = ((gridAzimuthDeg(aff) % 360) + 360) % 360;
    expect(got).toBeCloseTo(golden.geometry.azimuth_deg, 2);
  });
});

describe('rotated-survey specifics (dome_rot)', () => {
  const golden = loadGolden('dome_rot');
  const aff = fitFromGolden(golden);

  test('the legacy two-corner derivation is provably wrong here', () => {
    // this is the recorded bug rotation support fixes: first->last corner
    // deltas divided by counts have nothing to do with the real 25 m bins
    const legacy = affineFromCorners({
      corners: {
        first: golden.corner_coords.first,
        last: golden.corner_coords.last,
      },
      il: { count: golden.geometry.n_il },
      xl: { count: golden.geometry.n_xl },
    });
    const s = cellSpacing(legacy);
    expect(Math.abs(s.xl - golden.geometry.bin_m)).toBeGreaterThan(20);
  });

  test('north direction in grid space matches the 30 deg rotation', () => {
    // world +Y decomposes into grid steps via the exact inverse of the
    // affine truth; compare against northDirInGrid's normalized answer
    const n = northDirInGrid(aff);
    const t = golden.affine_truth;
    const det = t.il_vec.x * t.xl_vec.y - t.il_vec.y * t.xl_vec.x;
    const di = -t.xl_vec.x / det;
    const dj = t.il_vec.x / det;
    const len = Math.hypot(di, dj);
    expect(n.di).toBeCloseTo(di / len, 4);
    expect(n.dj).toBeCloseTo(dj / len, 4);
  });

  test('surveyBounds covers the rotated footprint', () => {
    const b = surveyBounds(aff, golden.geometry.n_il, golden.geometry.n_xl);
    for (const c of Object.values(golden.corner_coords)) {
      expect(c.x).toBeGreaterThanOrEqual(b.x0 - 0.02);
      expect(c.x).toBeLessThanOrEqual(b.x1 + 0.02);
      expect(c.y).toBeGreaterThanOrEqual(b.y0 - 0.02);
      expect(c.y).toBeLessThanOrEqual(b.y1 + 0.02);
    }
  });
});

describe('scanGeometry -> manifest affine (end-to-end on real SEG-Y bytes)', () => {
  const readerFor = (name) => {
    const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
    return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };

  test('scanning the rotated fixture measures the true affine', async () => {
    const golden = loadGolden('dome_rot');
    const scan = await scanGeometry(readerFor('dome_rot'));
    expect(scan.affine).not.toBeNull();
    const t = golden.affine_truth;
    expect(Math.abs(scan.affine.origin.x - t.origin.x)).toBeLessThan(0.01);
    expect(Math.abs(scan.affine.origin.y - t.origin.y)).toBeLessThan(0.01);
    expect(Math.abs(scan.affine.ilVec.x - t.il_vec.x)).toBeLessThan(0.002);
    expect(Math.abs(scan.affine.ilVec.y - t.il_vec.y)).toBeLessThan(0.002);
    expect(Math.abs(scan.affine.xlVec.x - t.xl_vec.x)).toBeLessThan(0.002);
    expect(Math.abs(scan.affine.xlVec.y - t.xl_vec.y)).toBeLessThan(0.002);
    // clean synthetic coordinates: no grid-deviation warning
    expect(scan.warnings.filter((w) => w.includes('deviate'))).toEqual([]);

    const manifest = buildManifest({
      volumeId: 'v-test', name: 'dome_rot', scan,
      transcode: {
        brickGrid: { brickSize: 64, ni: 1, nj: 1, nk: 1 },
        stats: {}, traceCount: 256,
      },
      sourceFileName: 'dome_rot.sgy', sourceFileSize: 97808,
    });
    // JSON round-trip like storage does, then resolve
    const geo = JSON.parse(JSON.stringify(manifest)).geometry;
    const aff = surveyAffine(geo);
    expect(aff.fit.n).toBe(256);
    expect(cellSpacing(aff).xl).toBeCloseTo(25, 2);
    expect(cellSpacing(aff).il).toBeCloseTo(37.5, 2);
    expect(aff.legacyAxisAligned).toBeUndefined();
  });

  test('unrotated fixture still scans and yields an axis-aligned affine', async () => {
    const scan = await scanGeometry(readerFor('dome_ieee'));
    expect(scan.affine).not.toBeNull();
    expect(Math.abs(scan.affine.ilVec.x)).toBeLessThan(1e-6);
    expect(Math.abs(scan.affine.xlVec.y)).toBeLessThan(1e-6);
    expect(cellSpacing(scan.affine).xl).toBeCloseTo(25, 3);
    expect(cellSpacing(scan.affine).il).toBeCloseTo(25, 3);
  });
});

describe('legacy fallback + manifest round-trip', () => {
  test('affineFromCorners reproduces the old axis-aligned mapping', () => {
    const geometry = {
      corners: { first: { x: 500000, y: 6700000 }, last: { x: 500775, y: 6700775 } },
      il: { count: 32 }, xl: { count: 32 },
    };
    const aff = affineFromCorners(geometry);
    expect(aff.legacyAxisAligned).toBe(true);
    // exactly the previous picksToPoints arithmetic
    const w = ilxlToWorld(aff, 3, 5);
    expect(w.x).toBe(500000 + 5 * (775 / 31));
    expect(w.y).toBe(6700000 + 3 * (775 / 31));
    expect(gridAzimuthDeg(aff)).toBe(0);
  });

  test('surveyAffine prefers the measured affine over corners', () => {
    const geometry = {
      corners: { first: { x: 0, y: 0 }, last: { x: 31, y: 31 } },
      il: { count: 32 }, xl: { count: 32 },
      affine: {
        origin: { x: 10, y: 20 },
        il_vec: { x: -1, y: 2 },
        xl_vec: { x: 2, y: 1 },
        fit: { n: 1024, rms_m: 0.004 },
      },
    };
    const aff = surveyAffine(geometry);
    expect(aff.origin).toEqual({ x: 10, y: 20 });
    expect(aff.ilVec).toEqual({ x: -1, y: 2 });
    expect(aff.fit.rmsM).toBe(0.004);
    // and the manifest form round-trips
    expect(affineToManifest(aff)).toEqual(geometry.affine);
  });

  test('degenerate inputs return null', () => {
    // single inline: covariance in il vanishes
    const f = makeAffineFit();
    for (let j = 0; j < 8; j++) affineFitAdd(f, 100, 200 + j, j * 25, 0.5 * j);
    expect(solveAffineFit(f, { ilMin: 100, ilStep: 1, xlMin: 200, xlStep: 1 })).toBeNull();
    // too few points
    const f2 = makeAffineFit();
    affineFitAdd(f2, 1, 1, 0, 0); // (0,0) skipped as missing
    affineFitAdd(f2, 1, 2, 25, 0);
    expect(solveAffineFit(f2, { ilMin: 1, ilStep: 1, xlMin: 1, xlStep: 1 })).toBeNull();
    expect(surveyAffine(undefined)).toBeNull();
    expect(affineFromCorners({ corners: {} })).toBeNull();
  });
});
