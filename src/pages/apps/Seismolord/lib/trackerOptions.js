// The seeded tracker's options (Track 2D, Track 3D, Grow), pure.
//
// Extrema modes gate on two amplitudes: an absolute floor at 0.3 x the
// volume RMS, and (engines PR #348) an amplitude memory, minAmpRatio 0.5.
// Without the memory, one seed on the kit v4 top Ekene Sand walked across
// the uninterpreted growth fault: the reflector fades over a few traces
// into the fault zone and the tracker followed it onto a weak footwall
// event that still cleared the floor (21,198 of 21,504 traces). With it,
// growth stops at the fault and the hanging wall alone is picked.
// Zero-crossing modes have no amplitude at the pick, so neither gate
// applies; the correlation mode gates on its threshold instead.

export const TRACK_MIN_AMP_RATIO = 0.5;

/**
 * @param {{snapMode: string, snapWindow: number, corrThreshold: number, rms?: number}} p
 */
export function trackerOptions({ snapMode, snapWindow, corrThreshold, rms = 0 }) {
  if (snapMode === 'ncc') {
    return {
      mode: 'ncc', corrHalf: 8, corrSearch: snapWindow, corrThreshold, maxJump: 4,
    };
  }
  const zero = snapMode.startsWith('zero');
  return {
    mode: snapMode,
    window: snapWindow,
    maxJump: 4,
    minAbsAmp: zero ? 0 : (rms || 0) * 0.3,
    ...(zero ? {} : { minAmpRatio: TRACK_MIN_AMP_RATIO }),
  };
}

/** The "Horizon tracked" toast: how many of the survey's traces were picked. */
export function trackedSummary(name, tracked, total) {
  const n = (v) => Number(v).toLocaleString('en-US');
  return total ? `${name}: ${n(tracked)} of ${n(total)} traces.` : `${name}: ${n(tracked)} traces.`;
}
