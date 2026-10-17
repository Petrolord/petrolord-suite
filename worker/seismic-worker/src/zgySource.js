// A Petrel ZGY in the worker's store or behind a link (ZGY import, phase B,
// 2026-10-16). The browser uploads a ZGY as it is (up to 4x smaller than the
// 32-bit SEG-Y it holds) and a link may point at one; the worker presents it
// as that SEG-Y through the same engines view the browser uses
// (engines zgySegy.js), so the scan and the conversion run unchanged and
// store what the browser would store. A ZGY is known by its signature,
// never by its name.
import fs from 'node:fs';
import path from 'node:path';
import { JobFailure } from './runJob.js';
import { openZgy, ZgyRefusal } from '../../../packages/engines/engines/seismolord/zgy.js';
import { zgySegyReader, zgyAmplitudeClip } from '../../../packages/engines/engines/seismolord/zgySegy.js';
import { createZfpDecode } from '../../../src/lib/zfp/zfpDecoder.js';
import { zgyHeadersOnlyReader } from '../../../src/pages/apps/Seismolord/lib/zgyHeaders.js';

/** 'zgy' (readable), 'legacy' (old Petrel compression) or null (not a ZGY). */
export async function zgySignature(reader) {
  if (reader.size < 8) return null;
  const b = new Uint8Array(await reader.read(0, 4));
  if (b[3] !== 0) return null;
  const m = String.fromCharCode(b[0], b[1], b[2]);
  if (m === 'VBS') return 'zgy';
  if (m === 'VCS') return 'legacy';
  return null;
}

// the wasm sits beside the bundle (build.mjs copies it); ZFP_WASM overrides
const wasmPath = () => process.env.ZFP_WASM
  || [path.join(path.dirname(process.argv[1] || ''), 'wasm-zfp.wasm'), path.resolve('node_modules/wasm-zfp/dist/wasm-zfp.wasm')]
    .find((p) => fs.existsSync(p));

let decoder = null;
/** The ZFP decoder, loaded once per thread. */
export function nodeZfpDecode(deps = {}) {
  if (!decoder) {
    const p = deps.zfpWasmPath || wasmPath();
    if (!p) throw new Error('The ZFP decoder (wasm-zfp.wasm) is missing from the worker.');
    decoder = createZfpDecode({ wasmBinary: fs.readFileSync(p) });
  }
  return decoder;
}

/**
 * The reader a handler reads a dataset through: the raw bytes, or, for a
 * ZGY, its SEG-Y view (with `clip` for a compressed one: the display clip
 * from whole bricks, which a trace-spread pre-pass over ranged reads would
 * make slow). A legacy Petrel compressed ZGY fails with the re-export advice.
 * @param {import('../../../packages/engines/engines/seismolord/reader').ByteReader} raw
 * @param {{name?: string, toScratch?: (r) => Promise<Object>}} [opts] toScratch: copy a
 *   linked file once before the many ranged reads a ZGY view makes
 * @returns {Promise<{reader, zgy: ?Object, clip: ?Object, scratchCopy: ?Object}>}
 */
export async function zgyAwareSource(raw, { name = '', toScratch = null, headersOnly = false } = {}, deps = {}) {
  const sig = await zgySignature(raw);
  if (!sig) return { reader: raw, zgy: null, clip: null, scratchCopy: null };
  let src = raw;
  let scratchCopy = null;
  try {
    if (sig === 'legacy') await openZgy(raw); // throws the refusal with its advice
    // a scan reads trace headers only: no brick is read or decoded (zgyHeaders.js)
    if (headersOnly) {
      const z = await openZgy(raw);
      return { reader: zgyHeadersOnlyReader(zgySegyReader(z, { sourceName: name })), zgy: z, clip: null, scratchCopy: null };
    }
    if (toScratch) { scratchCopy = await toScratch(raw); src = scratchCopy; }
    let z = await openZgy(src);
    if (z.meta.compressedBricks) z = await openZgy(src, { zfpDecode: await nodeZfpDecode(deps) });
    const reader = zgySegyReader(z, { sourceName: name });
    const clip = z.meta.compressedBricks ? await zgyAmplitudeClip(z) : null;
    return { reader, zgy: z, clip, scratchCopy };
  } catch (e) {
    if (e instanceof ZgyRefusal) throw new JobFailure('not_segy', e.message);
    throw e;
  }
}
