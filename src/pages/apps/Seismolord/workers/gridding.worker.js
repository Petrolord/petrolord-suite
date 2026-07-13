// Gridding worker: TPS surface fit off the main thread (the dense solve
// is CPU-heavy). Pure compute — points come in, the masked grid goes out.
//
// (main -> worker): {type:'grid', id, points, spec, opts, nodeBlocks?}
//   nodeBlocks (Int32Array buffer, optional): fault-block id per output
//   node — presence selects the fault-blocked path (points then carry a
//   `block` id; see engine/faultBarriers.js for how blocks are built).
// (worker -> main): {type:'progress', id, done, total}
//                   {type:'done', id, z (transferred), live, controlCount,
//                    dropped, zMin, zMax, blockCount?, skippedBlocks?}
//                   {type:'error', id, message}

import { gridSurface, gridSurfaceBlocked } from '@/lib/gridding/gridding';

self.onmessage = (e) => {
  const { type, id, points, spec, opts, nodeBlocks } = e.data;
  if (type !== 'grid') return;
  try {
    const onProgress = (done, total) => self.postMessage({ type: 'progress', id, done, total });
    const result = nodeBlocks
      ? gridSurfaceBlocked(points, spec, {
        ...opts, nodeBlocks: new Int32Array(nodeBlocks), onProgress,
      })
      : gridSurface(points, spec, { ...opts, onProgress });
    self.postMessage({
      type: 'done',
      id,
      z: result.z.buffer,
      live: result.live,
      controlCount: result.controlCount,
      dropped: result.dropped,
      zMin: result.zMin,
      zMax: result.zMax,
      blockCount: result.blockCount ?? null,
      skippedBlocks: result.skippedBlocks ?? null,
    }, [result.z.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message });
  }
};
