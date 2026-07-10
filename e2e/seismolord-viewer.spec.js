/* global process */
// Phase 2 acceptance wrapper: drives the deterministic viewer self-test
// (synthetic 200^3 volume -> real brick/assembly/WebGL2 pipeline ->
// readPixels vs CPU reference) and records the performance numbers.
//
// Correctness is asserted unconditionally. The 60fps / <150ms warm-slice
// / <16ms block targets are asserted only under PERF_STRICT=1, because
// headless chromium renders on SwiftShader (software GL) — the binding
// perf run happens on real hardware against staging.

import { test, expect } from '@playwright/test';

test('viewer self-test: GPU output matches the CPU reference', async ({ page }) => {
  await page.goto('/dev/seismolord-selftest');
  const pre = page.getByTestId('selftest-result');
  await expect(pre).toHaveAttribute('data-selftest-status', /done|error/, { timeout: 150000 });

  const result = JSON.parse(await pre.textContent());
  expect(result.error).toBeUndefined();

  // correctness: every orientation/param case within tolerance, plus the
  // oriented screen-convention fixture (time must increase downward)
  expect(result.correctness.pass).toBe(true);
  for (const check of result.correctness.checks) {
    expect.soft(check.maxDiff, `${check.orientation} maxDiff`).toBeLessThanOrEqual(8);
    expect.soft(check.pctWithin2, `${check.orientation} pctWithin2`).toBeGreaterThanOrEqual(99);
  }
  const oriented = result.correctness.checks.find(
    (c) => c.orientation === 'screen-convention-time-down');
  expect(oriented?.pass, 'time-down screen convention').toBe(true);

  // context-loss recovery: must fully restore when the extension exists
  if (result.contextLoss?.supported) {
    expect(result.contextLoss.pass, 'context-loss recovery').toBe(true);
  }

  // perf: always recorded, asserted only in strict mode (real GPU)
  test.info().annotations.push(
    { type: 'gl-renderer', description: result.env.glRenderer },
    { type: 'fps', description: String(result.perf.fps.toFixed(1)) },
    { type: 'warm-slice-avg-ms', description: String(result.perf.warmSliceAvgMs.toFixed(2)) },
    { type: 'warm-slice-p95-ms', description: String(result.perf.warmSliceP95Ms.toFixed(2)) },
  );
  // eslint-disable-next-line no-console
  console.log('[seismolord perf]', result.env.glRenderer, JSON.stringify(result.perf));

  expect(result.perf.warmSliceMaxMs).toBeLessThan(150 * 20); // sanity even on software GL
  if (process.env.PERF_STRICT === '1') {
    expect(result.perf.fps).toBeGreaterThanOrEqual(60 * 0.95);
    expect(result.perf.warmSliceP95Ms).toBeLessThan(150);
    expect(result.perf.warmSliceAvgMs).toBeLessThan(16.7);
  }
});
