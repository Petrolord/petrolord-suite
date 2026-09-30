// Seismic backdrop in a well section (Seismolord U2-002, WC-U2-017). The
// section kit's half of the contract: Seismolord's sectionBackdrop service
// hands over a traverse through the section wells (trace-major float32,
// one anchor trace per well); this maps it between the columns and paints
// it in the gaps, so every well sits on its own trace and the logs stay
// readable on top. Pure except paintBackdrop, which only draws.
//
// Time only: the backdrop is in two-way time, so it is drawn on a TWT
// section that is neither flattened nor stretched (a flattened section
// shifts each well by its own amount, which a single seismic image cannot
// follow). Any other state says why instead of drawing.

const NULL_F32 = Math.fround(1.0e30);

/** Why the backdrop cannot be drawn in this section state, or null. */
export function backdropBlocked({ depthRef, datumMode }) {
  if (depthRef !== 'twt') return 'The seismic backdrop is in two-way time; set the depth reference to TWT to see it.';
  if (datumMode === 'flatten' || datumMode === 'stretch') {
    return 'The seismic backdrop is hidden while the section is flattened or stretched (each well moves by its own amount); use the structural datum to see it.';
  }
  return null;
}

/**
 * Gap spans between consecutive anchored columns.
 * @param {Array<{x0: number, w: number}>} boxes column boxes in section order
 * @param {boolean[]} visible
 * @param {Array<?number>} cols anchor trace per column (null: the well is not on the backdrop)
 * @returns {{dx0, dx1, sx0, sx1}[]} destination x (css px) and source trace (fractional) per gap
 */
export function backdropSpans(boxes, visible, cols) {
  const out = [];
  let prev = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (cols[i] == null || !boxes[i]) continue;
    if (prev >= 0) {
      const a = boxes[prev];
      const b = boxes[i];
      const ca = a.x0 + a.w / 2;
      const cb = b.x0 + b.w / 2;
      const ta = cols[prev];
      const tb = cols[i];
      const at = (x) => ta + ((x - ca) / (cb - ca || 1)) * (tb - ta);
      const dx0 = a.x0 + a.w;
      const dx1 = b.x0;
      if (dx1 > dx0 && (visible[prev] || visible[i])) {
        out.push({
          dx0, dx1, sx0: at(dx0), sx1: at(dx1),
        });
      }
    }
    prev = i;
  }
  return out;
}

/**
 * RGBA image of the backdrop: width = traces, height = samples, a red and
 * blue diverging map symmetric about zero (positive amplitude red),
 * clipped at clip x RMS; nulls transparent.
 */
export function backdropRgba({
  data, ns, nTraces, rms,
}, clip = 3) {
  const out = new Uint8ClampedArray(nTraces * ns * 4);
  const c = (rms > 0 ? rms : 1) * clip;
  for (let t = 0; t < nTraces; t++) {
    for (let s = 0; s < ns; s++) {
      const v = data[t * ns + s];
      const o = (s * nTraces + t) * 4;
      if (v === NULL_F32 || !Number.isFinite(v)) continue;
      const a = Math.max(-1, Math.min(1, v / c));
      if (a >= 0) {
        out[o] = 255; out[o + 1] = Math.round(255 * (1 - a)); out[o + 2] = Math.round(255 * (1 - a));
      } else {
        out[o] = Math.round(255 * (1 + a)); out[o + 1] = Math.round(255 * (1 + a)); out[o + 2] = 255;
      }
      out[o + 3] = 200;
    }
  }
  return out;
}

/** Anchor trace per section column (null for wells not on the backdrop). */
export const anchorCols = (wells, backdrop) => wells.map((w) => {
  const a = (backdrop?.anchors || []).find((x) => x.id === w.id);
  return a ? a.col : null;
});

/**
 * Paint the backdrop into the section canvas between the columns.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{image: HTMLCanvasElement, dtMs: number, ns: number}} bd
 * @param {{dx0, dx1, sx0, sx1}[]} spans
 * @param {{plotTop: number, plotH: number, vTop: number, vBase: number}} v vTop/vBase in ms
 */
export function paintBackdrop(ctx, bd, spans, {
  plotTop, plotH, vTop, vBase,
}) {
  const s0 = vTop / bd.dtMs;
  const s1 = vBase / bd.dtMs;
  const r0 = Math.max(0, s0);
  const r1 = Math.min(bd.ns, s1);
  if (!(r1 > r0)) return 0;
  const y0 = plotTop + ((r0 - s0) / (s1 - s0)) * plotH;
  const y1 = plotTop + ((r1 - s0) / (s1 - s0)) * plotH;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  let n = 0;
  for (const sp of spans) {
    const lo = Math.min(sp.sx0, sp.sx1);
    const w = Math.max(1e-3, Math.abs(sp.sx1 - sp.sx0));
    if (sp.sx1 >= sp.sx0) {
      ctx.drawImage(bd.image, lo, r0, w, r1 - r0, sp.dx0, y0, sp.dx1 - sp.dx0, y1 - y0);
    } else {
      // a section ordered against the path direction: mirror the span
      ctx.save();
      ctx.translate(sp.dx0 + sp.dx1, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bd.image, lo, r0, w, r1 - r0, sp.dx0, y0, sp.dx1 - sp.dx0, y1 - y0);
      ctx.restore();
    }
    n += 1;
  }
  ctx.restore();
  return n;
}
