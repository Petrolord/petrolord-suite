// Crop before upload (2026-10-14) in a real browser, against the auth-free
// /dev/seismolord-workspace harness and its real import dialog:
//  - the crop step appears after the scan; typed ranges give the kept trace
//    count, the cropped size against the original and the upload time;
//  - a rectangle dragged on the survey outline fills the ranges; a polygon
//    keeps fewer traces than its box;
//  - the velocity preset keeps the area from 0 ms;
//  - a range outside the survey holds Start import with the reason;
//  - a prestack gather file is recognised: Start import is held and the
//    gathers are offered for QI Studio with the same crop.
// Run: E2E_BASE_URL=http://127.0.0.1:8372 npx playwright test e2e/seismolord-crop.spec.js --workers=1

import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
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

/** A small inline-sorted prestack gather SEG-Y: 6 x 5 locations, fold 4, 30 samples at 2 ms. */
function gatherFile(dir) {
  const ns = 30; const tb = 240 + ns * 4;
  const rows = [];
  for (let i = 0; i < 6; i++) for (let x = 0; x < 5; x++) for (let f = 0; f < 4; f++) rows.push([300 + i, 400 + x, 150 * (f + 1)]);
  const buf = Buffer.alloc(3600 + rows.length * tb);
  buf.fill(0x40, 0, 3200);
  buf.writeInt16BE(2000, 3216); buf.writeInt16BE(ns, 3220); buf.writeInt16BE(5, 3224);
  rows.forEach(([il, xl, off], t) => {
    const o = 3600 + t * tb;
    buf.writeInt32BE(off, o + 36); buf.writeInt16BE(ns, o + 114); buf.writeInt16BE(2000, o + 116);
    buf.writeInt16BE(-100, o + 70);
    buf.writeInt32BE((500000 + xl * 25) * 100, o + 180); buf.writeInt32BE((6000000 + il * 25) * 100, o + 184);
    buf.writeInt32BE(il, o + 188); buf.writeInt32BE(xl, o + 192);
    for (let s = 0; s < ns; s++) buf.writeFloatBE(Math.sin(t * 0.3 + s * 0.2) * 100, o + 240 + 4 * s);
  });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'gathers_small.sgy');
  fs.writeFileSync(file, buf);
  return file;
}

test('crop step: typed ranges, drawing, polygon, velocity preset and an invalid range', async ({ page }) => {
  const dialog = await openImport(page);
  await dialog.locator('input[type="file"][accept*=".sgy"]').first().setInputFiles(path.join(HOSTILE, 'rev1_ieee_clean.sgy'));
  const crop = dialog.getByTestId('sl-crop');
  await expect(crop).toBeVisible({ timeout: 30000 });
  await dialog.getByTestId('sl-crop-on').check();

  // typed: inlines 1002 to 1005 of 1001 to 1008, crosslines all, 8 to 80 ms of 0 to 156
  await dialog.getByLabel('First inline').fill('1002');
  await dialog.getByLabel('Last inline').fill('1005');
  await dialog.getByLabel('Window start').fill('8');
  await dialog.getByLabel('Window end').fill('80');
  const summary = dialog.getByTestId('sl-crop-summary');
  await expect(summary).toContainText('Keeps 24 of 48 traces');
  await expect(summary).toContainText('8 to 80 ms (19 of 40 samples)');
  await expect(summary).toContainText('Size: 0.0 MB of 0.0 MB');
  await expect(summary).toContainText('keeps its 0 ms origin');

  // drag a rectangle across the outline: the ranges follow
  const outline = dialog.getByTestId('sl-crop-outline');
  await outline.scrollIntoViewIfNeeded();
  const b = await outline.boundingBox();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.8, { steps: 5 });
  await page.mouse.up();
  const ilFrom = Number(await dialog.getByLabel('First inline').inputValue());
  const ilTo = Number(await dialog.getByLabel('Last inline').inputValue());
  const xlFrom = Number(await dialog.getByLabel('First crossline').inputValue());
  const xlTo = Number(await dialog.getByLabel('Last crossline').inputValue());
  expect(ilFrom).toBeGreaterThan(1001); expect(ilTo).toBeLessThan(1008); expect(ilFrom).toBeLessThan(ilTo);
  expect(xlFrom).toBeGreaterThan(2001); expect(xlTo).toBeLessThan(2006);
  await expect(summary).toContainText(`Keeps ${(ilTo - ilFrom + 1) * (xlTo - xlFrom + 1)} of 48 traces`);

  // a polygon (a triangle over the whole survey) keeps fewer than its box
  await dialog.getByRole('tab', { name: 'Polygon' }).click();
  // the outline can move as the controls above it change: click it relative to itself
  for (const [fx, fy] of [[0.1, 0.9], [0.9, 0.9], [0.1, 0.1]]) {
    const bb = await outline.boundingBox();
    await outline.click({ position: { x: bb.width * fx, y: bb.height * fy } });
  }
  await expect(summary).toContainText('inside the polygon');
  const kept = Number((await summary.textContent()).match(/Keeps (\d+) of 48/)[1]);
  expect(kept).toBeGreaterThan(5);
  expect(kept).toBeLessThan(48);
  await dialog.getByRole('button', { name: 'Clear polygon' }).click();

  // the velocity preset keeps the area from 0 ms
  await dialog.getByTestId('sl-crop-velocity').check();
  await expect(dialog.getByLabel('Window start')).toHaveValue('0');
  await expect(summary).toContainText('0 to 80 ms (21 of 40 samples)');

  // an inline range outside the survey holds the import, with the reason
  await dialog.getByLabel('First inline').fill('5000');
  await dialog.getByLabel('Last inline').fill('5005');
  await expect(dialog.getByTestId('sl-crop-error')).toContainText('holds no inline of this volume');
  await expect(dialog.getByTestId('sl-import-blocked')).toContainText('The crop is not valid');
  await expect(dialog.getByRole('button', { name: 'Start import', exact: true })).toBeDisabled();
});

test('prestack gathers are recognised and offered for QI Studio with the crop', async ({ page }, info) => {
  const file = gatherFile(info.outputDir);
  const dialog = await openImport(page);
  await dialog.locator('input[type="file"][accept*=".sgy"]').first().setInputFiles(file);
  await expect(dialog.getByTestId('sl-crop')).toBeVisible({ timeout: 30000 });
  await expect(dialog.getByTestId('sl-import-blocked')).toContainText('prestack gathers', { timeout: 30000 });
  await expect(dialog.getByRole('button', { name: 'Start import', exact: true })).toBeDisabled();
  await expect(dialog.getByTestId('sl-upload-gathers')).toBeVisible();
  await dialog.getByTestId('sl-crop-on').check();
  await dialog.getByLabel('First inline').fill('301');
  await dialog.getByLabel('Last inline').fill('303');
  await dialog.getByLabel('First crossline').fill('401');
  await dialog.getByLabel('Last crossline').fill('402');
  await dialog.getByLabel('Window start').fill('10');
  await dialog.getByLabel('Window end').fill('40');
  // every trace of each kept location: 3 x 2 locations at fold 4
  await expect(dialog.getByTestId('sl-crop-summary')).toContainText('Keeps about 24 of 120 traces (prestack gathers');
  await expect(dialog.getByTestId('sl-crop-summary')).toContainText('10 to 40 ms (16 of 30 samples)');
});
