/**
 * Auto header-geometry detection: the importer must find inline/crossline
 * (and X/Y) byte positions on its own, so a non-expert never touches a
 * byte field. Covers the committed fixtures plus synthetic worst cases.
 */
import fs from 'fs';
import path from 'path';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import { detectHeaderMapping } from '@/pages/apps/Seismolord/engine/headerDetect';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');
const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));
const readerFor = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

/**
 * Build an inline-sorted IEEE volume with geometry at arbitrary byte
 * positions, to prove detection isn't hard-wired to 189/193.
 */
function buildVolume({
  nIl, nXl, ns = 8, ilByte, xlByte, xByte, yByte, scalar = -100,
  il0 = 1, xl0 = 1, x0 = 500000, y0 = 6700000, bin = 25, ilStep = 1, xlStep = 1,
  poison189 = null,
}) {
  const traceBytes = 240 + ns * 4;
  const buf = new ArrayBuffer(3600 + nIl * nXl * traceBytes);
  const view = new DataView(buf);
  view.setInt16(3200 + 16, 4000, false);
  view.setInt16(3200 + 20, ns, false);
  view.setInt16(3200 + 24, 5, false);         // IEEE
  let t = 0;
  for (let i = 0; i < nIl; i++) {
    for (let x = 0; x < nXl; x++) {
      const off = 3600 + t * traceBytes;
      view.setInt32(off + 0, t + 1, false);   // global trace counter at byte 1 (decoy)
      view.setInt16(off + 70, scalar, false); // coordinate scalar at byte 71
      view.setInt32(off + (ilByte - 1), il0 + i * ilStep, false);
      view.setInt32(off + (xlByte - 1), xl0 + x * xlStep, false);
      if (xByte) view.setInt32(off + (xByte - 1), (x0 + x * bin) * Math.abs(scalar), false);
      if (yByte) view.setInt32(off + (yByte - 1), (y0 + i * bin) * Math.abs(scalar), false);
      if (poison189 != null) {
        view.setInt32(off + 188, poison189, false);
        view.setInt32(off + 192, poison189, false);
      }
      for (let s = 0; s < ns; s++) view.setFloat32(off + 240 + s * 4, Math.sin(s + t), false);
      t += 1;
    }
  }
  return bufferReader(buf);
}

describe('detectHeaderMapping on the committed fixtures', () => {
  test('dome_ibm: finds inline/crossline at the rev1 default bytes', async () => {
    const g = loadGolden('dome_ibm').geometry;
    const d = await detectHeaderMapping(readerFor('dome_ibm'));
    expect(d.detected).toBe(true);
    expect(d.mapping.ilByte).toBe(g.il_byte);        // 189
    expect(d.mapping.xlByte).toBe(g.xl_byte);        // 193
    expect(d.coords).toEqual({ xByte: 181, yByte: 185 });
    expect(d.confidence).toBe('high');
  });

  test('dome_oddbytes: finds 9/21 and is NOT fooled by the constant poison at 189/193', async () => {
    const g = loadGolden('dome_oddbytes').geometry;
    const d = await detectHeaderMapping(readerFor('dome_oddbytes'));
    expect(d.detected).toBe(true);
    expect(d.mapping.ilByte).toBe(g.il_byte);        // 9
    expect(d.mapping.xlByte).toBe(g.xl_byte);        // 21
    // the detected mapping must produce a clean regular grid
    const scan = await scanGeometry(readerFor('dome_oddbytes'), d.mapping);
    expect(scan.regular).toBe(true);
    expect(scan.warnings).toEqual([]);
  });
});

describe('detectHeaderMapping on unusual layouts', () => {
  test('geometry at bytes 25/29 with coordinates at 73/77 is recovered', async () => {
    const reader = buildVolume({
      nIl: 20, nXl: 30, ilByte: 25, xlByte: 29, xByte: 73, yByte: 77,
      il0: 1000, xl0: 2000,
    });
    const d = await detectHeaderMapping(reader);
    expect(d.detected).toBe(true);
    expect(d.mapping.ilByte).toBe(25);
    expect(d.mapping.xlByte).toBe(29);
    expect(d.coords).toEqual({ xByte: 73, yByte: 77 });
    const scan = await scanGeometry(reader, d.mapping);
    expect(scan.regular).toBe(true);
    expect(scan.il).toEqual({ min: 1000, max: 1019, step: 1, count: 20 });
    expect(scan.xl).toEqual({ min: 2000, max: 2029, step: 1, count: 30 });
  });

  test('coordinate fields (large, sawtoothing eastings) are NOT mistaken for crossline', async () => {
    // CDP-X at 181 increments by the bin each crossline and resets each
    // line — the same sawtooth shape as crossline. Its large magnitude
    // must keep it out of the axis race.
    const reader = buildVolume({
      nIl: 15, nXl: 40, ilByte: 189, xlByte: 193, xByte: 181, yByte: 185,
      x0: 500000, y0: 6700000, bin: 25, scalar: 1,
    });
    const d = await detectHeaderMapping(reader);
    expect(d.detected).toBe(true);
    expect(d.mapping.ilByte).toBe(189);
    expect(d.mapping.xlByte).toBe(193);           // not 181
    expect(d.coords).toEqual({ xByte: 181, yByte: 185 });
  });

  test('non-unit crossline step (step 2) is measured correctly', async () => {
    const reader = buildVolume({
      nIl: 10, nXl: 20, ilByte: 9, xlByte: 13, xlStep: 2, xl0: 100,
    });
    const d = await detectHeaderMapping(reader);
    expect(d.detected).toBe(true);
    expect(d.mapping.ilByte).toBe(9);
    expect(d.mapping.xlByte).toBe(13);
    expect(d.xl.step).toBe(2);
  });
});

describe('detectHeaderMapping graceful failure', () => {
  test('empty trace headers → detected:false with a helpful note, default mapping', async () => {
    // geometry written NOWHERE (only the sample template + trace counter)
    const traceBytes = 240 + 8 * 4;
    const nTraces = 500;
    const buf = new ArrayBuffer(3600 + nTraces * traceBytes);
    const view = new DataView(buf);
    view.setInt16(3200 + 16, 4000, false);
    view.setInt16(3200 + 20, 8, false);
    view.setInt16(3200 + 24, 5, false);
    for (let t = 0; t < nTraces; t++) {
      view.setInt32(3600 + t * traceBytes, t + 1, false);   // only the counter
    }
    const d = await detectHeaderMapping(bufferReader(buf));
    expect(d.detected).toBe(false);
    expect(d.confidence).toBe('none');
    expect(d.note).toMatch(/manually|empty|unusual/i);
    expect(d.mapping.ilByte).toBe(189);           // safe default, UI takes over
  });
});
