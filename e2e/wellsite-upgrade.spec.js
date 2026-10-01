// Wellsite Studio upgrade U1 (practitioner lens, 2026-10-01) on the /dev
// harness: desktop, tablet and phone widths in both themes have no sideways
// scroll and no page errors (the stacked layout below 900 px); the lag panel
// shows volumes and flow; Live shows ROP; the tops table shows the call
// subsea and against the prognosis; Config takes a fractional size; the
// daily report PDF is downloaded and read back with pdftotext.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';

// the shared box is slow under load: a local write can take longer than the 5 s default
const SLOW = { timeout: 45000 };

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
const typeField = async (page, id, text) => { const el = page.getByTestId(id); await el.fill(text); await el.blur(); };

const VIEWPORTS = [{ w: 1366, h: 768, compact: false }, { w: 1440, h: 900, compact: false }, { w: 820, h: 1180, compact: true }, { w: 390, h: 844, compact: true }];
for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 (WS-U1-004): ${vp.w}x${vp.h} ${theme}: every view fits, no sideways scroll, no page errors`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors = await openStudio(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('ws-compact')).toHaveCount(vp.compact ? 1 : 0);
      if (vp.compact) {
        await expect(page.getByTestId('ws-compact-well')).toHaveValue(/.+/);
        await expect(page.getByTestId('ws-compact-dock').getByTestId('ws-lag-strokes')).toContainText('stk');
      }
      fs.mkdirSync('test-results', { recursive: true });
      for (const view of ['live', 'samples', 'tops', 'report', 'config']) {
        await page.getByTestId(`ws-nav-${view}`).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `test-results/ws-u1-${view}-${vp.w}-${theme}.png` });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sideways, `${view} page scroll`).toBeLessThanOrEqual(1);
        if (vp.compact) {
          // the stacked shell itself never scrolls sideways; a wide table scrolls inside its own view
          const shell = await page.getByTestId('ws-compact').evaluate((el) => el.scrollWidth - el.clientWidth);
          expect(shell, `${view} shell scroll`).toBeLessThanOrEqual(1);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test('WS-U1-007, 011, 015: lag volumes and flow, ROP, and the approach panel subsea', async ({ page }) => {
  await openStudio(page);
  await expect(page.getByTestId('ws-lag-annulus')).toHaveText(/\d+\.\d bbl/, SLOW);
  await expect(page.getByTestId('ws-lag-perstroke')).toHaveText('0.1018 bbl/stk');
  await expect(page.getByTestId('ws-lag-flow')).toHaveText('6.11 bbl/min (256 gpm)');
  await expect(page.getByTestId('ws-live-rop')).toHaveText('50.0 ft/hr');
  await expect(page.getByTestId('ws-approach-prognosis-tvdss')).toHaveText(/\d+ ft/);
  await expect(page.getByTestId('ws-approach-bit-tvdss')).toHaveText(/\d+ ft/);
  await page.getByTestId('ws-lag-pump-off').click();
  await expect(page.getByTestId('ws-lag-flow')).toHaveText('pumps off', SLOW);
});

test('WS-U1-006, 008: a call shows subsea and against the prognosis; Config takes 12 1/4', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('ws-nav-tops').click();
  await page.getByTestId('ws-top-callbtn-top_agbada').click();
  await typeField(page, 'ws-top-depth-value', '10138');
  await page.getByTestId('ws-top-basis').fill('GR drop and sand');
  await page.getByTestId('ws-top-submit').click();
  await expect(page.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'preliminary', SLOW);
  // prognosis 3100 m MD (10170.6 ft); 32.6 ft MD shallower on the 30 degree leg is 28 ft vertical
  await expect(page.getByTestId('ws-top-vsprog-top_agbada')).toHaveText('28 ft high', SLOW);
  await expect(page.getByTestId('ws-top-tvdss-top_agbada')).toHaveText(/^\d+ ft$/);
  await page.getByTestId('ws-nav-config').click();
  await page.getByTestId('ws-config-section-cell-1-id_in').fill('12 1/4');
  await page.getByTestId('ws-config-save-rig').click();
  await expect(page.getByTestId('ws-status')).toHaveText('Rig configuration recorded.', SLOW);
});

test('WS-U1-014, 009 (PL7): the daily report PDF read back carries the reviewer lines and the signer by name', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('ws-nav-report').click();
  await page.getByTestId('ws-signoff-sign').click();
  await expect(page.getByTestId('ws-status')).toContainText('Signed as A. Geologist', SLOW);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.getByTestId('ws-daily-pdf').click()]);
  const text = execFileSync('pdftotext', ['-layout', await download.path(), '-'], { encoding: 'utf8' });
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/ws-u1-daily-report.txt', text);
  expect(text).toMatch(/Well KETA-2; field Keta; operator Petrolord E&P; rig Rig 12\./);
  expect(text).toMatch(/Depths in ft, measured depth \(MD\) below KB unless marked TVD; KB 82\.0 ft above MSL\./);
  expect(text).toMatch(/Prepared by A\. Geologist; Petrolord Suite/);
  expect(text).toContain('10000 ft');
  expect(text).toContain('Signed by A. Geologist (administrator)');
});
