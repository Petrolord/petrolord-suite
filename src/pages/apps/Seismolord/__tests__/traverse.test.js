/**
 * Traverse lines: ground-distance resampling (through the survey
 * affine, incl. the rotated rectangular-bin fixture) and bit-identical
 * section assembly against the segyio golden traces.
 */
import fs from 'fs';
import path from 'path';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';
import { buildManifest } from '@/pages/apps/Seismolord/engine/manifest';
import { geomFromManifest } from '@/pages/apps/Seismolord/engine/sliceAssembly';
import { resampleTraverse, assembleTraverse } from '@/pages/apps/Seismolord/engine/traverse';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const readerFor = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

/** Transcode a fixture, returning {manifest, geom, getBrick}. */
async function brickStore(name) {
  const reader = readerFor(name);
  const scan = await scanGeometry(reader);
  const bricks = new Map();
  const transcode = await transcodeToBricks(reader, scan, {
    onBrick: ({ i, j, k, data }) => bricks.set(`${i}-${j}-${k}`, data),
  });
  const manifest = buildManifest({
    volumeId: 'v-test', name, scan, transcode,
    sourceFileName: `${name}.sgy`, sourceFileSize: reader.size,
  });
  const geom = geomFromManifest(manifest);
  const getBrick = async (i, j, k) => bricks.get(`${i}-${j}-${k}`);
  return { manifest, geom, getBrick };
}

describe('resampleTraverse', () => {
  const golden = loadGolden('dome_rot');
  let manifest;
  let geom;
  beforeAll(async () => {
    ({ manifest, geom } = await brickStore('dome_rot'));
  });

  test('path along crosslines steps one 25 m bin per trace', () => {
    const r = resampleTraverse(
      [{ il: 5, xl: 0 }, { il: 5, xl: 15 }], geom, manifest.geometry,
    );
    expect(r.positions).toHaveLength(16);
    expect(r.positions[0]).toEqual({ il: 5, xl: 0 });
    expect(r.positions[15]).toEqual({ il: 5, xl: 15 });
    expect(r.stepM).toBeCloseTo(golden.geometry.bin_m, 1);       // 25 m
    expect(r.lengthM).toBeCloseTo(15 * golden.geometry.bin_m, 0); // rotation-true
  });

  test('path along inlines measures the 37.5 m il bin ground length', () => {
    const r = resampleTraverse(
      [{ il: 0, xl: 3 }, { il: 15, xl: 3 }], geom, manifest.geometry,
    );
    expect(r.lengthM).toBeCloseTo(15 * golden.geometry.il_bin_m, 0);
    expect(r.positions[0]).toEqual({ il: 0, xl: 3 });
    expect(r.positions[r.positions.length - 1]).toEqual({ il: 15, xl: 3 });
    expect(r.positions.every((p) => p.xl === 3)).toBe(true);
    // deduped and monotonic along the line
    for (let i = 1; i < r.positions.length; i++) {
      expect(r.positions[i].il).toBeGreaterThanOrEqual(r.positions[i - 1].il);
      expect(r.positions[i]).not.toEqual(r.positions[i - 1]);
    }
  });

  test('multi-segment path visits both leg directions', () => {
    const r = resampleTraverse(
      [{ il: 0, xl: 0 }, { il: 0, xl: 10 }, { il: 12, xl: 10 }], geom, manifest.geometry,
    );
    const last = r.positions[r.positions.length - 1];
    expect(r.positions[0]).toEqual({ il: 0, xl: 0 });
    expect(last).toEqual({ il: 12, xl: 10 });
    expect(r.lengthM).toBeCloseTo(10 * 25 + 12 * 37.5, 0);
  });

  test('vertices outside the survey clamp; degenerate paths return null', () => {
    const r = resampleTraverse(
      [{ il: -4, xl: -9 }, { il: 40, xl: 40 }], geom, manifest.geometry,
    );
    expect(r.positions[0]).toEqual({ il: 0, xl: 0 });
    expect(r.positions[r.positions.length - 1]).toEqual({ il: 15, xl: 15 });
    expect(resampleTraverse([{ il: 3, xl: 3 }], geom, manifest.geometry)).toBeNull();
    expect(resampleTraverse(
      [{ il: 3, xl: 3 }, { il: 3, xl: 3 }], geom, manifest.geometry,
    )).toBeNull();
  });

  test('no usable geometry falls back to lattice-unit steps (null stepM)', () => {
    const r = resampleTraverse([{ il: 0, xl: 0 }, { il: 0, xl: 8 }], geom, null);
    expect(r.positions).toHaveLength(9);
    expect(r.stepM).toBeNull();
    expect(r.lengthM).toBeNull();
  });
});

describe('assembleTraverse', () => {
  test.each(['dome_ieee', 'dome_rot'])(
    '%s: every traverse column is bit-identical to the golden trace',
    async (name) => {
      const golden = loadGolden(name);
      const { geom, getBrick } = await brickStore(name);
      const il0 = golden.geometry.ilines[0];
      const xl0 = golden.geometry.xlines[0];
      const positions = golden.traces.map((tr) => ({
        il: tr.il - il0, xl: tr.xl - xl0,
      }));
      const s = await assembleTraverse(getBrick, geom, positions);
      expect(s.width).toBe(geom.ns);
      expect(s.height).toBe(positions.length);
      for (let c = 0; c < positions.length; c++) {
        const col = s.data.subarray(c * geom.ns, (c + 1) * geom.ns);
        const truth = Float32Array.from(golden.traces[c].samples);
        expect(new Uint32Array(col.slice().buffer))
          .toEqual(new Uint32Array(truth.buffer));
      }
      // RMS: positive on live traces
      for (let c = 0; c < positions.length; c++) {
        expect(s.traceRms[c]).toBeGreaterThan(0);
      }
    },
  );
});
