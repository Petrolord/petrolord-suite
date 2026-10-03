// Fluid Systems Studio, Step 2 of the Reservoir round (FLUID-U2;
// docs/upgrade/FluidSystemsStudio-UPGRADE.md). On the /dev harness, signed
// out (oilfield units).
//
//   U2-001  lab tables through the door: a file chosen, read back, loaded;
//           lab points on the PVT plots; the report's lab figures and misfit.
//   U2-004  correlations matched to the lab: the status, and the claim
//           withdrawn when the fluid moves.
//   U2-003  the simulator keywords file: units and conventions in comments.
//   U2-009  the composition door on the Composition tab.
//   U2-026  the table top asked for through the address.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/fluid-systems-u2';
fs.mkdirSync(OUT, { recursive: true });
const LAB = path.join('e2e', 'fixtures', 'fluid-systems', 'lab');
const COMP = path.join('e2e', 'fixtures', 'fluid-systems', 'composition');

const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}

async function openApp(page, query = '') {
  await page.goto(`/dev/fluid-systems-studio${query}`, { timeout: 120000 });
  await expect(page.getByText('Oil FVF @ Pb')).toBeVisible({ timeout: 120000 });
}

const typeField = async (page, id, value) => {
  const f = page.locator(`#${id}`);
  await f.fill('');
  await f.type(String(value));
  await f.blur();
};

/** The Good Oil study as a black-oil fluid: the inputs and the three lab tables. */
async function goodOil(page) {
  await openRail(page);
  await typeField(page, 'api', 40.7);
  await typeField(page, 'gor', 768);
  await typeField(page, 'gasSg', 0.855);
  await typeField(page, 'temp', 220);
  await page.getByRole('tab', { name: 'Lab data' }).click();
  for (const name of ['good-oil-dl-title-tabs.txt', 'good-oil-cce-spaces.txt', 'good-oil-viscosity.csv']) {
    await page.getByTestId('lab-file').setInputFiles(path.join(LAB, name));
    await expect(page.getByTestId('lab-readback')).toHaveAttribute('data-ok', 'yes');
    await page.getByTestId('lab-load').click();
  }
  await typeField(page, 'lab-bofb', 1.474);
  await typeField(page, 'lab-rsfb', 768);
}

test.describe('Fluid Systems Studio U2', () => {
  test.setTimeout(240000);

  test('lab tables in, on the plots, matched, in the report and the keyword file', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    await goodOil(page);
    await expect(page.getByTestId('lab-table-dl')).toContainText('Differential liberation: 12 rows');
    await expect(page.getByTestId('lab-table-cce')).toContainText('24 rows');
    await expect(page.getByTestId('lab-psat')).toContainText('2,635 psia');
    await expect(page.getByTestId('lab-qc')).toBeVisible();

    // lab points on every PVT plot, a sixth plot for the relative volume
    await expect(page.getByTestId('pvt-chart-bo')).toHaveAttribute('data-lab-points', '20');
    await expect(page.getByTestId('pvt-chart-relvol')).toHaveAttribute('data-lab-points', '24');
    await expect(page.getByTestId('fluid-lab-misfit')).toContainText('Oil formation volume factor Bo: 20 points');

    // match, then an edit withdraws the claim
    await page.getByTestId('fluid-lab-match-run').click();
    await expect(page.getByTestId('fluid-lab-match-status')).toHaveText('Matched to lab');
    await expect(page.getByText('Oil FVF @ Pb').locator('xpath=ancestor::div[contains(@class,"rounded")][1]')).toContainText('1.475');

    // the report: lab figures and the match, read back
    await page.getByRole('tab', { name: 'Report' }).last().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('fluid-export-pdf').click();
    const file = path.join(OUT, 'good-oil-matched.pdf');
    await (await downloadPromise).saveAs(file);
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
    expect(text).toMatch(/Laboratory values against the model: oil properties/);
    expect(text).toMatch(/Laboratory data against the model/);
    expect(text).toMatch(/Matched to lab\./);
    expect(text).toMatch(/Mass balance of the differential liberation/);

    // the keyword file
    const kwPromise = page.waitForEvent('download');
    await page.getByTestId('fluid-export-sim').click();
    const kw = path.join(OUT, 'keywords.inc');
    await (await kwPromise).saveAs(kw);
    const deck = fs.readFileSync(kw, 'utf8');
    expect(deck).toMatch(/^-- UNITS \(FIELD\)/m);
    expect(deck).toMatch(/^PVTO$/m);
    expect(deck).toMatch(/^PVDG$/m);
    expect(deck).toMatch(/^PVTW$/m);
    expect(deck).toMatch(/correlations matched to lab data/);

    // the fluid moves: the match is no longer claimed
    await openRail(page);
    await page.getByRole('tab', { name: 'Stream A' }).click();
    await typeField(page, 'api', 39);
    await page.getByRole('tab', { name: 'PVT Analysis' }).click();
    await expect(page.getByTestId('fluid-lab-match-status')).toHaveText('Matched, not confirmed');
    expect(errors).toEqual([]);
  });

  test('a file the door cannot use is refused with the reason', async ({ page }) => {
    await openApp(page);
    await openRail(page);
    await page.getByRole('tab', { name: 'Lab data' }).click();
    await page.getByTestId('lab-file').setInputFiles(path.join(LAB, 'good-oil-dl-no-header.csv'));
    await expect(page.getByTestId('lab-readback')).toHaveAttribute('data-ok', 'no');
    await expect(page.getByTestId('lab-readback')).toContainText('no header row');
    await expect(page.getByTestId('lab-load')).toHaveCount(0);
  });

  test('the composition door on the Composition tab', async ({ page }) => {
    await openApp(page);
    await openRail(page);
    await page.getByText('Black oil correlations (default)').click();
    await page.getByRole('option', { name: /Compositional PR78/ }).click();
    await page.getByRole('tab', { name: 'Composition' }).click();
    await page.getByTestId('composition-file').setInputFiles(path.join(COMP, 'good-oil-fraction-semicolon.csv'));
    await expect(page.getByTestId('composition-readback')).toContainText('mole fraction (read from the header)');
    await page.getByTestId('composition-apply').click();
    await expect(page.locator('#z-C1')).toHaveValue('36.47');
    await expect(page.locator('#plus-mw')).toHaveValue('218');
  });

  test('a consumer asks for a longer table through the address', async ({ page }) => {
    await openApp(page, '?pvtPMax=9000&pvtFor=Material%20Balance%20Studio');
    await openRail(page);
    await page.getByRole('tab', { name: 'Stream A' }).click();
    await expect(page.locator('#table-top')).toHaveValue('9000');
    await expect(page.getByText('Asked for by Material Balance Studio')).toBeVisible();
  });
});
