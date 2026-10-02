// Wellsite Studio upgrade U2 (2026-10-01) on the /dev harness, in a real
// browser (PL6, PL7): a hostile mudlog file is imported through the file
// chooser, the strip log is drawn with depth increasing downward and no
// blank track, the d-exponent trend marks its departure, the strip log PDF
// is downloaded and read back with pdftotext, a carbide check corrects the
// lag, a chromatograph reading shows its ratios, an MWD station moves TVD,
// the office view follows, and every new view fits 1366x768, 1440x900,
// a tablet held upright and a 390 px phone in light and dark with no
// sideways scroll and no page errors.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SLOW = { timeout: 45000 };
const HOSTILE = path.join(process.cwd(), 'e2e/fixtures/wellsite/hostile');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.removeItem('ws.units'); } catch (e) { /* ignore */ } });
});

async function openStudio(page, query = '?reset=1') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/dev/wellsite-studio${query}`);
  await expect(page.getByTestId('ws-status-bit')).toHaveText('Bit 10000 ft', { timeout: 90000 });
  return errors;
}

async function importHostile(page, file, { datum = 'KB' } = {}) {
  await page.getByTestId('ws-nav-import').click();
  await page.getByTestId('ws-import-file').setInputFiles(path.join(HOSTILE, file));
  await expect(page.getByTestId('ws-import-read-summary')).toBeVisible(SLOW);
  await page.getByTestId('ws-import-datum').selectOption(datum);
}

const VIEWPORTS = [{ w: 1366, h: 768, compact: false }, { w: 1440, h: 900, compact: false }, { w: 820, h: 1180, compact: true }, { w: 390, h: 844, compact: true }];
for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${vp.w}x${vp.h} ${theme}: the new views fit, the strip log is drawn, no sideways scroll, no page errors`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors = await openStudio(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await importHostile(page, 'mudlog_depth_ft_reordered_units_in_header.csv');
      await page.getByTestId('ws-import-go').click();
      await expect(page.getByTestId('ws-status')).toContainText('12 row(s) imported', SLOW);
      fs.mkdirSync('test-results', { recursive: true });
      for (const view of ['import', 'surveys', 'log', 'observations', 'office']) {
        await page.getByTestId(`ws-nav-${view}`).click();
        await page.waitForTimeout(400);
        if (view === 'log') {
          await expect(page.getByTestId('ws-striplog')).toBeVisible(SLOW);
          // the chart surface is white in both themes (the Suite chart standard) and carries the logo
          const bg = await page.getByTestId('ws-striplog').evaluate((el) => getComputedStyle(el).backgroundColor);
          expect(bg).toBe('rgb(255, 255, 255)');
          await expect(page.getByTestId('ws-striplog').locator('img[alt="Petrolord"]')).toHaveCount(1);
        }
        await page.screenshot({ path: `test-results/ws-u2-${view}-${vp.w}-${theme}.png` });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sideways, `${view} page scroll`).toBeLessThanOrEqual(1);
        if (vp.compact) {
          const shell = await page.getByTestId('ws-compact').evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(shell, `${view} shell scroll`).toBeLessThanOrEqual(1);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test('U2-003, U2-001, U2-006: a hostile file through the file chooser, the strip log geometry and the d-exponent trend', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openStudio(page);
  await importHostile(page, 'mudlog_depth_ft_reordered_units_in_header.csv');
  await expect(page.getByTestId('ws-import-quantity-3')).toHaveValue('md');
  await expect(page.getByTestId('ws-import-unit-2')).toHaveValue('ft/hr');
  await expect(page.getByTestId('ws-import-preview-rows')).toHaveText('12 row(s) will be imported, 9800 ft to 9910 ft MD below KB.', SLOW);
  await page.getByTestId('ws-import-go').click();
  await expect(page.getByTestId('ws-status')).toContainText('12 row(s) imported', SLOW);
  // a description and a call so the lithology column and a top are drawn
  await page.getByTestId('ws-nav-tops').click();
  await page.getByTestId('ws-top-callbtn-top_agbada').click();
  await page.getByTestId('ws-top-depth-value').fill('9900');
  await page.getByTestId('ws-top-depth-value').blur();
  await page.getByTestId('ws-top-basis').fill('GR drop and sand');
  await page.getByTestId('ws-top-submit').click();
  await expect(page.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'preliminary', SLOW);
  await page.getByTestId('ws-nav-log').click();
  const log = page.getByTestId('ws-striplog');
  await expect(log).toBeVisible(SLOW);
  await expect(log).toHaveAttribute('data-tracks', /^depth,rop,gas,dxc,tops/);
  // no blank track: each curve has a drawn path with real extent inside its track
  for (const s of ['rop-rop', 'gas-total', 'dxc-d']) {
    const box = await page.getByTestId(`ws-striplog-series-${s}`).locator('path').first().boundingBox();
    expect(box, `${s} drawn`).not.toBeNull();
    expect(box.height, `${s} height`).toBeGreaterThan(50);
  }
  // depth runs downward: the deeper tick sits lower on the screen
  const ticks = await log.locator('[data-depth-tick]').evaluateAll((els) => els.map((e) => ({ v: Number(e.getAttribute('data-depth-tick')), y: e.getBoundingClientRect().top })));
  expect(ticks.length).toBeGreaterThan(3);
  for (let i = 1; i < ticks.length; i += 1) { expect(ticks[i].v).toBeGreaterThan(ticks[i - 1].v); expect(ticks[i].y).toBeGreaterThan(ticks[i - 1].y); }
  // the called top is a line across the tracks, between the 9,880 and 9,920 ft labels
  const top = await page.getByTestId('ws-striplog-marker-call-top_agbada').locator('line').boundingBox();
  const above = ticks.filter((t) => t.v <= 9900).pop(); const below = ticks.find((t) => t.v >= 9900);
  expect(top.y).toBeGreaterThanOrEqual(above.y - 12);
  expect(top.y).toBeLessThanOrEqual(below.y + 12);
  expect(top.width).toBeGreaterThan(400);
  // d-exponent: settings recorded, the trend drawn
  await page.getByTestId('ws-dxc-normal').fill('8.6');
  await page.getByTestId('ws-dxc-normal-unit').selectOption('ppg');
  await page.getByTestId('ws-dxc-trend-from').fill('9800');
  await page.getByTestId('ws-dxc-trend-to').fill('9850');
  await page.getByTestId('ws-dxc-save').click();
  await expect(page.getByTestId('ws-dxc-settings')).toContainText('In force: normal gradient 8.6 ppg (1.031 sg), normal trend from 9800 ft to 9850 ft MD.', SLOW);
  await expect(page.getByTestId('ws-striplog-series-dxc-trend')).toHaveAttribute('data-points', '12', SLOW);
  await expect(page.getByTestId('ws-dxc-summary')).toContainText('12 corrected for the mud weight');
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/ws-u2-striplog-1440.png', fullPage: true });
  // PL7: the PDF read back
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.getByTestId('ws-log-pdf').click()]);
  const text = execFileSync('pdftotext', ['-layout', await download.path(), '-'], { encoding: 'utf8' });
  fs.writeFileSync('test-results/ws-u2-strip-log.txt', text);
  expect(download.suggestedFilename()).toBe('keta-2-strip-log.pdf');
  expect(text).toMatch(/Well KETA-2; field Keta; operator Petrolord E&P; rig Rig 12\./);
  expect(text).toMatch(/Depths in ft, measured depth \(MD\) below KB, increasing downward; KB 82\.0 ft above MSL\./);
  expect(text).toMatch(/Prepared by A\. Geologist; Petrolord Suite/);
  expect(text).toMatch(/vertical scale 1:\d+ \(fitted to one page\)/);
  expect(text).toMatch(/Top Agbada \(preliminary\) 9900 ft/);
  for (const t of ['ROP', 'Gas', 'd-exponent', 'Tops and casing']) expect(text).toContain(t);
  expect(errors).toEqual([]);
});

