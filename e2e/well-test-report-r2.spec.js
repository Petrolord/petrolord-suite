// Well Test Analysis Studio, tester round 2 (report review received
// 2026-10-02; docs/upgrade/WellTestAnalysis-TesterRound2.md). The report
// door on the /dev harness, signed out:
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the Report tab
//        shows the identification, skin components, inputs table, flow
//        summary and the list of plots, with no sideways page scroll, and
//        the Data tab charts stay on white.
//   PL7  the exported PDF is read back with pdftotext, pdfinfo and
//        pdfimages: identification, inputs with sources, the skin split,
//        the flow summary, the figures with their captions, and the
//        strengths the tester asked to keep.
//   PL2  a gauge file with a temperature column: the column is found from
//        its header and the overview plots it.
//   PL9  the wells registry door: proposals from a registry well are shown,
//        and nothing changes until they are applied.
//   PL4  a perforated interval longer than the pay is refused with a
//        reason, on the screen and in the PDF.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Buffer } from 'buffer';

const OUT = 'test-results/well-test-report-r2';
fs.mkdirSync(OUT, { recursive: true });

// Below 768 px the left rail is a drawer: it is opened to reach the inputs
// and closed again to see the results.
const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}
async function closeRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Close panel' }).first().click();
}

async function openWithSample(page) {
  await page.goto('/dev/well-test-analysis-studio');
  // a cold harness can take a while to open on a loaded box
  await expect(page.getByRole('tab', { name: 'Data' })).toBeVisible({ timeout: 120000 });
  await openRail(page);
  await page.getByRole('button', { name: /Sample/i }).click();
  await closeRail(page);
  await expect(page.getByText(/Points used/i)).toBeVisible();
}

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const field = (page, label) => page.locator('label', { hasText: label }).first().locator('xpath=following-sibling::input[1] | ../input');

async function exportPdf(page, name) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF report/i }).click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { file, text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: the report door shows what a reviewer signs against`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openWithSample(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      // Data tab: the overview chart draws on white in both themes
      await expect(page.getByText('Test overview').first()).toBeVisible();
      await expect(page.getByTestId('wts-flow-summary-edit')).toBeVisible();
      const frames = page.locator('[data-canvas="chart"]');
      await expect(frames).toHaveCount(2);
      for (let i = 0; i < 2; i += 1) {
        await expect.poll(() => frames.nth(i).evaluate((f) => f.querySelectorAll('.recharts-line-curve').length)).toBeGreaterThan(0);
        expect(await frames.nth(i).evaluate((f) => getComputedStyle(f).backgroundColor)).toBe('rgb(255, 255, 255)');
        await expect(frames.nth(i).locator('img[alt="Petrolord"]')).toBeAttached();
      }
      expect(await noPageScroll(page)).toBe(true);

      await page.getByRole('tab', { name: 'Report' }).click();
      const ident = page.getByTestId('wts-report-identification');
      await expect(ident).toBeVisible();
      await expect(ident).toContainText('Well');
      await expect(ident).toContainText('Sample well 1');
      await expect(ident).toContainText('Zone or sand');
      await expect(ident).toContainText('Sample sand');
      await expect(ident).toContainText('Licence');
      await expect(ident).toContainText('n/a');
      await expect(ident).toContainText(/Perforations, MD\s*9850 to 9880 ft/);

      const skin = page.getByTestId('wts-report-skin');
      await expect(skin).toContainText('Partial-penetration pseudo-skin s_pp');
      await expect(skin).toContainText('Papatzacos (1987)');
      await expect(skin).toContainText('Mechanical (damage) skin s_d');
      await expect(skin).toContainText('Assumed default 0.1');

      const inputs = page.getByTestId('wts-report-inputs');
      await expect(inputs).toContainText('Net pay h');
      await expect(inputs).toContainText('Total compressibility ct');
      await expect(inputs).toContainText('entered as total');
      await expect(inputs).toContainText('Not provided');

      const flow = page.getByTestId('wts-report-flow');
      await expect(flow).toContainText('Shut-in');
      await expect(flow).toContainText('675.0');

      const figs = page.getByTestId('wts-report-figures');
      await expect(figs.locator('li')).toHaveCount(6);
      await expect(figs.locator('li[data-figure="overview"]')).toHaveAttribute('data-plotted', 'yes');
      await expect(figs.locator('li[data-figure="semilog"]')).toHaveAttribute('data-plotted', 'yes');
      await expect(figs.locator('li[data-figure="sqrt"]')).toContainText('Does not apply');
      await expect(figs.locator('li[data-figure="rta"]')).toContainText('was not run');

      // wide tables scroll inside their card, never the page
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}.png`), fullPage: true });
    });
  }
}

