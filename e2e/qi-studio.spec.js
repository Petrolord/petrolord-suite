// QI Studio (QI programme Q12, 2026-10-07; docs/upgrade/QI-UPGRADE.md) walked
// in a real browser on the /dev/qi-studio harness (the in-memory backend:
// three wells with different gaps, one full stack, three prestack datasets).
// The Package 1 audit from setup to the PDF read back with pdftotext, seismic
// QC with its footprint issue, the prestack chain, and every tab at the
// tester viewport 1366x768 in both themes with no page errors and no sideways
// scroll. Expected values are those the in-memory backend is built to return
// (services/inMemoryBackend.js) or that the engine computes, never a number
// read off the screen.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import process from 'process';

const SHOTS = process.env.QI_SHOTS || 'test-results';
const VIEWPORT = { width: 1366, height: 768 };
// the first page of a cold dev server compiles the whole app: give it room
test.describe.configure({ timeout: 360000 });
const TABS = ['setup', 'inventory', 'usability', 'qc', 'ties', 'prestack', 'avo', 'inversion', 'simultaneous', 'properties', 'prospects', 'issues', 'feasibility', 'report'];

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(VIEWPORT);
  await page.goto('/dev/qi-studio', { waitUntil: 'commit' });
  await expect(page.getByTestId('qi-well-qi-w1')).toBeVisible({ timeout: 300000 });
  return errors;
}

async function setUp(page) {
  for (const w of ['qi-w1', 'qi-w2', 'qi-w3']) await page.getByTestId(`qi-well-${w}`).click();
  await page.getByTestId('qi-target-SAND A').click({ timeout: 30000 });
  await page.getByTestId('qi-seismic-date').fill('2021-03-01');
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('the Package 1 audit: usability reasons, suggested issues, a feasibility verdict and the PDF', async ({ page }) => {
  const errors = await open(page);
  await setUp(page);
  await page.getByTestId('qi-tab-usability').click();
  await expect(page.getByTestId('qi-cell-qi-w1-SAND A')).toContainText('Good');
  await expect(page.getByTestId('qi-cell-qi-w2-SAND A')).toContainText('Limited');
  await expect(page.getByTestId('qi-cell-qi-w3-SAND A')).toContainText('Missing');
  await page.getByTestId('qi-cell-qi-w3-SAND A').click();
  await expect(page.getByTestId('qi-cell-detail')).toContainText('The well elevation is not set');

  await page.getByTestId('qi-tab-issues').click();
  await expect(page.getByTestId('qi-issue-row').first()).toContainText(/^high/);
  await expect(page.getByTestId('qi-issue-row').filter({ hasText: 'AKOMA-2: shear sonic (vs) limited' })).toHaveCount(1);

  await page.getByTestId('qi-tab-feasibility').click();
  await page.getByTestId('qi-feas-verdict-SAND A').selectOption('feasible');

  await page.getByTestId('qi-tab-report').click();
  await expect(page.getByTestId('qi-report-summary')).toContainText('3 wells and 1 target interval were audited');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('qi-report-download').click()]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qi-')), 'report.pdf');
  await download.saveAs(f);
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
  expect(text).toContain('Quantitative Interpretation Report');
  expect(text).toContain('Usability matrix');
  expect(text).toContain('BONSU-3');
  expect(text).toContain('The well elevation is not set');
  expect(text).toContain('Feasibility: SAND A');
  expect(text).toContain('Verdict: Feasible.');
  expect(errors).toEqual([]);
});

test('seismic QC finds the footprint stripe and adds it to the issue register', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('qi-volume-qi-v1').click();
  await page.getByTestId('qi-tab-qc').click();
  await page.getByTestId('qi-qc-run-qi-v1').click();
  const result = page.getByTestId('qi-qc-result');
  await expect(result).toContainText('Footprint at (ms)', { timeout: 120000 });
  await expect(result).toContainText('stripe: period 4.0'); // the in-memory volume has a stripe every 4 crosslines
  await expect(page.locator('[data-canvas="chart"]').first()).toBeVisible();
  await page.getByTestId('qi-qc-issues-qi-v1').click();
  await page.getByTestId('qi-tab-issues').click();
  await expect(page.getByTestId('qi-issue-row').filter({ hasText: 'acquisition footprint' }).first()).toBeVisible();
  expect(await sideways(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('prestack: gathers built, angle stacks with a velocity table, trim statics and the gather QC', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('qi-tab-prestack').click();
  await page.getByTestId('qi-pre-bin').fill('25');
  await page.getByTestId('qi-pre-build-qi-d1').click();
  await page.getByTestId('qi-pre-vel').fill('0 1700\n1500 2300\n3000 2900');
  await page.getByTestId('qi-pre-stack-qi-d2').click();
  await expect(page.getByTestId('qi-pre-result-qi-d2')).toContainText(/near 0 to 15 degrees \(40000 traces\)/, { timeout: 60000 });
  await page.getByTestId('qi-pre-trim-centre').fill('900');
  await page.getByTestId('qi-pre-trim-qi-d2').click();
  await page.getByTestId('qi-pre-qc-qi-d2').click();
  const qc = page.getByTestId('qi-pre-qc-result-qi-d2');
  await expect(qc).toContainText('1480 CDPs sampled (every 4); median fold 58, far covered offset 3000 m', { timeout: 60000 });
  expect(await sideways(page)).toBe(false);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`every tab at 1366x768, ${theme}: opens with no page errors and no sideways scroll`, async ({ page }) => {
    const errors = await open(page);
    if (theme === 'dark') await page.getByTestId('theme-toggle').click();
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    await setUp(page);
    await page.getByTestId('qi-volume-qi-v1').click();
    const wide = [];
    for (const t of TABS) {
      await page.getByTestId(`qi-tab-${t}`).click();
      await expect(page.getByTestId(`qi-tab-${t}`)).toHaveAttribute('aria-selected', 'true');
      await page.waitForTimeout(300);
      if (await sideways(page)) wide.push(t);
      await page.screenshot({ path: `${SHOTS}/qi-${theme}-${t}.png`, fullPage: true });
    }
    expect(wide).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the help guide link from the harness, and the guide route gated like the app', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('link', { name: 'Help guide' })).toHaveAttribute('href', '/dashboard/apps/geoscience/qi-studio/help');
  await page.goto('/dashboard/apps/geoscience/qi-studio/help');
  await expect(page).toHaveURL(/\/login/, { timeout: 60000 });
});