test('U2-003: a time file with day-first dates asks for the date order and the clock; a LAS file reads', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('ws-nav-import').click();
  await page.getByTestId('ws-import-file').setInputFiles(path.join(HOSTILE, 'mudlog_time_dayfirst_semicolon_comma_decimal.csv'));
  await expect(page.getByTestId('ws-import-read-summary')).toContainText('comma decimals', SLOW);
  await expect(page.getByTestId('ws-import-missing')).toContainText('declare the date order (day first or month first)');
  await page.getByTestId('ws-import-datum').selectOption('KB');
  await page.getByTestId('ws-import-dateorder').selectOption('dmy');
  await page.getByTestId('ws-import-zone').selectOption('rig');
  await expect(page.getByTestId('ws-import-preview-rows')).toContainText('16 row(s) will be imported', SLOW);
  await expect(page.getByTestId('ws-import-preview-rows')).toContainText('2026-09-07 06:00');
  await page.getByTestId('ws-import-file').setInputFiles(path.join(HOSTILE, 'mudlog_las20_nulls_min_per_ft.las'));
  await expect(page.getByTestId('ws-import-read-summary')).toContainText('a LAS file', SLOW);
  await expect(page.getByTestId('ws-import-unit-1')).toHaveValue('min/ft');
  await page.getByTestId('ws-import-datum').selectOption('RT');
  await expect(page.getByTestId('ws-import-preview-rows')).toContainText('10 row(s) will be imported, 5000 ft to 5045 ft', SLOW);
});

