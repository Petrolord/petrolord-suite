// Well Cost & Time Estimator (Drilling D11) acceptance: the
// /dev/well-cost harness mounts the REAL app on the in-memory backend
// seeded with the oracle golden estimate (fixed Monte Carlo seed); the
// UI must reproduce the engine's answers — expectations recomputed here
// through the same pure wctRun service + vendored engines + canonical
// sampler.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runDeterministic, runMonteCarlo, buildGoldenCaseDoc,
} from '../src/pages/apps/WellCostTime/services/wctRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'wellcost_cases.json',
), 'utf8'));

const doc = buildGoldenCaseDoc(golden);
const res = runDeterministic({ caseDoc: doc });
const usd = (v) => Math.round(v).toLocaleString('en-US');

test('harness reproduces the golden schedule off the UI', async ({ page }) => {
  await page.goto('/dev/well-cost');
  await expect(page.getByTestId('wct-total-days')).toContainText(
    `${res.program.totals.totalDays.toFixed(1)} days`, { timeout: 20000 });
  await expect(page.getByTestId('wct-productive-hr')).toContainText(
    `${res.program.totals.productiveHr.toFixed(0)} h`);
  await expect(page.getByTestId('wct-banner')).toContainText(res.kpis.status);
  await expect(page.getByTestId('wct-timedepth-chart')).toBeVisible();
});

test('AFE rollup, accrual chart and cost per metre match the oracle', async ({ page }) => {
  await page.goto('/dev/well-cost');
  await expect(page.getByTestId('wct-total-days')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('wct-tab-cost').click();
  await expect(page.getByTestId('wct-tangible')).toContainText(usd(res.costs.tangibleUsd));
  await expect(page.getByTestId('wct-base')).toContainText(usd(res.costs.baseUsd));
  await expect(page.getByTestId('wct-contingency-usd')).toContainText(usd(res.costs.contingencyUsd));
  await expect(page.getByTestId('wct-total-usd')).toContainText(usd(res.costs.totalUsd));
  await expect(page.getByTestId('wct-costtime-chart')).toBeVisible();
  // Default calculator inputs are the oracle fixture: 770.00 USD/m.
  await expect(page.getByTestId('wct-cpm-result')).toContainText(
    `${golden.costPerMeter.usdPerM.toFixed(2)} USD/m`);
});

test('seeded Monte Carlo reproduces the recomputed percentiles exactly', async ({ page }) => {
  const mc = runMonteCarlo({ caseDoc: doc });
  await page.goto('/dev/well-cost');
  await expect(page.getByTestId('wct-total-days')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('wct-tab-risk').click();
  await page.getByTestId('wct-run-mc').click();
  await expect(page.getByTestId('wct-mc-cost-p50')).toContainText(
    `${(mc.cost.p50 / 1e6).toFixed(2)} MM`, { timeout: 20000 });
  await expect(page.getByTestId('wct-mc-cost-p10')).toContainText(`${(mc.cost.p10 / 1e6).toFixed(2)} MM`);
  await expect(page.getByTestId('wct-mc-cost-p90')).toContainText(`${(mc.cost.p90 / 1e6).toFixed(2)} MM`);
  await expect(page.getByTestId('wct-mc-days-p90')).toContainText(`${mc.days.p90.toFixed(1)} d`);
  await expect(page.getByTestId('wct-histogram-chart')).toBeVisible();
  await expect(page.getByTestId('wct-scurve-chart')).toBeVisible();
  await expect(page.getByTestId('wct-tornado-chart')).toBeVisible();
});

test('editing an ROP reschedules exactly and save persists', async ({ page }) => {
  await page.goto('/dev/well-cost');
  await expect(page.getByTestId('wct-total-days')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('wct-act-a4-ropMPerHr').fill('12');
  const moved = runDeterministic({
    caseDoc: {
      ...doc,
      program: {
        ...doc.program,
        activities: doc.program.activities.map((a) => (a.id === 'a4' ? { ...a, ropMPerHr: 12 } : a)),
      },
    },
  });
  await expect(page.getByTestId('wct-total-days')).toContainText(
    `${moved.program.totals.totalDays.toFixed(1)} days`);

  await page.getByTestId('wct-save-case').click();
  await expect(page.getByTestId('wct-save-case')).toHaveCount(0, { timeout: 10000 });

  await page.getByTestId('wct-duplicate-case').click();
  await expect(page.getByTestId('wct-case-Golden Cost & Time (copy)')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('wct-case-Golden Cost & Time').click();
  await expect(page.getByTestId('wct-act-a4-ropMPerHr')).toHaveValue('12');
});

test('report summary and the immutable run history round-trip', async ({ page }) => {
  await page.goto('/dev/well-cost');
  await expect(page.getByTestId('wct-total-days')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('wct-tab-report').click();
  await expect(page.getByTestId('wct-report-total')).toContainText(usd(res.costs.totalUsd));
  await expect(page.getByTestId('wct-report-days')).toContainText(res.program.totals.totalDays.toFixed(1));
  await page.getByTestId('wct-save-run').click();
  await expect(page.getByTestId('wct-run-row')).toHaveCount(1, { timeout: 10000 });
  await expect(page.getByTestId('wct-run-row')).toContainText(usd(res.costs.totalUsd));
});
