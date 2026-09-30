// AppUpgrade Step 2 for Stratigraphy Studio (docs/upgrade/StratigraphyStudio-UPGRADE.md,
// batch decision 2026-09-30): what needs a real browser, on the /dev harness.
//   PL6  the new views (Timescale, Events with the range chart and the age model,
//        the section with horizons and strips, the Wheeler by distance) at
//        1366x768, 1440x900 and 390 wide, light and dark: no page scroll, charts
//        on white chart paper with the watermark, depth down
//   PL7  the stratigraphic summary PDF downloaded and read back with pdftotext;
//        the range chart SVG read back with its header
//   PL10 an 84-unit column opens (U2-007), timed
// SHOTS=<dir> saves screenshots for the review.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const SHOTS = process.env.SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `strat-u2-${name}.png`) }); };

async function open(page, { query = '', theme = null } = {}) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('strat.scheme'); window.localStorage.removeItem('strat.zoneSchemes'); } catch (e) { /* ignore */ }
  });
  if (theme) await page.emulateMedia({ colorScheme: theme });
  await page.goto(`/dev/stratigraphy-studio${query}`);
  await expect(page.getByTestId('strat-view-column')).toBeVisible({ timeout: 60000 });
  if (theme === 'dark') {
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('[data-pl-theme="dark"]').first()).toBeAttached();
  }
}
const status = (page) => page.getByTestId('strat-status');
const noPageScroll = async (page) => {
  const s = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  expect(s.w).toBeLessThanOrEqual(s.cw + 1);
  expect(s.h).toBeLessThanOrEqual(s.ch + 1);
};
const whitePaper = async (loc) => {
  const bg = await loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
  await expect(loc.locator('img, svg').last()).toBeVisible();
};

test('U2-002/001: the section draws a Seismolord horizon and strips; the Wheeler spaces columns by distance', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByTestId('strat-view-section').click();
  await expect(page.getByTestId('strat-section-summary')).toContainText('3 wells', { timeout: 60000 });
  await page.getByTestId('strat-horizons').locator('summary').click();
  await page.getByTestId('strat-hz-surf-dome-depth').check();
  await expect(page.getByTestId('strat-hz-note-surf-dome-depth')).toContainText('drawn on 3 wells');
  await page.getByTestId('strat-strips').locator('summary').click();
  await page.getByTestId('strat-strip-pay').check();
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-well-notes', /KETA-2=[^;]*no published PAY/);
  await page.getByTestId('strat-col-width').selectOption('220');
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-col-w', '220,220,220');
  await shot(page, 'section-horizon-strips');
  await page.getByTestId('strat-view-wheeler').click();
  await page.getByTestId('strat-wheeler-spacing').selectOption('proportional');
  const chart = page.getByTestId('strat-wheeler-chart');
  await expect(chart).toHaveAttribute('data-spacing', 'proportional');
  // KETA-1 and KETA-2 are placed (KETA-3 has one dated surface); their wellheads are 1,265 m apart
  expect((await chart.getAttribute('data-col-x')).split(',')).toHaveLength(2);
  await expect(page.getByTestId('strat-wheeler-gap-0')).toHaveText('1.26 km');
  await whitePaper(chart);
  await shot(page, 'wheeler-distance');
});

for (const theme of ['light', 'dark']) {
  for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
    test(`PL6 ${theme} ${w}x${h}: Timescale, Events (range chart, age model) without page scroll, charts on white paper`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, { theme });
      await page.getByTestId('strat-view-timescale').click();
      await expect(page.getByTestId('strat-timescale-change-Berriasian')).toContainText('145');
      await expect(page.getByTestId('strat-timescale-change-Berriasian')).toContainText('143.1');
      await noPageScroll(page);
      await shot(page, `timescale-${theme}-${w}`);
      await page.getByTestId('strat-well-KETA-1').click();
      await page.getByTestId('strat-view-events').click();
      await page.getByTestId('strat-events-paste-toggle').click();
      await page.getByTestId('strat-events-paste-text').fill('MD (m),Event,Taxon\n1445,FDO,Taxon A\n1470,LDO,Taxon A\n1495,FDO,Taxon B\n1530,LDO,Taxon B\n1555,FDO,Taxon C');
      await page.getByTestId('strat-events-paste-apply').click();
      await expect(status(page)).toContainText('5 events added to KETA-1');
      const range = page.getByTestId('strat-range-chart');
      await expect(range).toHaveAttribute('data-taxa', '3');
      await whitePaper(range);
      // depth down: Taxon A (1445 to 1470 m) sits above Taxon C (1555 m)
      const yA = await page.getByTestId('strat-range-taxon-Taxon A').locator('circle').first().evaluate((c) => c.getBoundingClientRect().top);
      const yC = await page.getByTestId('strat-range-taxon-Taxon C').locator('circle').first().evaluate((c) => c.getBoundingClientRect().top);
      expect(yA).toBeLessThan(yC);
      await noPageScroll(page);
      await shot(page, `events-${theme}-${w}`);
    });
  }
}

