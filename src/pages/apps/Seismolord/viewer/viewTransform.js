// View transform (camera) for the slice viewers — the single coordinate
// authority shared by the WebGL shader (via viewUniform), the 2D overlay
// (horizons/faults/picks), axis annotations and mouse picking. Anything
// that maps between screen pixels and data cells MUST go through this
// class; future viewer features (measure tools, well overlays, synced
// multi-viewport) get zoom/pan/exaggeration for free by doing the same.
//
// World space: x = trace axis (crossline index on inlines, inline index
// on crosslines, crossline index on time slices), y = sample index on
// sections / inline index on time slices. Units are data cells, cell i
// spanning [i, i+1) with its centre at i + 0.5. Screen space: device
// pixels, origin top-left, y down (matching both canvases).

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 256;
export const MIN_VEXAG = 0.2;
export const MAX_VEXAG = 20;

const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class ViewTransform {
  /** @param {{nx?: number, ny?: number, vw?: number, vh?: number}} [init] */
  constructor(init = {}) {
    this.nx = Math.max(1, init.nx || 1);
    this.ny = Math.max(1, init.ny || 1);
    this.vw = Math.max(1, init.vw || 1);
    this.vh = Math.max(1, init.vh || 1);
    this.zoom = 1;          // 1 = slice fills the viewport (legacy behavior)
    this.vexag = 1;         // vertical stretch relative to the fill aspect
    this.cx = this.nx / 2;  // view centre, world units
    this.cy = this.ny / 2;
  }

  /** Pixels per world cell, horizontal. */
  get ppx() { return (this.vw / this.nx) * this.zoom; }

  /** Pixels per world cell, vertical (carries the exaggeration). */
  get ppy() { return (this.vh / this.ny) * this.zoom * this.vexag; }

  /** New slice dimensions: keep the camera only if the world is unchanged. */
  setWorld(nx, ny) {
    nx = Math.max(1, nx);
    ny = Math.max(1, ny);
    if (nx === this.nx && ny === this.ny) return;
    this.nx = nx;
    this.ny = ny;
    this.fit();
  }

  /** Viewport resize keeps the visible world fraction (ppx scales with vw). */
  setViewport(vw, vh) {
    this.vw = Math.max(1, vw);
    this.vh = Math.max(1, vh);
    this.#clampCenter();
  }

  /** Zoom back to full slice; exaggeration is a display choice, keep it. */
  fit() {
    this.zoom = 1;
    this.cx = this.nx / 2;
    this.cy = this.ny / 2;
    this.#clampCenter();
  }

  /** Full reset including exaggeration. */
  reset() {
    this.vexag = 1;
    this.fit();
  }

  /**
   * Multiply zoom, keeping the world point under screen (sx, sy) fixed —
   * wheel-zoom "at the cursor".
   */
  zoomAt(factor, sx, sy) {
    const w = this.screenToWorld(sx, sy);
    this.zoom = clampNum(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.cx = w.x - (sx - this.vw / 2) / this.ppx;
    this.cy = w.y - (sy - this.vh / 2) / this.ppy;
    this.#clampCenter();
  }

  /** Set vertical exaggeration keeping the viewport-centre row fixed. */
  setVexag(v) {
    this.vexag = clampNum(v, MIN_VEXAG, MAX_VEXAG);
    this.#clampCenter();
  }

  /** Pan by a screen-pixel delta (drag: world follows the pointer). */
  panBy(dsx, dsy) {
    this.cx -= dsx / this.ppx;
    this.cy -= dsy / this.ppy;
    this.#clampCenter();
  }

  /** Rubber-band zoom: show the whole screen rect, preserving exaggeration. */
  zoomToRect(sx0, sy0, sx1, sy1) {
    const a = this.screenToWorld(Math.min(sx0, sx1), Math.min(sy0, sy1));
    const b = this.screenToWorld(Math.max(sx0, sx1), Math.max(sy0, sy1));
    const rw = Math.max(b.x - a.x, 1e-6);
    const rh = Math.max(b.y - a.y, 1e-6);
    const zx = this.nx / rw;                       // zoom that fits the width
    const zy = this.ny / (rh * this.vexag);        // …and the height
    this.zoom = clampNum(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    this.cx = (a.x + b.x) / 2;
    this.cy = (a.y + b.y) / 2;
    this.#clampCenter();
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.cx) * this.ppx + this.vw / 2,
      y: (wy - this.cy) * this.ppy + this.vh / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: this.cx + (sx - this.vw / 2) / this.ppx,
      y: this.cy + (sy - this.vh / 2) / this.ppy,
    };
  }

  /** Visible world rect {x0, y0, w, h} in world units (may exceed data). */
  visibleRect() {
    const w = this.vw / this.ppx;
    const h = this.vh / this.ppy;
    return { x0: this.cx - w / 2, y0: this.cy - h / 2, w, h };
  }

  /**
   * Visible rect normalized to [0,1] data space — feeds the shader's
   * u_view (x0, y0, w, h). Identity is [0, 0, 1, 1].
   */
  viewUniform() {
    const r = this.visibleRect();
    return [r.x0 / this.nx, r.y0 / this.ny, r.w / this.nx, r.h / this.ny];
  }

  /** True when the view shows exactly the whole slice (legacy rendering). */
  isIdentity() {
    const [x0, y0, w, h] = this.viewUniform();
    const eps = 1e-9;
    return Math.abs(x0) < eps && Math.abs(y0) < eps
      && Math.abs(w - 1) < eps && Math.abs(h - 1) < eps;
  }

  /**
   * Keep data on screen: lock an axis to its centre while the whole extent
   * fits, otherwise stop the view edge at the data edge.
   */
  #clampCenter() {
    const halfW = this.vw / this.ppx / 2;
    const halfH = this.vh / this.ppy / 2;
    this.cx = halfW * 2 >= this.nx
      ? this.nx / 2 : clampNum(this.cx, halfW, this.nx - halfW);
    this.cy = halfH * 2 >= this.ny
      ? this.ny / 2 : clampNum(this.cy, halfH, this.ny - halfH);
  }
}
