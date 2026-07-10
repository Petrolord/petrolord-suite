// Gridding worker: TPS surface fit off the main thread (the dense solve
// is CPU-heavy). Pure compute — points come in, the masked grid goes out.
//
// (main -> worker): {type:'grid', id, points, spec, opts}
// (worker -> main): {type:'progress', id, done, total}
//                   {type:'done', id, z (transferred), live, controlCount,
//                    dropped, zMin, zMax}
//                   {type:'error', id, message}

import { gridSurface } from '../engine/gridding';

self.onmessage = (e) => {
  const { type, id, points, spec, opts } = e.data;
  if (type !== 'grid') return;
  try {
    const result = gridSurface(points, spec, {
      ...opts,
      onProgress: (done, total) => self.postMessage({ type: 'progress', id, done, total }),
    });
    self.postMessage({
      type: 'done',
      id,
      z: result.z.buffer,
      live: result.live,
      controlCount: result.controlCount,
      dropped: result.dropped,
      zMin: result.zMin,
      zMax: result.zMax,
    }, [result.z.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message });
  }
};
