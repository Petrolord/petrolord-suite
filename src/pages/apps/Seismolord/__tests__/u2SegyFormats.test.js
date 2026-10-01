/**
 * @jest-environment node
 */
/**
 * U2-009 through the Suite's import door and the real local-view path: the
 * files segyio 1.9 wrote in the integer formats and in little-endian byte
 * order (engines test-data/seismolord/segy_formats) scan to their true
 * geometry and every sample of every inline equals what segyio reads.
 * Negative control: without the door the engines refuse each of them.
 */
import fs from 'fs';
import path from 'path';
import { bufferReader } from '../engine/reader';
import { scanGeometry } from '../engine/segyScan';
import { openSegyDoor } from '../lib/segyDoor';
import { createSliceWorkerHandler } from '../sources/sliceWorkerHandler';

const DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'seismolord', 'segy_formats');
const G = JSON.parse(fs.readFileSync(path.join(DIR, 'goldens.json'), 'utf8'));
const bytesOf = (c) => { const b = fs.readFileSync(path.join(DIR, c.file)); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

function localView() {
  const waiters = new Map();
  const handler = createSliceWorkerHandler((msg) => {
    if ((msg.type === 'result' || msg.type === 'error') && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
  }, {});
  handler.onMessage({ type: 'init', budgetBytes: 32 * 1024 * 1024 });
  let seq = 0;
  return async (msg) => {
    seq += 1;
    const reply = new Promise((resolve) => { waiters.set(seq, resolve); });
    handler.onMessage({ ...msg, id: seq });
    const r = await reply;
    if (r.type === 'error') throw new Error(`${r.code}: ${r.message}`);
    return r.value;
  };
}

describe.each(G.cases.map((c) => [c.file, c]))('%s', (_, c) => {
  test('the door presents it, the scan reads its geometry', async () => {
    const u8 = bytesOf(c);
    const native = c.endian === 'big' && (c.format === 1 || c.format === 5);
    if (!native) await expect(scanGeometry(bufferReader(u8.buffer), {}, {})).rejects.toThrow(/Unsupported SEG-Y sample format code/);
    const { door, reader } = await openSegyDoor(bufferReader(u8.buffer));
    expect(door).toMatchObject({ byteOrder: c.endian, formatCode: c.format, ns: c.ns, dtUs: c.dt_us, transcode: !native });
    const scan = await scanGeometry(reader, {}, {});
    expect(scan.il).toMatchObject({ min: 101, count: c.n_il });
    expect(scan.xl).toMatchObject({ min: 201, count: c.n_xl });
    expect(scan.ns).toBe(c.ns);
  });

  test('every sample of every inline equals segyio (local view through the door)', async () => {
    const call = localView();
    await call({ type: 'openLocal', sourceId: 'L', file: new Blob([bytesOf(c)]), mapping: {} });
    for (let i = 0; i < c.n_il; i++) {
      // eslint-disable-next-line no-await-in-loop
      const s = await call({ type: 'slice', sourceId: 'L', orientation: 'inline', index: i });
      for (let j = 0; j < c.n_xl; j++) {
        const golden = c.traces[i * c.n_xl + j].map((v) => Math.fround(v));
        expect(Array.from(s.data.subarray(j * c.ns, (j + 1) * c.ns))).toEqual(golden);
      }
    }
  });
});