test('U2-010: the age model fits the dated events and dates an undated top after the preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-view-events').click();
  await page.getByTestId('strat-events-paste-toggle').click();
  await page.getByTestId('strat-events-paste-text').fill('MD (m),Event,Taxon\n1445,FDO,Taxon A\n1470,LDO,Taxon A\n1530,FDO,Taxon B\n1555,LDO,Taxon B');
  await page.getByTestId('strat-events-paste-apply').click();
  await page.getByTestId('strat-events-dict-toggle').click();
  await page.getByTestId('strat-events-dict-text').fill('Taxon,Event,Age (Ma),Reference\nTaxon A,LAD,4.05,sample\nTaxon A,FAD,4.3,sample\nTaxon B,LAD,4.85,sample\nTaxon B,FAD,5.1,sample');
  await page.getByTestId('strat-events-dict-apply').click();
  await page.getByTestId('strat-events-date').click();
  await expect(status(page)).toContainText('Dated 4 events from the dictionary');
  // four events 110 m over 1.05 Myr: 105.7 m/Ma, R-squared 0.9997
  await expect(page.getByTestId('strat-agemodel-seg-0')).toContainText('105.7');
  await whitePaper(page.getByTestId('strat-agemodel-plot'));
  await page.getByTestId('strat-agemodel-preview').click();
  await expect(page.getByTestId('strat-agemodel-plan-Top Dome')).toContainText(/: 4\.5\d* Ma/);
  await page.getByTestId('strat-agemodel-apply').click();
  await expect(status(page)).toContainText('Dated 1 top from the event age model');
  await shot(page, 'agemodel');
});

test('PL7: the summary PDF and the range chart SVG read back with the reviewer header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByTestId('strat-report-analyst').fill('A. Geologist');
  await page.getByTestId('strat-report-field').fill('Keta (sample)');
  await page.getByTestId('strat-well-KETA-2').click();
  await page.getByTestId('strat-view-ages').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('strat-summary-pdf').click()]);
  const f = path.join(os.tmpdir(), `strat-u2-${process.pid}.pdf`);
  await dl.saveAs(f);
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'latin1' }).replace(/[ \t]+/g, ' ');
  fs.unlinkSync(f);
  for (const s of ['Stratigraphic summary', 'Well KETA-2', 'Field Keta (sample)', 'Prepared by A. Geologist', 'Timescale ICS 2026/06', 'TVD below KB through the survey', 'Reviewed by']) expect(text).toContain(s);
  expect(text).toMatch(/Top Marker Mid Shale 1469\.9 to 1606\.6 4 to 5 136\.7/);
  await page.getByTestId('strat-view-events').click();
  await page.getByTestId('strat-events-paste-toggle').click();
  await page.getByTestId('strat-events-paste-text').fill('MD (m),Event,Taxon\n1480,FDO,Taxon A\n1520,LDO,Taxon A');
  await page.getByTestId('strat-events-paste-apply').click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('strat-range-export-svg').click()]);
  const s = fs.readFileSync(await svg.path(), 'utf8');
  expect(s).toContain('Range chart: KETA-2');
  expect(s).toContain('Prepared by: A. Geologist');
  expect(s).toContain('Field: Keta (sample)');
});

test('PL10 (U2-007): an 84-unit column opens and a parent list works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t0 = Date.now();
  await open(page, { query: '?scaleUnits=1' });
  await expect(page.getByTestId('strat-unit-row-83')).toBeVisible({ timeout: 60000 });
  const ms = Date.now() - t0;
  console.log(`84-unit column open: ${ms} ms`);
  const options = await page.locator('[data-testid="strat-column-editor"] tbody option').count();
  expect(options).toBeLessThan(700);
  await page.getByTestId('strat-unit-parent-5').focus();
  await expect(page.getByTestId('strat-unit-parent-5').locator('option')).toHaveCount(84);
});
