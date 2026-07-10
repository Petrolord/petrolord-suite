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
  ];
  for (const c of cases) {
    const slice = await assembleSlice(getBrick, geom, c.orientation, c.index);
    canvas.width = slice.height * 2;      // 2x avoids texel-boundary sampling
    canvas.height = slice.width * 2;
    renderer.setParams(c.params);
    renderer.setSlice(slice, c.orientation !== 'time');
    renderer.render();
    const actual = renderer.readPixels();
    const expected = renderer.referenceRender(slice, canvas.width, canvas.height);
    const cmp = compareImages(actual, expected);
    checks.push({ ...c, ...cmp, pass: cmp.maxDiff <= 8 && cmp.pctWithin2 >= 99 });
  }
  const correctnessPass = checks.every((c) => c.pass);

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
    perf,
    targets: { fpsMin: 60, warmSliceMaxMs: 150, mainThreadBlockMs: 16 },
    env: { glRenderer: String(glRenderer), userAgent: navigator.userAgent },
  };
}