test('PL7: the exported PDF carries the reviewer content and the plots, read back', async ({ page }) => {
  await openWithSample(page);
  // identify the test and state two sources, the way a reviewer would ask
  await field(page, 'Field').fill('Obodo');
  await field(page, 'Analyst').fill('A. Analyst');
  await field(page, 'Licence or block').fill('OML 143');
  await page.locator('#wts-test-date-start').fill('2026-09-14');
  await page.locator('#wts-test-date-end').fill('2026-09-17');
  await page.getByRole('button', { name: /Input sources and quality/i }).click();
  await page.getByLabel('Viscosity mu source').click();
  await page.getByRole('option', { name: 'Measured (lab)' }).click();
  await page.getByLabel('Viscosity mu note').fill('Bottomhole sample 2, OBM contamination 4 percent');
  // choke and recovered volume for the flow period
  await page.getByLabel('Choke, period 1').fill('32');
  await page.getByLabel('Recovered volume, period 1').fill('660');

  // regression, so the report can state it
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByRole('button', { name: /Auto-fit model/i }).click();
  await expect(page.getByText(/Regression result \(converged\)/i)).toBeVisible({ timeout: 120000 });

  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-crosscheck')).toContainText('Regression on pressure and derivative, converged');
  const pdf = await exportPdf(page, 'sample-reviewed.pdf');
  const t = pdf.flat;

  // identification
  expect(t).toMatch(/Well Sample well 1/);
  expect(t).toMatch(/Field Obodo/);
  expect(t).toMatch(/Licence OML 143/);
  expect(t).toMatch(/Zone or sand Sample sand/);
  expect(t).toMatch(/Test type Pressure buildup, production test/);
  expect(t).toMatch(/Test dates 2026-09-14 to 2026-09-17/);
  expect(t).toMatch(/Perforations, MD 9850 to 9880 ft/);
  // inputs with units and sources
  expect(t).toMatch(/Reservoir and fluid inputs/);
  expect(t).toMatch(/Net pay h 45 ft/);
  expect(t).toMatch(/Oil viscosity mu_o 0\.9 cp Measured \(lab\)\. Bottomhole sample 2, OBM contamination 4 percent/);
  expect(t).toMatch(/Water saturation Sw n\/a fraction Not provided/);
  // skin split
  expect(t).toMatch(/Partial-penetration pseudo-skin s_pp \d+\.\d\d Papatzacos \(1987\)/);
  expect(t).toMatch(/Mechanical \(damage\) skin s_d -?\d+\.\d\d s_d = \(hp\/h\) \(s - s_pp\)/);
  // flow summary with what was typed on the Data tab
  expect(t).toMatch(/1 Flow 0 36 32 450\.0 675\.0 675\.0 660/);
  // figures
  expect(t).toMatch(/Figure 1\. Test overview/);
  expect(t).toMatch(/Figure 2\. Log-log diagnostic plot/);
  expect(t).toMatch(/The lines are the Homogeneous reservoir match \(regression\)/);
  expect(t).toMatch(/Figure 3\. Horner semilog plot/);
  expect(t).toMatch(/Slope m = \d+\.\d psi\/cycle/);
  expect(t).toMatch(/Fit window [\d.]+ to [\d.]+ hr/);
  expect(t).toMatch(/Figure 4\. Square-root-of-time plot Does not apply/);
  expect(t).toMatch(/Figure 5\. History match/);
  expect(t).toMatch(/Figure 6\. Rate transient analysis plots Rate transient analysis was not run/);
  // strengths kept
  expect(t).toMatch(/Model match: Homogeneous reservoir \(regression converged\)/);
  expect(t).toMatch(/Parameter Value 95% confidence/);
  expect(t).toMatch(/Permeability \(md\) \d+\.\d \d+\.\d to \d+\.\d/);
  expect(t).toMatch(/Flow regimes observed Regime From \(hr\) To \(hr\)/);
  expect(t).toMatch(/Radial flow \d/);
  expect(t).toMatch(/Cross-check of methods/);
  expect(t).toMatch(/Horner straight line \d+\.\d \d+\.\d\d/);
  // the screen and the PDF agree on the headline permeability
  await expect(page.getByTestId('wts-report-crosscheck')).toContainText(/Model match, Homogeneous reservoir/);
  const kOnScreen = (await page.getByTestId('wts-report-crosscheck').locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
  expect(t).toContain(`Model match, Homogeneous reservoir ${kOnScreen}`);
  // five pages, the Petrolord mark embedded on the plot pages, Latin-1 only
  expect(pdf.pages).toBe(5);
  expect(pdf.images.length).toBeGreaterThanOrEqual(1);
  // eslint-disable-next-line no-control-regex
  expect(pdf.text).not.toMatch(/[^\x00-\xff]/);
  expect(pdf.text).not.toMatch(/undefined|NaN/);
});

test('PL2: a gauge file with a temperature column plots temperature on the overview and in the PDF', async ({ page }) => {
  await openWithSample(page);
  // pressure first, temperature in degC, time in minutes: all found from the headers
  const rows = ['BHP (psia),Gauge temp (degC),Elapsed (min)'];
  for (let i = 0; i < 60; i += 1) {
    const hr = 0.01 * 1.18 ** i;
    rows.push(`${(4530 + 60 * Math.log10(1 + 400 * hr)).toFixed(2)},${(99.4 + 0.3 * Math.log10(1 + 50 * hr)).toFixed(3)},${(hr * 60).toFixed(4)}`);
  }
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'gauge-temp.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  const mapping = page.getByTestId('wts-import-mapping');
  await expect(mapping).toContainText('60 readings loaded, 60 with a temperature');
  await expect(mapping.getByLabel('Temperature column')).toContainText('Gauge temp (degC)');
  await expect(mapping.getByLabel('Temperature unit')).toContainText('degC');
  await expect(page.getByText('Gauge temperature').first()).toBeVisible();
  await expect(page.locator('[data-canvas="chart"]')).toHaveCount(3);
  await expect(page.getByText(/Temperature \(degF\)/).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Report' }).click();
  const pdf = await exportPdf(page, 'with-temperature.pdf');
  expect(pdf.flat).toMatch(/Temperature \(degF\)/);
  expect(pdf.flat).toMatch(/The lower panel is the gauge temperature from the imported file/);
  expect(pdf.flat).not.toMatch(/No temperature column was imported/);
});

test('PL9: registry proposals are shown, and nothing changes until they are applied', async ({ page }) => {
  await openWithSample(page);
  await page.getByRole('button', { name: /Propose from the wells registry/i }).click();
  await page.getByLabel('Registry well').click();
  await page.getByRole('option', { name: /Harness-7/ }).click();
  const card = page.getByTestId('wts-registry-proposal');
  await expect(card).toContainText('Proposed from Harness-7');
  await expect(card).toContainText('Nothing changes until you apply');
  await card.getByLabel('Zone tested').click();
  await page.getByRole('option', { name: /D-3 sand/ }).click();
  await expect(card).toContainText('Zone or sand: D-3 sand');
  await expect(card).toContainText(/net pay 45\.0 ft/);
  await expect(card).toContainText(/Perforations in TVD: \d+\.\d to \d+\.\d ft\. Deviation survey of registry well Harness-7/);
  // not applied yet
  await expect(field(page, 'Well name')).toHaveValue('Sample well 1');
  await expect(field(page, 'Zone or sand')).toHaveValue('Sample sand');
  await page.getByTestId('wts-registry-apply').click();
  await expect(field(page, 'Well name')).toHaveValue('Harness-7');
  await expect(field(page, 'Zone or sand')).toHaveValue('D-3 sand');
  // a 35 degree hole: 30 ft along hole is about 24.6 ft vertically
  await expect(page.getByTestId('wts-completion-readout')).toContainText(/Perforated length 24\.\d ft \(TVD\)/);

  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-identification')).toContainText(/Perforations, TVD\s*\d+\.?\d* to \d+\.?\d* ft/);
  await expect(page.getByTestId('wts-report-inputs')).toContainText('Petrophysics zone summary of Harness-7, zone D-3 sand');
});

test('PL4: perforations longer than the net pay are refused with the reason, on screen and in the PDF', async ({ page }) => {
  await openWithSample(page);
  await field(page, 'Perforations base, MD').fill('9950');
  await expect(page.getByTestId('wts-completion-readout')).toContainText('The perforated length is greater than net pay h. The skin is not split.');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-skin-note')).toContainText('The perforated length is greater than net pay h');
  const pdf = await exportPdf(page, 'refused-split.pdf');
  expect(pdf.flat).toMatch(/Partial-penetration pseudo-skin s_pp n\/a Not computed/);
  expect(pdf.flat).toMatch(/The perforated length is greater than net pay h\. The skin is not split\./);
});

test('PL3: SI display converts the report, it does not relabel it', async ({ page }) => {
  await openWithSample(page);
  await page.getByText('Oilfield (psi, ft, STB/D)').click();
  await page.getByRole('option', { name: /SI \/ metric/i }).click();
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-inputs')).toContainText('13.716');
  await expect(page.getByTestId('wts-report-identification')).toContainText(/3002\.3 to 3011\.4 m/);
  const pdf = await exportPdf(page, 'si.pdf');
  expect(pdf.flat).toMatch(/Net pay h 13\.716 m/);
  expect(pdf.flat).toMatch(/Perforations, MD 3002\.3 to 3011\.4 m/);
  expect(pdf.flat).toMatch(/Pressure \(kPa\)/);
  expect(pdf.flat).toMatch(/Rate \(m3\/d\)/);
});