test('U2-004, U2-002, U2-005, U2-007: lag check, chromatograph ratios, an MWD station, the office view', async ({ page }) => {
  const errors = await openStudio(page);
  // lag check: a count 600 strokes over the calculated lag plus the strokes down the string
  const lagText = await page.getByTestId('ws-lag-strokes').innerText();
  const lagStrokes = Number(lagText.replace(/\D/g, ''));
  await page.getByTestId('ws-lagcheck-strokes').fill(String(lagStrokes + 2400));
  await expect(page.getByTestId('ws-lagcheck-measured')).toContainText('stk', SLOW);
  await expect(page.getByTestId('ws-lagcheck-washout')).toContainText('%');
  await page.getByTestId('ws-lagcheck-apply').click();
  await expect(page.getByTestId('ws-lag-washout')).toContainText('% of the open hole', SLOW);
  // chromatograph
  await page.getByTestId('ws-nav-observations').click();
  await page.getByTestId('ws-obs-type-gas_chromatograph').click();
  for (const [k, v] of [['c1', '70000'], ['c2', '12000'], ['c3', '9000'], ['ic4', '2500'], ['nc4', '3500'], ['ic5', '1000'], ['nc5', '2000']]) await page.getByTestId(`ws-gas-${k}`).fill(v);
  await expect(page.getByTestId('ws-gas-live-haworth')).toHaveText('Wetness 30.0, balance 4.6, character 1.00: Oil (Haworth).');
  await page.getByTestId('ws-obs-save').click();
  await expect(page.getByTestId('ws-gas-table')).toBeVisible(SLOW);
  // an MWD station below the registry survey
  await page.getByTestId('ws-nav-surveys').click();
  await page.getByTestId('ws-survey-mdunit').selectOption('ft');
  await page.getByTestId('ws-survey-aziref').selectOption('grid');
  await page.getByTestId('ws-survey-md').fill('10800');
  await page.getByTestId('ws-survey-inc').fill('34');
  await page.getByTestId('ws-survey-azi').fill('92');
  await page.getByTestId('ws-survey-add').click();
  await expect(page.getByTestId('ws-survey-inuse')).toContainText('Rig survey, 1 run(s), 5 stations, version rig-1', SLOW);
  await expect(page.getByTestId('ws-survey-row-4')).toContainText('10800.0');
  // the office view
  await page.getByTestId('ws-nav-office').click();
  await expect(page.getByTestId('ws-office-bit-KETA-2')).toContainText('10000 ft', SLOW);
  await expect(page.getByTestId('ws-office-follow-KETA-2')).toContainText('rig:', SLOW);
  expect(errors).toEqual([]);
});
