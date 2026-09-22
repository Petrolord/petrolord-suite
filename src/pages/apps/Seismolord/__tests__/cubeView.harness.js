// Shared jsdom scaffolding for CubeView component tests: a recording
// stand-in for the WebGL CubeRenderer (jsdom has no WebGL) and a no-op
// 2D context for the annotation overlay canvas. Import BEFORE CubeView;
// the renderer mock itself is declared with jest.mock in each test file
// (jest hoists it) via cubeRendererMock().
//
// Not a test file (no .test suffix): jest's testMatch skips it.

export const renderers = [];

/** Factory for jest.mock('../viewer/CubeRenderer', cubeRendererMock). */
export function cubeRendererMock() {
  class FakeCubeRenderer {
    constructor() {
      this.planes = new Map();
      // eslint-disable-next-line global-require
      require('./cubeView.harness').renderers.push(this);
    }

    setColormap() {}

    setDisplay() {}

    setBackground() {}

    setPlane(id, slice) {
      if (slice) this.planes.set(id, slice);
      else this.planes.delete(id);
    }

    setPlaneQuad() {}

    hasPlane(id) { return this.planes.has(id); }

    setEdges() {}

    setScale() {}

    setMesh() {}

    setLineSet() {}

    render() {}

    destroy() {}
  }
  return { CubeRenderer: FakeCubeRenderer };
}

/** Stub every 2D-context call the overlay makes. */
export function stubCanvas2d() {
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class { observe() {} disconnect() {} };
  }
}

/** A tiny volume: 8 x 8 traces x 16 samples, 8^3 bricks. */
export const GEOM = { nIl: 8, nXl: 8, ns: 16, brickSize: 8, grid: [1, 1, 2] };
export const MANIFEST = {
  version: 1,
  geometry: {
    il: { min: 100, step: 1, count: 8 },
    xl: { min: 200, step: 1, count: 8 },
    ns: 16,
    dt_us: 4000,
  },
  brick: { size: 8, grid: [1, 1, 2] },
};
export const DISPLAY = {
  colormap: 'seismic', gain: 1, polarity: 1, clip: 1, traceBalance: false,
};

/** Controllable getBrick: every call waits until release() is called
 *  (or resolves at once when `immediate`). */
export function gatedBricks({ immediate = false } = {}) {
  const waiters = [];
  const getBrick = () => new Promise((resolve) => {
    const data = new Float32Array(8 * 8 * 8);
    if (immediate) resolve(data);
    else waiters.push(() => resolve(data));
  });
  const release = () => { while (waiters.length) waiters.shift()(); };
  return { getBrick, release, pending: () => waiters.length };
}
