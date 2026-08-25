// Well Design Studio WD2 acceptance: the /dev harness drives the real
// solver dialog + segment compiler + chart pack without auth, and the
// UI must reproduce the ENGINE'S answers for the seeded pad geometry —
// expectations are computed here from the same validated engines
// package (never hardcoded), so engine changes cannot silently drift
// past this spec.

import { test, expect } from '@playwright/test';
import { solveSlant } from '../packages/engines/engines/drilling/profileDesign.js';
import { compileSegments } from '../packages/engines/engines/drilling/segmentCompiler.js';
import { declinationAt } from '../packages/engines/engines/drilling/magnetics.js';

// The harness's seeded geometry (WellDesignHarness.jsx).
const WELLBORE = { head_x: 500000, head_y: 6800000, kb_elev_m: 30 };
const TARGET = { center_x: 500850, center_y: 6801100, tvdss_m: 2470 };

function expectedSlant(kop, rate) {
  const dE = TARGET.center_x - WELLBORE.head_x;
  const dN = TARGET.center_y - WELLBORE.head_y;
  const dTvd = TARGET.tvdss_m + WELLBORE.kb_elev_m - kop;
  const sol = solveSlant({ target: { dN, dE, dTvd }, buildRate: rate, mdUnit: 'm' });
  const rounded = [{ kind: 'hold', length: kop }, ...sol.segments].map((s) => ({
    ...s, length: +s.length.toFixed(2), ...(s.rate != null ? { rate: +s.rate.toFixed(4) } : {}),
  }));
  const { path, stations } = compileSegments({
    mdUnit: 'm', tieOn: { md: 0, inc: 0, azi: sol.report.aziDeg }, segments: rounded,
  });
  const last = path[path.length - 1];
  return { sol, end: last, endInc: stations[stations.length - 1].inc };
}

test('J-well solve through the dialog lands on the engine answer', async ({ page }) => {
  await page.goto('/dev/well-design');
  await expect(page.getByTestId('wd-md')).toHaveText('500.0');

  await page.getByTestId('wd-open-solver').click();
  await page.getByTestId('solver-target-trigger').click();
  await page.getByRole('option', { name: /Amber sand/ }).click();
  await page.getByTestId('solver-kop').fill('300');
  await page.getByTestId('solver-buildrate').fill('3');
  await page.getByTestId('solver-apply').click();

  const exp = expectedSlant(300, 3);
  await expect(page.getByTestId('wd-md')).toHaveText(exp.end.md.toFixed(1));
  await expect(page.getByTestId('wd-tvd')).toHaveText(exp.end.tvd.toFixed(1));
  await expect(page.getByTestId('wd-n')).toHaveText(exp.end.y.toFixed(1));
  await expect(page.getByTestId('wd-e')).toHaveText(exp.end.x.toFixed(1));
  await expect(page.getByTestId('wd-inc')).toHaveText(exp.endInc.toFixed(2));

  // and the target is genuinely hit (engine-side truth)
  expect(exp.end.y).toBeCloseTo(TARGET.center_y - WELLBORE.head_y, 0);
  expect(exp.end.x).toBeCloseTo(TARGET.center_x - WELLBORE.head_x, 0);
  expect(exp.end.tvd).toBeCloseTo(TARGET.tvdss_m + WELLBORE.kb_elev_m, 0);
});

test('WMM2025 declination in the browser bundle matches the engine (WD3)', async ({ page }) => {
  // The harness's fixed probe (WellDesignHarness.jsx MAG_PROBE).
  const expected = declinationAt({ latDeg: 4.75, lonDeg: 7.0, decimalYear: 2026.65 });
  await page.goto('/dev/well-design');
  await expect(page.getByTestId('wd-decl')).toHaveText(expected.declinationDeg.toFixed(3));
});

test('charts render for the solved design', async ({ page }) => {
  await page.goto('/dev/well-design');
  await page.getByTestId('wd-open-solver').click();
  await page.getByTestId('solver-target-trigger').click();
  await page.getByRole('option', { name: /Amber sand/ }).click();
  await page.getByTestId('solver-apply').click();
  await expect(page.getByTestId('plan-view-chart')).toBeVisible();
  // The plan view SVG contains the wellpath polyline and the circular target.
  await expect(page.locator('[data-testid="plan-view-chart"] svg path')).toHaveCount(1);
  await expect(page.locator('[data-testid="plan-view-chart"] svg circle')).not.toHaveCount(0);
});
