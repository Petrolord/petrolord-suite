// Synthetics worker: runs the full LAS -> synthetic-seismogram pipeline
// off the main thread so a 100k-sample sonic log never blocks the UI.
// All numerics live in the engine modules (jest-tested against the
// Python oracle goldens); this file is only the postMessage shell (the
// lasParse.worker / ingest.worker pattern).
//
// Protocol (main -> worker):
//   {type:'synthesize', id, params}
//     params: {
//       dtCurve: Float32Array,            sonic slowness US/M
//       rhobCurve: ?Float32Array,         density g/cc (null -> constant)
//       constantRhoGcc?: number,
//       mdArray: ?Float32Array,           irregular logs (step_m null)
//       mdStartM: ?number, mdStepM: ?number,
//       stations: {md,inc,azi}[],         normalized deviation survey
//       kbM: number, surfaceX?: number, surfaceY?: number,
//       checkshots: ?Array, velocity: ?Object, boundaries: ?Array,
//       dtUs: number, ns: number, maxTwtMs: number,
//       wavelet: Float32Array,            odd length, centre = zero lag
//       despike?: boolean,
//     }
// (worker -> main):
//   {type:'synthesize:done', id, result}  arrays transferred; result
//     carries timeSource ('checkshots'|'model') — the makeTvdssToTwt
//     provenance the UI must surface, never silently mixed
//   {type:'error', id, message}

import { buildSynthetic } from '../engine/synthetics';
import { makeTvdssToTwt } from '../engine/wellSection';
import { computeWellPath, positionAtMd } from '../engine/wellPath';

function run(params) {
  const {
    stations, kbM = 0, surfaceX = 0, surfaceY = 0,
    checkshots, velocity, boundaries, dtUs, ns, maxTwtMs,
  } = params;
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('The well needs a deviation survey (or a TD for a vertical path) '
      + 'before a synthetic can be placed in depth.');
  }
  const path = computeWellPath(stations, { surfaceX, surfaceY, kb: kbM });
  const mdToTvdss = (md) => {
    const p = positionAtMd(stations, path, md);
    return p ? p.tvdss : null;
  };

  const conv = makeTvdssToTwt({
    checkshots, velocity, boundaries, dtUs, maxTwtMs,
  });
  if (!conv) {
    throw new Error('No time-depth relationship: the well has no checkshots and the '
      + 'volume has no velocity model.');
  }

  const r = buildSynthetic({
    dtCurve: params.dtCurve,
    rhobCurve: params.rhobCurve || null,
    constantRhoGcc: params.constantRhoGcc,
    mdArray: params.mdArray || null,
    mdStartM: params.mdStartM,
    mdStepM: params.mdStepM,
    mdToTvdss,
    tvdssToTwt: (z) => conv.toTwtMs(z),
    dtMs: dtUs / 1000,
    ns,
    wavelet: params.wavelet,
    despike: params.despike || false,
  });
  return { ...r, timeSource: conv.source };
}

self.onmessage = (e) => {
  const { type, id } = e.data || {};
  try {
    if (type === 'synthesize') {
      const result = run(e.data.params);
      self.postMessage({ type: 'synthesize:done', id, result }, [
        result.mdArray.buffer, result.twtMs.buffer, result.velocity.buffer,
        result.impedance.buffer, result.impedanceTime.buffer, result.rc.buffer,
        result.synthetic.buffer, result.validity.buffer,
      ]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || String(err) });
  }
};
