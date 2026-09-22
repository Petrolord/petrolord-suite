// Slice-plane intersection marks for the Section window (tester feedback
// 2026-09-22). The explorer's Inline / Crossline / Time slice eyes are
// the ONE visibility state for every window: the 3D planes, the Map's
// location lines and time-slice raster, and these dashed lines where the
// other visible planes cut the displayed section. Hidden planes draw
// nothing anywhere. Pure, so the section gating is testable.

/** Plane colours, matching the 3D axis gizmo (IL green, XL red, Z blue). */
export const PLANE_COLORS = { inline: '#4ade80', xline: '#f87171', time: '#60a5fa' };

export const DEFAULT_SLICE_VIS = Object.freeze({ inline: true, xline: true, time: false });

/**
 * Lines to draw on a section for the OTHER visible planes.
 * Section world coordinates: x = trace column, y = sample (time slices:
 * x = crossline, y = inline), matching SliceView's ViewTransform.
 *
 * @param {'inline'|'xline'|'time'|'traverse'} orientation displayed section
 * @param {{inline:number, xline:number, time:number}} indices current positions
 * @param {{inline:boolean, xline:boolean, time:boolean}} sliceVis
 * @returns {{orientation:string, axis:'x'|'y', at:number, color:string}[]}
 */
export function planeMarksFor(orientation, indices, sliceVis) {
  if (!indices || !sliceVis) return [];
  const out = [];
  const add = (o, axis) => {
    if (sliceVis[o] && Number.isFinite(indices[o])) {
      out.push({ orientation: o, axis, at: indices[o], color: PLANE_COLORS[o] });
    }
  };
  if (orientation === 'inline') {
    add('xline', 'x');
    add('time', 'y');
  } else if (orientation === 'xline') {
    add('inline', 'x');
    add('time', 'y');
  } else if (orientation === 'time') {
    add('xline', 'x');
    add('inline', 'y');
  }
  return out;
}

/** Sanitize a persisted / restored visibility payload over the defaults. */
export function sanitizeSliceVis(raw, fallback = DEFAULT_SLICE_VIS) {
  const out = { ...fallback };
  if (raw && typeof raw === 'object') {
    for (const k of ['inline', 'xline', 'time']) {
      if (typeof raw[k] === 'boolean') out[k] = raw[k];
    }
  }
  return out;
}
