// Deterministic viewer self-test (Phase 2 acceptance): renders a
// synthetic 200^3 volume through the REAL pipeline (bricks ->
// assembleSlice -> R32F texture -> shader) and compares readPixels
// against a CPU reference of the same math, then measures warm-scrub
// performance. Driven by the dev-only route and the Playwright suite.

import { assembleSlice } from '../engine/sliceAssembly';
import { NULL_VALUE } from '../engine/manifest';
import { SliceRenderer } from './SliceRenderer';

export const TEST_DIM = 200;          // 200^3 per the acceptance targets
const BRICK = 64;
const NULL_F32 = Math.fround(NULL_VALUE);

/** Deterministic amplitude field with both signs and periodic nulls. */
function fieldValue(il, xl, s) {
  if ((il + xl + s) % 89 === 0) return NULL_F32;
  return Math.fround(Math.sin(0.11 * il + 0.13 * xl) * Math.sin(0.23 * s + 0.005 * il));
}

/** Build the synthetic volume as an in-memory brick set. */
export function buildTestBricks(dim = TEST_DIM) {
  const nb = Math.ceil(dim / BRICK);
  const bricks = new Map();
  for (let bi = 0; bi < nb; bi++) {
    for (let bj = 0; bj < nb; bj++) {
      for (let bk = 0; bk < nb; bk++) {
        const data = new Float32Array(BRICK * BRICK * BRICK).fill(NULL_F32);
        for (let li = 0; li < BRICK; li++) {
          const il = bi * BRICK + li;
          if (il >= dim) break;
          for (let lj = 0; lj < BRICK; lj++) {
            const xl = bj * BRICK + lj;
            if (xl >= dim) break;
            const base = (li * BRICK + lj) * BRICK;
            const s0 = bk * BRICK;
            for (let lk = 0; lk < BRICK && s0 + lk < dim; lk++) {
              data[base + lk] = fieldValue(il, xl, s0 + lk);
            }
          }
        }
        bricks.set(`${bi}-${bj}-${bk}`, data);
      }
    }
  }
  const geom = {
    nIl: dim, nXl: dim, ns: dim, brickSize: BRICK, grid: [nb, nb, nb],
  };
  const getBrick = (i, j, k) => Promise.resolve(bricks.get(`${i}-${j}-${k}`));
  return { geom, getBrick, brickCount: bricks.size };
}

function compareImages(actual, expected) {
  let maxDiff = 0;
  let within2 = 0;
  let sumDiff = 0;
  const n = actual.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(actual[i] - expected[i]);
    if (d > maxDiff) maxDiff = d;
    sumDiff += d;
    if (d <= 2) within2 += 1;
  }
  return {
    maxDiff,
    meanDiff: sumDiff / n,
    pctWithin2: (100 * within2) / n,
  };
}

/**
 * Run the full self-test on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{dim?: number, scrubFrames?: number}} [opts]
 */
