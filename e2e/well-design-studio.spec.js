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
import { computeWellPath } from '../packages/engines/engines/drilling/surveyMath.js';
import { computeErrorModel } from '../packages/engines/engines/drilling/errorModel.js';
import { computeClearance } from '../packages/engines/engines/drilling/antiCollision.js';
import {
  buildTrajectoryContract, contractToCsv, contractToDxf,
} from '../src/pages/apps/well-planning/services/trajectoryContract.js';
import { preparePublishPayload } from '../src/pages/apps/well-planning/services/publishPayload.js';
import { generateSurveyListing } from '../src/pages/apps/well-planning/services/reportPack.js';

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

test('Rev4 + separation rule in the browser bundle match the engine (WD4)', async ({ page }) => {
  // The harness's fixed AC probe (WellDesignHarness.jsx AC_PROBE): two
  // parallel J-wells 50 m apart, fixed geomagnetic reference.
  const magRef = {
    bTotalNT: 50000, dipDeg: 72, declinationDeg: -4, convergenceDeg: 0, aziReference: 'grid',
  };
  const stations = [];
  for (let i = 0; i < 40; i++) {
    const md = i * 50;
    stations.push({ md, inc: Math.min(30, Math.max(0, (md - 300) / 30)), azi: 90 });
  }
  const build = (headY, radius) => {
    const path = computeWellPath(stations, { surfaceX: 0, surfaceY: headY, kb: 0 });
    const model = computeErrorModel(stations, magRef);
    return {
      stations,
      positions: path.map((p) => ({ n: p.y, e: p.x, tvd: p.tvd })),
      cov: model.totalCov,
      radius,
    };
  };
  const expected = computeClearance(build(0, 0.4572), build(50, 0.3048), {
    k: 3.5, sigmaPa: 0.5, Sm: 0.3,
  });

  await page.goto('/dev/well-design');
  await expect(page.getByTestId('wd-acsf')).toHaveText(expected.summary.minSf.toFixed(4));
  // and the WD4 chart pack renders from the same scan
  await expect(page.getByTestId('traveling-cylinder-chart')).toBeVisible();
});

test('trajectory contract exports + 3D window in the browser bundle (WD5)', async ({ page }) => {
  // Recompute the harness's fixed WD5 probe with the SAME service the
  // bundle ships (no '@' aliases in trajectoryContract, so it imports
  // directly here).
  const stations = [];
  for (let i = 0; i < 40; i++) {
    const md = i * 50;
    stations.push({ md, inc: Math.min(30, Math.max(0, (md - 300) / 30)), azi: 90 });
  }
  const contract = buildTrajectoryContract({
    site: { name: 'Harness pad', crs: 'EPSG:32631', xy_unit: 'm' },
    wellbore: {
      id: 'harness-wb', name: 'HAR-1', head_x: 500000, head_y: 6800000,
      kb_elev_m: 30, depth_unit: 'm', grid_convergence_deg: -1.2,
    },
    design: { name: 'Harness plan', revision: 1, status: 'draft' },
    stations,
    generatedAt: '2026-08-25T00:00:00Z',
  });
  const expCsvLines = contractToCsv(contract).split('\n').length;
  const expDxfVerts = (contractToDxf(contract).match(/VERTEX/g) || []).length;
  const expTdTvdss = contract.stations[contract.stations.length - 1].tvdss;

  await page.goto('/dev/well-design');
  await expect(page.getByTestId('wd-csvlines')).toHaveText(String(expCsvLines));
  await expect(page.getByTestId('wd-dxfverts')).toHaveText(String(expDxfVerts));
  await expect(page.getByTestId('wd-tdtvdss')).toHaveText(expTdTvdss.toFixed(1));

  // 3D window: WebGL pixels are unreadable in e2e (house rule), but the
  // camera-projected DOM labels are assertable, and the snapshot path
  // must yield a real PNG data URL.
  await expect(page.getByTestId('wp-cube-view')).toBeVisible();
  await expect(page.getByTestId('wp-cube-label-wellhead').first()).toContainText('HAR-1');
  await expect(page.getByTestId('wp-cube-label-target').first()).toContainText('Amber sand');
  await page.getByTestId('wp-cube-snapshot').click();
  const bytes = await page.getByTestId('wd-snapbytes').textContent();
  expect(Number(bytes)).toBeGreaterThan(5000);
});

