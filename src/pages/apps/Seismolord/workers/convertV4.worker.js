// Conversion worker (large-survey plan, section 3): SEG-Y -> manifest v4
// brick store in the local spool (OPFS). A postMessage shell around
// services/conversionV4.convertToSpool; the numerics are in the engines.
//
// Protocol (main -> worker):
//   {type:'convert', id, file, scan, volumeId, memoryBudgetBytes, poolSize, crop?, delayShift?}
//   (crop: cropImport.cropRequest, only the kept traces and samples are read;
//   delayShift: samples the trace delay moves an uncropped file by, F-5)
//   {type:'cancel', id}
// (worker -> main):
//   {type:'progress', id, phase, done, total, bricksDone, totalBricks}
//   {type:'convert:done', id, record}
//   {type:'error', id, message}

import { importSourceReader, sourceClip } from '../services/zgySource';
import { resolveCodec, hasNativeDeflateRaw, DEFLATE_RAW } from '../engine/brickCodecV4';
import { convertToSpool } from '../services/conversionV4';
import { opfsSpool } from '../services/brickSpool';
import { openLocalVolume } from '@/lib/localWorkspace/workspace';
import { createDeflatePool } from '../services/deflatePool';
import { conversionSourceReader } from '../services/cropImport';

const cancelled = new Set();

function makeCodec(poolSize) {
  if (!hasNativeDeflateRaw()) return { codec: resolveCodec(), pool: null };
  if (poolSize > 0 && typeof Worker !== 'undefined') {
    try {
      const pool = createDeflatePool(poolSize,
        () => new Worker(new URL('./deflate.worker.js', import.meta.url), { type: 'module' }));
      return { codec: { compression: DEFLATE_RAW, deflate: pool.deflate }, pool };
    } catch { /* nested workers unavailable: deflate on this thread */ }
  }
  return { codec: resolveCodec({ compression: DEFLATE_RAW }), pool: null };
}

async function handleConvert({ id, file, scan, volumeId, memoryBudgetBytes, poolSize, crop = null, delayShift = 0, local = false }) {
  // Local Workspace: the bricks go into this computer's workspace pack store
  // (they are the volume), in place of the upload spool
  const spool = local ? await openLocalVolume(volumeId, { write: true }) : await opfsSpool(volumeId);
  const { codec, pool } = makeCodec(poolSize);
  try {
    // a Petrel ZGY is read as the SEG-Y it holds; a compressed one gives its
    // display clip from whole bricks (zgySource.js)
    const source = await importSourceReader(file);
    const clip = await sourceClip(source);
    const reader = await conversionSourceReader(source, crop, delayShift);
    const record = await convertToSpool({
      reader,
      scan,
      ...(clip ? { clip } : {}),
      spool,
      codec,
      memoryBudgetBytes,
      encodeConcurrency: pool ? pool.size : 1,
      isCancelled: () => cancelled.has(id),
      onProgress: (p) => self.postMessage({ type: 'progress', id, ...p }),
    });
    self.postMessage({ type: 'convert:done', id, record });
  } finally {
    if (pool) pool.close();
    if (local) await spool.close().catch(() => {});
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type !== 'convert') return;
  try {
    await handleConvert(msg);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
