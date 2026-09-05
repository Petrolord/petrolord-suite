// Metre-world camera for the shared map viewport (Mapping MS1,
// 2026-09-05). World = CRS metres with y UP; screen = CSS px with y
// down; isotropic. Distinct from Seismolord's viewer/viewTransform.js
// ViewTransform, which is a cell-index, y-down, anisotropic camera
// (vertical exaggeration) with its own consumers and tests; the method
// vocabulary matches so a later merge is mechanical. Pure, no DOM.

/** Letterbox pad of the fit (the PAD both map twins drew with; the
 *  Earth Modeling e2e derives its click pixels from it). */
export const FIT_PAD = 44;
export const MIN_ZOOM_OUT = 1 / 8;
export const MAX_ZOOM_IN = 256;

export class MapTransform {
  constructor() {
    this.world = null;      // {x0, y0, x1, y1} node extent, metres
    this.vw = 0;            // viewport CSS px
    this.vh = 0;
    this.cx = 0;            // world point at the viewport centre
    this.cy = 0;
    this.scale = 1;         // px per metre
    this.fitScale = 1;
    this.pad = FIT_PAD;
    this.touched = false;   // a user zoom/pan happened; resizes stop refitting
  }

  /** Set the node extent; a changed extent refits. */
  setWorld(extent) {
    const w = extent ? { x0: +extent.x0, y0: +extent.y0, x1: +extent.x1, y1: +extent.y1 } : null;
    const same = !!(this.world && w) && ['x0', 'y0', 'x1', 'y1'].every((k) => this.world[k] === w[k]);
    this.world = w;
    if (!same) this.fit();
    return this;
  }

  /** Viewport size in CSS px; refits while the camera is untouched,
   *  otherwise keeps scale and centre (the fit scale is still tracked
   *  for the zoom clamp). */
  setViewport(vw, vh) {
    this.vw = vw;
    this.vh = vh;
    if (!this.touched) this.fit();
    else this.fitScale = this.fitScaleFor(this.pad);
    return this;
  }

  fitScaleFor(pad = this.pad) {
    const w = this.world;
    if (!w || !(this.vw > 0) || !(this.vh > 0)) return 1;
    const wx = (w.x1 - w.x0) || 1;
    const wy = (w.y1 - w.y0) || 1;
    return Math.min((this.vw - 2 * pad) / wx, (this.vh - 2 * pad) / wy);
  }

  /** Letterbox the extent in the viewport: scale = min((vw − 2·pad) /
   *  width, (vh − 2·pad) / height), centred on the extent. */
  fit({ pad = this.pad } = {}) {
    this.pad = pad;
    const w = this.world;
    if (!w) return this;
    this.fitScale = this.fitScaleFor(pad);
    this.scale = this.fitScale;
    this.cx = (w.x0 + w.x1) / 2;
    this.cy = (w.y0 + w.y1) / 2;
    this.touched = false;
    return this;
  }

  clampScale(s) {
    return Math.min(this.fitScale * MAX_ZOOM_IN, Math.max(this.fitScale * MIN_ZOOM_OUT, s));
  }

  /** Zoom by `factor` keeping the world point under screen (sx, sy) fixed. */
  zoomAt(factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.scale = this.clampScale(this.scale * factor);
    this.cx = before.x - (sx - this.vw / 2) / this.scale;
    this.cy = before.y + (sy - this.vh / 2) / this.scale;
    this.touched = true;
    return this;
  }

  /** Pan by a screen delta (the world moves with the pointer). */
  panBy(dsx, dsy) {
    this.cx -= dsx / this.scale;
    this.cy += dsy / this.scale;
    this.touched = true;
    return this;
  }

  /** Zoom so the screen rectangle fills the viewport. */
  zoomToRect(sx0, sy0, sx1, sy1) {
    const a = this.screenToWorld(Math.min(sx0, sx1), Math.max(sy0, sy1));
    const b = this.screenToWorld(Math.max(sx0, sx1), Math.min(sy0, sy1));
    const wx = (b.x - a.x) || 1;
    const wy = (b.y - a.y) || 1;
    this.scale = this.clampScale(Math.min(this.vw / wx, this.vh / wy));
    this.cx = (a.x + b.x) / 2;
    this.cy = (a.y + b.y) / 2;
    this.touched = true;
    return this;
  }

  worldToScreen(x, y) {
    return { x: this.vw / 2 + (x - this.cx) * this.scale, y: this.vh / 2 - (y - this.cy) * this.scale };
  }

  screenToWorld(sx, sy) {
    return { x: this.cx + (sx - this.vw / 2) / this.scale, y: this.cy - (sy - this.vh / 2) / this.scale };
  }

  /** World rectangle visible in the viewport. */
  visibleRect() {
    const a = this.screenToWorld(0, this.vh);
    const b = this.screenToWorld(this.vw, 0);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  get metersPerPx() { return 1 / this.scale; }

  getCamera() {
    return { cx: this.cx, cy: this.cy, scale: this.scale, touched: this.touched };
  }

  setCamera(c) {
    if (!c) return this;
    if (Number.isFinite(c.cx)) this.cx = c.cx;
    if (Number.isFinite(c.cy)) this.cy = c.cy;
    if (Number.isFinite(c.scale) && c.scale > 0) this.scale = c.scale;
    this.touched = c.touched !== undefined ? !!c.touched : true;
    return this;
  }
}