test('publish payload + survey-listing PDF in the browser bundle (WD6)', async ({ page }) => {
  const stations = [];
  for (let i = 0; i < 40; i++) {
    const md = i * 50;
    stations.push({ md, inc: Math.min(30, Math.max(0, (md - 300) / 30)), azi: 90 });
  }
  const wellbore = {
    id: 'harness-wb', name: 'HAR-1', head_x: 500000, head_y: 6800000,
    kb_elev_m: 30, depth_unit: 'm', grid_convergence_deg: -1.2,
  };
  // publish payload: recompute with the same pure module the bundle ships
  const payload = preparePublishPayload({
    site: { id: 'harness-site', crs: 'EPSG:32631', xy_unit: 'm' },
    wellbore,
    design: { id: 'harness-design', name: 'Harness plan', revision: 1 },
    stations,
    publishedAt: '2026-08-25T00:00:00Z',
  });
  // survey-listing PDF: same generator in node (logo fetch fails ->
  // brand mark omitted in BOTH environments? no — the browser CAN fetch
  // the logo, which changes bytes but not pagination; compare pages).
  const contract = buildTrajectoryContract({
    site: { name: 'Harness pad', crs: 'EPSG:32631', xy_unit: 'm' },
    wellbore,
    design: { name: 'Harness plan', revision: 1, status: 'draft' },
    stations,
    generatedAt: '2026-08-25T00:00:00Z',
  });
  const nodeDoc = await generateSurveyListing({ contract, generatedAt: '2026-08-25 00:00' });
  const expPages = nodeDoc.internal.getNumberOfPages();

  await page.goto('/dev/well-design');
  await expect(page.getByTestId('wd-pubdev'))
    .toHaveText(`${payload.deviation.length}@${payload.tdMdM}`);
  await page.getByTestId('wd-pdf-run').click();
  await expect(page.getByTestId('wd-pdfprobe')).not.toHaveText('--', { timeout: 15000 });
  const probe = await page.getByTestId('wd-pdfprobe').textContent();
  const [pages, bytes] = probe.split(/[p/]+/).map(Number);
  expect(pages).toBe(expPages);
  expect(bytes).toBeGreaterThan(10000);
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

test('a target in another coordinate frame is refused by name and left off the plan view (2026-09-03 fix)', async ({ page }) => {
  await page.goto('/dev/well-design');
  // the harness carries one wrong-frame target: it is skipped, not drawn at 475 km west
  await expect(page.getByTestId('wd-target-problems')).toHaveText('1');
  await page.getByTestId('wd-open-solver').click();
  await page.getByTestId('solver-target-trigger').click();
  await page.getByRole('option', { name: /Wrong frame pick/ }).click();
  await page.getByTestId('solver-kop').fill('300');
  await page.getByTestId('solver-apply').click();
  const problem = page.getByTestId('solver-problem');
  await expect(problem).toContainText('not in the same coordinate frame');
  await expect(problem).toContainText('500,000 E, 6,800,000 N');
  await expect(problem).not.toContainText('of hole, past the');
  // the design did not change
  await expect(page.getByTestId('wd-md')).toHaveText('500.0');
  // and the good target still solves afterwards
  await page.getByTestId('solver-target-trigger').click();
  await page.getByRole('option', { name: /Amber sand/ }).click();
  await page.getByTestId('solver-buildrate').fill('3');
  await page.getByTestId('solver-apply').click();
  await expect(page.getByTestId('wd-md')).not.toHaveText('500.0');
  await expect(page.getByTestId('plan-view-chart')).toBeVisible();
});