export async function runViewerSelfTest(canvas, opts = {}) {
  const { dim = TEST_DIM, scrubFrames = 120 } = opts;
  const { geom, getBrick, brickCount } = buildTestBricks(dim);

  const renderer = new SliceRenderer(canvas);
  const gl = canvas.getContext('webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const glRenderer = dbg
    ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  // ---- correctness: GPU vs CPU reference, three orientations + params
  const checks = [];
  const cases = [
    { orientation: 'inline', index: 42, params: { gain: 1, polarity: 1, clip: 1, traceBalance: false } },
    { orientation: 'xline', index: 137, params: { gain: 2.5, polarity: -1, clip: 0.8, traceBalance: false } },
    { orientation: 'time', index: 60, params: { gain: 1, polarity: 1, clip: 1, traceBalance: false } },
    { orientation: 'inline', index: 42, params: { gain: 1, polarity: 1, clip: 3, traceBalance: true } },
    // camera: zoomed-in rect. Dyadic values are exact in fp32 AND fp64, so
    // GPU and CPU reference make identical texel-floor decisions.
    {
      orientation: 'inline', index: 42, view: [0.25, 0.375, 0.5, 0.5],
      params: { gain: 1, polarity: 1, clip: 1, traceBalance: false },
    },
    // camera: view extends beyond the data (vexag < 1) -> background pixels
    {
      orientation: 'time', index: 60, view: [-0.125, -0.25, 1.25, 1.5],
      params: { gain: 1, polarity: 1, clip: 1, traceBalance: false },
    },
  ];
  for (const c of cases) {
    const slice = await assembleSlice(getBrick, geom, c.orientation, c.index);
    canvas.width = slice.height * 2;      // 2x avoids texel-boundary sampling
    canvas.height = slice.width * 2;
    renderer.setView(c.view || [0, 0, 1, 1]);
    renderer.setParams(c.params);
    renderer.setSlice(slice, c.orientation !== 'time');
    renderer.render();
    const actual = renderer.readPixels();
    const expected = renderer.referenceRender(slice, canvas.width, canvas.height);
    const cmp = compareImages(actual, expected);
    checks.push({ ...c, ...cmp, pass: cmp.maxDiff <= 8 && cmp.pctWithin2 >= 99 });
  }
  renderer.setView([0, 0, 1, 1]);       // camera back to identity
  // ---- screen convention: time increases DOWNWARD on sections ---------
  // A pure depth gradient (-1 shallow -> +1 deep) must render red at the
  // top and blue at the bottom under the default red-white-blue map. This
  // is the oriented fixture the GPU==CPU comparison cannot provide (the
  // Phase 2 time-upward bug passed that comparison).
  {
    const ns2 = 64;
    const tr = 64;
    const grad = {
      width: ns2, height: tr, data: new Float32Array(ns2 * tr), traceRms: null,
    };
    for (let t = 0; t < tr; t++) {
      for (let s = 0; s < ns2; s++) grad.data[t * ns2 + s] = (s / (ns2 - 1)) * 2 - 1;
    }
    canvas.width = 128;
    canvas.height = 128;
    renderer.setParams({ gain: 1, polarity: 1, clip: 1, traceBalance: false });
    renderer.setSlice(grad, true);
    renderer.render();
    const px = renderer.readPixels();
    // readPixels row 0 = BOTTOM of the screen = deepest samples = blue
    const rowMean = (row, ch) => {
      let s = 0;
      for (let x = 0; x < 128; x++) s += px[(row * 128 + x) * 4 + ch];
      return s / 128;
    };
    const pass = rowMean(2, 2) > rowMean(125, 2) + 100      // blue at bottom
      && rowMean(125, 0) > rowMean(2, 0) + 100;             // red at top
    checks.push({
      orientation: 'screen-convention-time-down', index: null,
      maxDiff: 0, meanDiff: 0, pctWithin2: 100, pass,
    });
  }

  const correctnessPass = checks.every((c) => c.pass);

  // ---- context-loss recovery (Phase 6) ---------------------------------
  let contextLoss = { supported: false, pass: null };
  const loseExt = gl.getExtension('WEBGL_lose_context');
  if (loseExt) {
    const slice = await assembleSlice(getBrick, geom, 'inline', 42);
    canvas.width = slice.height;
    canvas.height = slice.width;
    renderer.setParams({ gain: 1, polarity: 1, clip: 1, traceBalance: false });
    renderer.setSlice(slice, true);
    renderer.render();
    const before = renderer.readPixels();
    const restoredOk = new Promise((resolve) => {
      renderer.onRestore = () => resolve(true);
      setTimeout(() => resolve(false), 5000);
    });
    loseExt.loseContext();
    await new Promise((r) => setTimeout(r, 50));
    const wasMarkedLost = renderer.contextLost;
    loseExt.restoreContext();
    const restored = await restoredOk;
    let bitEqual = false;
    if (restored) {
      renderer.render();
      const after = renderer.readPixels();
      bitEqual = before.length === after.length && before.every((v, i) => v === after[i]);
    }
    contextLoss = {
      supported: true, wasMarkedLost, restored, pass: wasMarkedLost && restored && bitEqual,
    };
    renderer.onRestore = null;
  }

  // ---- perf: warm scrub across inline slices (assemble + upload + draw)
  canvas.width = dim * 2;
  canvas.height = dim * 2;
  renderer.setParams({ gain: 1, polarity: 1, clip: 1, traceBalance: false });
  // warm the path once
  renderer.setSlice(await assembleSlice(getBrick, geom, 'inline', 0), true);
  renderer.render();

  const frameMs = [];
  for (let f = 0; f < scrubFrames; f++) {
    const idx = (f * 7) % dim;            // jump around like a real scrub
    const t0 = performance.now();
    const slice = await assembleSlice(getBrick, geom, 'inline', idx);
    renderer.setSlice(slice, true);
    renderer.render();
    frameMs.push(performance.now() - t0);
  }
  // rAF-paced fps over one second of scrubbing
  const fps = await new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = async () => {
      const idx = (frames * 3) % dim;
      renderer.setSlice(await assembleSlice(getBrick, geom, 'inline', idx), true);
      renderer.render();
      frames += 1;
      if (performance.now() - start < 1000) requestAnimationFrame(tick);
      else resolve((frames * 1000) / (performance.now() - start));
    };
    requestAnimationFrame(tick);
  });

  const sorted = [...frameMs].sort((a, b) => a - b);
  const perf = {
    dim,
    brickCount,
    warmSliceAvgMs: frameMs.reduce((a, b) => a + b, 0) / frameMs.length,
    warmSliceP95Ms: sorted[Math.floor(sorted.length * 0.95)],
    warmSliceMaxMs: sorted[sorted.length - 1],
    fps,
  };

  renderer.destroy();

  return {
    correctness: { pass: correctnessPass, checks },
    contextLoss,
    perf,
    targets: { fpsMin: 60, warmSliceMaxMs: 150, mainThreadBlockMs: 16 },
    env: { glRenderer: String(glRenderer), userAgent: navigator.userAgent },
  };
}
