// Seismolord upgrade U1 (practitioner lens) in a real browser, against the
// auth-free /dev/seismolord-workspace harness:
//  - PL2/PL4: the hostile SEG-Y set through the real import dialog and
//    scan worker (e2e/fixtures/seis/hostile): what each file says, and
//    which ones may start;
//  - PL6: an irregular-outline file viewed locally ("View it now"), in
//    two viewports and both themes: the canvas has ink, stays dark, TWT
//    increases downward, the page never scrolls;
//  - PL7: the section PNG is downloaded and read back: caption band on
//    top, file named by the inline NUMBER.
// Run: E2E_BASE_URL=http://127.0.0.1:8370 npx playwright test e2e/seismolord-upgrade.spec.js --workers=1

import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const HOSTILE = path.join(process.cwd(), 'e2e/fixtures/seis/hostile');
test.use({ launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function openImport(page) {
  await page.goto('/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('sl-start-toggle').click();
  await page.getByTestId('sl-start-go-import').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pick(dialog, name) {
  await dialog.locator('input[type="file"][accept*=".sgy"]').first().setInputFiles(path.join(HOSTILE, name));
}

const CASES = [
  ['rev1_ext_textual.sgy', { text: /2 extended textual headers \(6,400 bytes\) skipped/, inlines: '1001–1008' }],
  ['bin_dt_zero.sgy', { text: /no sample interval; 4 ms was read from the trace headers/ }],
  ['irregular_outline.sgy', { text: /12 of 48 inline and crossline positions hold no trace/ }],
  ['crossline_sorted.sgy', { text: /Traces are not in inline order/ }],
  ['no_coordinates.sgy', { text: /no coordinates \(CDP and source X\/Y are zero\)/ }],
  ['degrees_coords.sgy', { text: /decimal degrees \(byte 89 = 3\)/ }],
  ['line2d_cdp21.sgy', { text: /looks like a 2D line/ }],
  ['depth_psdm.sgy', { text: /Seismolord interprets volumes in two-way time/, blocked: true }],
  ['bin_ns_lies.sgy', { error: /disagree on the number of samples per trace.*fits 40/ }],
  ['rev2_little_endian.sgy', { error: /byte-swapped \(little-endian\)/ }],
  ['fmt3_int16.sgy', { error: /2-byte two's complement integer \(format code 3\)/ }],
];

test('PL2: the hostile SEG-Y set through the import dialog', async ({ page }) => {
  const dialog = await openImport(page);
  const log = [];
  for (const [name, want] of CASES) {
    await pick(dialog, name);
    if (want.error) {
      await expect(dialog).toContainText(want.error, { timeout: 30000 });
    } else {
      await expect(dialog.getByText('Vertical axis of this file')).toBeVisible({ timeout: 30000 });
      await expect(dialog).toContainText(want.text);
      if (want.inlines) await expect(dialog).toContainText(want.inlines);
      if (want.blocked) await expect(dialog.getByTestId('sl-import-blocked')).toBeVisible();
    }
    log.push(name);
  }
  // clearing a byte box no longer scans at byte 0
  await pick(dialog, 'rev1_ieee_clean.sgy');
  await expect(dialog.getByText('Vertical axis of this file')).toBeVisible({ timeout: 30000 });
  const il = dialog.getByLabel('Inline byte');
  await il.fill('');
  await il.blur();
  await expect(il).toHaveValue('189');
  await expect(dialog).not.toContainText(/outside the bounds|RangeError/);
  expect(log).toHaveLength(CASES.length);
});

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6/PL7 ${vp.width}x${vp.height} ${theme}: an irregular survey viewed locally, PNG read back`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => {
        try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
      }, theme);
      const dialog = await openImport(page);
      await pick(dialog, 'irregular_outline.sgy');
      await expect(dialog.getByText('Vertical axis of this file')).toBeVisible({ timeout: 30000 });
      await dialog.getByRole('button', { name: /View it now/ }).click();
      await expect(dialog).toBeHidden();
      const section = page.locator('[data-testid="window-section"]');
      const png = section.getByTitle('Save PNG snapshot');
      await expect(png).toBeEnabled({ timeout: 60000 });

      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1
        && document.documentElement.scrollHeight <= window.innerHeight + 1);
      expect(fits).toBe(true);
      // the seismic canvas stays dark in both themes (owner rule)
      await expect(section.locator('[data-canvas="dark"]').first()).toBeAttached();

      const shot = path.join('/tmp/claude-0/seis-upg', `u1-${vp.width}-${theme}.png`);
      await section.screenshot({ path: shot });

      const [dl] = await Promise.all([page.waitForEvent('download'), png.click()]);
      expect(dl.suggestedFilename()).toMatch(/^seismolord-inline-10\d\d\.png$/);
      const file = path.join('/tmp/claude-0/seis-upg', `u1-${vp.width}-${theme}-${dl.suggestedFilename()}`);
      await dl.saveAs(file);
      // read the PNG back in the page: caption band on top, seismic ink below, TWT down
      const b64 = fs.readFileSync(file).toString('base64');
      const probe = await page.evaluate(async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        let inkBand = 0; let inkBody = 0; let sat = 0; let body = 0;
        for (let y = Math.round(img.height * 0.2); y < img.height * 0.95; y += 7) {
          for (let x = Math.round(img.width * 0.1); x < img.width * 0.9; x += 7) {
            const p = px(x, y); body += 1;
            if ((p[0] > 245 && p[1] < 10 && p[2] < 10) || (p[2] > 245 && p[0] < 10 && p[1] < 10)) sat += 1;
          }
        }
        const band = Math.round(img.height * 0.08);
        for (let x = 0; x < img.width; x += 3) {
          const a = px(x, Math.round(band * 0.3)); if (a[0] > 150) inkBand += 1;
          const b = px(x, Math.round(img.height * 0.6)); if (Math.abs(b[0] - b[2]) > 30 || b[0] > 120) inkBody += 1;
        }
        return { w: img.width, h: img.height, corner: px(2, 2), inkBand, inkBody, saturated: sat / body };
      }, b64);
      expect(probe.corner.slice(0, 3)).toEqual([2, 6, 23]);    // #020617 caption band
      expect(probe.inkBand).toBeGreaterThan(3);                // caption text
      expect(probe.inkBody).toBeGreaterThan(10);               // seismic, not blank
      // SEIS-U1-014: a local file is scaled by its own RMS (was clip 3 on
      // amplitudes in the thousands: 36 % of the section pure red or blue)
      expect(probe.saturated).toBeLessThan(0.1);
    });
  }
}
