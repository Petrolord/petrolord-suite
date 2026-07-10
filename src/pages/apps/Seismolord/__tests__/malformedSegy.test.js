/**
 * Phase 6 hardening: malformed SEG-Y inputs must fail with clear,
 * domain-language errors — never a raw RangeError from a DataView, never
 * a hang, never silently-wrong geometry presented as valid.
 *
 * The corpus is generated deterministically in-test (no committed junk
 * binaries): each case is a targeted mutation of a minimal valid file.
 */
import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import {
  readTextualHeader, readFileHeaders, scanGeometry,
} from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';

/** Minimal valid IEEE SEG-Y: nIl x nXl traces, ns samples, il/xl at 189/193. */
function buildSegy({ nIl = 4, nXl = 4, ns = 8, formatCode = 5, binNs = null }) {
  const traceBytes = 240 + ns * 4;
  const buf = new ArrayBuffer(3600 + nIl * nXl * traceBytes);
  const view = new DataView(buf);
  view.setInt16(3200 + 16, 4000, false);                 // dt us
  view.setInt16(3200 + 20, binNs ?? ns, false);          // ns
  view.setInt16(3200 + 24, formatCode, false);
  let t = 0;
  for (let i = 0; i < nIl; i++) {
    for (let x = 0; x < nXl; x++) {
      const off = 3600 + t * traceBytes;
      view.setInt32(off + 188, 10 + i, false);           // inline at 189
      view.setInt32(off + 192, 100 + x, false);          // xline at 193
      view.setInt16(off + 70, -100, false);              // coord scalar
      view.setInt32(off + 180, (500000 + x * 25) * 100, false);
      view.setInt32(off + 184, (6700000 + i * 25) * 100, false);
      for (let s = 0; s < ns; s++) {
        view.setFloat32(off + 240 + s * 4, Math.sin(s + t), false);
      }
      t += 1;
    }
  }
  return buf;
}

const expectDomainError = async (promise, pattern) => {
  await expect(promise).rejects.toThrow(pattern);
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('Error');                        // not RangeError/TypeError
  }
};

describe('malformed SEG-Y inputs fail gracefully', () => {
  test('the minimal valid file is actually valid (corpus sanity)', async () => {
    const scan = await scanGeometry(bufferReader(buildSegy({})), {});
    expect(scan.regular).toBe(true);
    expect(scan.il.count).toBe(4);
  });

  test('empty file', async () => {
    await expectDomainError(readFileHeaders(bufferReader(new ArrayBuffer(0))), /too small/i);
    await expectDomainError(readTextualHeader(bufferReader(new ArrayBuffer(0))), /too small/i);
  });

  test('file smaller than the 3600-byte header block', async () => {
    await expectDomainError(scanGeometry(bufferReader(new ArrayBuffer(1234)), {}), /too small/i);
  });

  test('headers only, zero traces', async () => {
    const buf = buildSegy({}).slice(0, 3600);
    await expectDomainError(scanGeometry(bufferReader(buf), {}), /no traces/i);
  });

  test('unsupported sample format code', async () => {
    const buf = buildSegy({ formatCode: 3 });
    await expectDomainError(scanGeometry(bufferReader(buf), {}), /format code 3/i);
  });

  test('zero and negative samples-per-trace in the binary header', async () => {
    await expectDomainError(
      scanGeometry(bufferReader(buildSegy({ binNs: 0 })), {}), /samples-per-trace/i);
    await expectDomainError(
      scanGeometry(bufferReader(buildSegy({ binNs: -5 })), {}), /samples-per-trace/i);
  });

  test('binary header claiming more samples than the file holds', async () => {
    // ns lie: 30000 samples/trace -> not even one whole trace fits
    const buf = buildSegy({ binNs: 30000 });
    await expectDomainError(scanGeometry(bufferReader(buf), {}), /no traces/i);
  });

  test('file truncated mid-trace still scans whole traces and warns', async () => {
    const full = buildSegy({});
    const truncated = full.slice(0, full.byteLength - 100);
    const scan = await scanGeometry(bufferReader(truncated), {});
    expect(scan.totalTraces).toBe(15);                    // last trace dropped
    expect(scan.warnings.join(' ')).toMatch(/trailing bytes/i);
    expect(scan.regular).toBe(false);                     // 4x4 grid minus one
  });

  test('garbage bytes are rejected, not interpreted', async () => {
    // deterministic pseudo-random bytes; bin-header format code lands on 0x9a71
    const buf = new ArrayBuffer(10000);
    const bytes = new Uint8Array(buf);
    let seed = 1234567;
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = seed & 0xff;
    }
    await expectDomainError(scanGeometry(bufferReader(buf), {}), /format code|samples-per-trace|no traces/i);
  });

  test('transcode refuses a scan whose grid is irregular', async () => {
    const full = buildSegy({});
    const truncated = full.slice(0, full.byteLength - (240 + 8 * 4));
    const reader = bufferReader(truncated);
    const scan = await scanGeometry(reader, {});
    await expectDomainError(
      transcodeToBricks(reader, scan, { onBrick: () => {} }), /regular/i);
  });

  test('transcode catches a header/grid mismatch mid-stream', async () => {
    const buf = buildSegy({});
    const reader = bufferReader(buf);
    const scan = await scanGeometry(reader, {});
    // corrupt one trace's inline number AFTER the scan (simulates a file
    // whose sorting assumption breaks mid-ingest)
    new DataView(buf).setInt32(3600 + 5 * (240 + 32) + 188, 99, false);
    await expectDomainError(
      transcodeToBricks(reader, scan, { onBrick: () => {} }), /predicted/i);
  });
});
