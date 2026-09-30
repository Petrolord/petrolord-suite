/**
 * @jest-environment node
 */
/**
 * SEIS-U1 PL10: the SEG-Y door and the lattice conversion at the tester's
 * survey size, on a GENERATED multi-GB-equivalent file (a reader that
 * synthesises headers on demand: 710 x 876 traces x 1,750 samples, IEEE,
 * 4,502,994,000 bytes, the Claredon shape), so nothing is written to disk.
 * Skipped unless SEIS_BENCH=1; timings are printed and recorded in
 * docs/upgrade/Seismolord-UPGRADE.md.
 */
import { scanGeometry } from '../engine/segyScan';
import { buildTraceIndex } from '../engine/traceIndex';
import { openSegyDoor, needsTraceLattice } from '../lib/segyDoor';

const RUN = process.env.SEIS_BENCH === '1';
const NIL = 710; const NXL = 876; const NS = 1750;
const TB = 240 + NS * 4;

/** Virtual SEG-Y; `skip(i, x)` removes traces (irregular outline). */
function virtualSegy({ skip = null } = {}) {
  const cells = [];
  for (let i = 0; i < NIL; i++) for (let x = 0; x < NXL; x++) if (!skip || !skip(i, x)) cells.push(i * NXL + x);
  const n = cells.length;
  const size = 3600 + n * TB;
  const header = new DataView(new ArrayBuffer(3600));
  header.setInt16(3216, 4000); header.setInt16(3220, NS); header.setInt16(3224, 5);
  header.setInt16(3254, 1); header.setUint8(3500, 1); header.setInt16(3502, 1);
  const traceHeader = (t, dv, at) => {
    const c = cells[t]; const i = Math.floor(c / NXL); const x = c % NXL;
    dv.setInt32(at + 188, 42 + i); dv.setInt32(at + 192, 14 + x); dv.setInt16(at + 70, -100);
    dv.setInt32(at + 180, (403426 + x * 25) * 100); dv.setInt32(at + 184, (28018 + i * 25) * 100);
    dv.setInt16(at + 88, 1); dv.setInt16(at + 114, NS); dv.setInt16(at + 116, 4000);
  };
  return {
    traces: n,
    size,
    async read(offset, length) {
      const out = new ArrayBuffer(length);
      const dv = new DataView(out);
      const u8 = new Uint8Array(out);
      if (offset < 3600) u8.set(new Uint8Array(header.buffer, offset, Math.min(3600 - offset, length)), 0);
      const first = Math.max(0, Math.floor((offset - 3600) / TB));
      for (let t = first; t < n; t++) {
        const start = 3600 + t * TB;
        if (start >= offset + length) break;
        if (start >= offset && start + 240 <= offset + length) traceHeader(t, dv, start - offset);
        else if (start + 240 > offset && start < offset + length) {
          const tmp = new DataView(new ArrayBuffer(240)); traceHeader(t, tmp, 0);
          for (let b = 0; b < 240; b++) {
            const o = start + b - offset;
            if (o >= 0 && o < length) u8[o] = tmp.getUint8(b);
          }
        }
      }
      return out;
    },
  };
}

const ms = (t0) => Math.round(performance.now() - t0);

(RUN ? describe : describe.skip)('PL10 at the tester survey size (SEIS_BENCH=1)', () => {
  test('regular survey: door, preview scan; irregular: the lattice pass the conversion now runs', async () => {
    const out = {};
    const reg = virtualSegy();
    expect(reg.size).toBe(4502994000);
    let t0 = performance.now();
    const raw = await scanGeometry(reg, {}, { maxTraces: 20000 });
    out.previewScanRawMs = ms(t0);
    t0 = performance.now();
    const { reader, door } = await openSegyDoor(reg);
    out.doorInspectMs = ms(t0);
    expect(reader).toBe(reg);              // a clean file reads through untouched
    expect(door.warnings).toEqual([]);
    t0 = performance.now();
    const scan = await scanGeometry(reader, {}, { maxTraces: 20000 });
    out.previewScanDoorMs = ms(t0);
    expect(scan.il.count).toBe(710);
    expect(needsTraceLattice(scan)).toBe(false);
    expect(raw.il).toEqual(scan.il);

    // irregular outline: 6 % of the bins empty in two corner triangles
    const irr = virtualSegy({ skip: (i, x) => i + x < 250 || (NIL - i) + (NXL - x) < 60 });
    const ir = await openSegyDoor(irr);
    const iscan = await scanGeometry(ir.reader, {}, { maxTraces: 20000 });
    expect(needsTraceLattice(iscan)).toBe(true);
    t0 = performance.now();
    const index = await buildTraceIndex(ir.reader, {}, { forceLattice: true });
    out.latticePassMs = ms(t0);
    out.deadTraces = index.deadTraces;
    out.latticeBytes = index.lattice.byteLength;
    expect(index.il.count).toBe(710);
    expect(index.deadTraces).toBe(710 * 876 - irr.traces);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out));
  }, 1800000);
});
