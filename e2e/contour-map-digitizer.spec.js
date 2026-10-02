// Contour Map Digitizer in a real browser (MAP-U1-028 harness, MAP-U2-006
// drag-assign): drop a scan, georeference it on three control points, draw
// three contour rings, value them with one drag, grid, publish, and save
// and reload the project. /dev/contour-map-digitizer runs the page on an
// in-memory backend (window.__DIGITIZER_BACKEND__).
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCAN = path.join(process.cwd(), 'e2e/fixtures/map/digitizer/concentric_contours.png');
const IMG = 400;
const world = (x, y) => [500000 + 10 * x, 6700000 - 10 * y];

async function toScreen(page, x, y) {
  const box = await page.getByTestId('digitizer-map-canvas').locator('canvas').nth(1).boundingBox();
  const s = Math.min(box.width / IMG, box.height / IMG);
  return { x: box.x + (box.width - IMG * s) / 2 + x * s, y: box.y + (box.height - IMG * s) / 2 + y * s };
}
async function drawRing(page, R) {
  const pts = Array.from({ length: 49 }, (_, k) => [200 + R * Math.cos((k / 48) * 2 * Math.PI), 200 + R * Math.sin((k / 48) * 2 * Math.PI)]);
  const p0 = await toScreen(page, ...pts[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) { const q = await toScreen(page, ...p); await page.mouse.move(q.x, q.y); }
  await page.mouse.up();
}

test.describe.configure({ mode: 'serial' });

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`digitize, drag-assign, grid and publish at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/dev/contour-map-digitizer');
    await page.locator('#image-upload-dropzone input').setInputFiles(SCAN);
    await expect(page.getByTestId('digitizer-map-canvas')).toBeVisible();
    await page.waitForTimeout(300);
    // three control points on the red ticks, then their map coordinates
    for (const [x, y] of [[40, 40], [360, 40], [40, 360]]) { const p = await toScreen(page, x, y); await page.mouse.click(p.x, p.y); }
    for (const [i, [x, y]] of [[40, 40], [360, 40], [40, 360]].entries()) {
      const [wx, wy] = world(x, y);
      await page.locator(`#world-x-${i}`).fill(String(wx));
      await page.locator(`#world-y-${i}`).fill(String(wy));
    }
    await page.getByTestId('digitizer-georef').click();
    await expect(page.getByTestId('digitizer-georef-summary')).toBeVisible();
    // three rings by hand
    await page.getByRole('button', { name: 'Manual Draw' }).click();
    for (const R of [60, 110, 160]) await drawRing(page, R);
    await page.getByRole('button', { name: 'Manual Draw' }).click();
    await expect(page.getByTestId('digitizer-line-value-contours')).toHaveCount(3);
    // one drag from the crest outwards values all three: depth 1500, 1550, 1600
    await page.getByTestId('digitizer-assign-start').fill('1500');
    await page.getByTestId('digitizer-assign-step').fill('50');
    await page.getByTestId('digitizer-assign-drag').click();
    const a = await toScreen(page, 200, 200); const b = await toScreen(page, 390, 205);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let k = 1; k <= 20; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 20, a.y + ((b.y - a.y) * k) / 20);
    await page.mouse.up();
    await expect(page.getByText('3 contours valued from 1500 to 1600 in steps of 50')).toBeVisible();
    const values = await page.getByTestId('digitizer-line-value-contours').evaluateAll((els) => els.map((e) => Number(e.value)));
    expect(values).toEqual([1500, 1550, 1600]);
    // grid and publish
    await page.getByTestId('digitizer-cell').fill('100');
    await page.getByTestId('digitizer-grid').click();
    await expect(page.getByTestId('digitizer-grid-summary')).toBeVisible();
    await page.getByTestId('digitizer-surface-name').fill('Digitized dome');
    await page.getByTestId('digitizer-publish').click();
    await expect(page.getByTestId('digitizer-open-mapping')).toBeVisible();
    const pub = await page.evaluate(() => {
      const s = window.__DIGITIZER_BACKEND__.surfaces[0];
      let max = -Infinity; for (const v of s.grid) if (Math.abs(v) < 1e29 && v > max) max = v;
      return { name: s.row.name, domain: s.row.z_domain, crest: max };
    });
    expect(pub.name).toBe('Digitized dome');
    expect(pub.domain).toBe('depth');
    expect(pub.crest).toBeLessThan(-1450);
    expect(pub.crest).toBeGreaterThan(-1520);
    // save the project and load it back: lines, values and the georeference resume
    await page.getByPlaceholder('Project Name').fill('Dome scan');
    await page.getByRole('button', { name: 'Save Project' }).click();
    await expect(page.getByText('Project Saved')).toBeVisible();
    // MAP-U2-020: the image is kept with the project, under the owner and the project
    await expect(page.getByText('The map image (concentric_contours.png) is kept with the project.')).toBeVisible();
    const stored = await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^user-dev\/proj-\d+\/map\.png$/);
    await expect(page.getByTestId('digitizer-image-status')).toHaveText('Map image kept with the project: concentric_contours.png.');
    await page.getByRole('combobox').filter({ hasText: 'Load a project' }).click();
    await page.getByRole('option', { name: /Dome scan/ }).click();
    await expect(page.getByText(/Dome scan: 3 contour and 0 fault lines, 3 control points, georeferenced\. The map image \(concentric_contours\.png\) kept with the project is under the lines\./)).toBeVisible();
    // restored from storage: loading replaces the page's image with the stored one, and the map stays up
    // (with no stored image the same load empties the canvas: see the last test)
    await expect(page.getByTestId('digitizer-map-canvas')).toBeVisible();
    expect(await page.getByTestId('digitizer-line-value-contours').evaluateAll((els) => els.map((e) => Number(e.value)))).toEqual([1500, 1550, 1600]);
    expect(errs).toEqual([]);
  });
}

test('390 wide: the digitizer stacks and has no sideways page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/contour-map-digitizer');
  await page.locator('#image-upload-dropzone input').setInputFiles(SCAN);
  await expect(page.getByTestId('digitizer-map-canvas')).toBeVisible();
  const box = await page.getByTestId('digitizer-map-canvas').boundingBox();
  expect(box.height).toBeGreaterThan(250); // the map had no height at 390 wide before this upgrade
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

// MAP-U2-020: the map image kept with the project
test('hostile images are refused with the reason; replace and delete act on the stored object', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/dev/contour-map-digitizer');
  const drop = page.locator('#image-upload-dropzone input');
  // wrong type by content (a text file named .png), then zero bytes: neither opens
  await drop.setInputFiles({ name: 'contours.png', mimeType: 'image/png', buffer: Buffer.from('well,x,y\nA,1,2\n') });
  await expect(page.getByText('"contours.png" is not a PNG, JPEG or WebP image (its content says otherwise, whatever its name). Choose a PNG, JPEG or WebP scan.')).toBeVisible();
  await drop.setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  await expect(page.getByText('"empty.png" is empty (0 bytes). Choose the scanned map image again.')).toBeVisible();
  await expect(page.getByTestId('digitizer-map-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths())).toEqual([]);

  // a real scan, saved: one object
  await drop.setInputFiles(SCAN);
  await expect(page.getByTestId('digitizer-map-canvas')).toBeVisible();
  await page.getByPlaceholder('Project Name').fill('Stored scan');
  await page.getByRole('button', { name: 'Save Project' }).click();
  await expect(page.getByText('The map image (concentric_contours.png) is kept with the project.')).toBeVisible();
  const first = await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths());
  expect(first).toHaveLength(1);

  // too large is refused at Replace too (26 MB with a PNG signature), and nothing changes in storage
  const big = Buffer.alloc(26 * 1024 * 1024); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
  await page.getByTestId('digitizer-replace-image-input').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: big });
  await expect(page.getByText('"huge.png" is 26.0 MB; the limit for a map image is 25.0 MB. Save the scan at a lower resolution or as a JPEG.')).toBeVisible();
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths())).toEqual(first);

  // replace with the same scan under another name: still one object, and the status says which
  await page.getByTestId('digitizer-replace-image-input').setInputFiles({ name: 'rescan.png', mimeType: 'image/png', buffer: fs.readFileSync(SCAN) });
  await expect(page.getByTestId('digitizer-image-status')).toContainText('a new image is attached; Save Project replaces the stored one');
  await page.getByRole('button', { name: 'Save Project' }).click();
  await expect(page.getByText('The map image (rescan.png) is kept with the project.')).toBeVisible();
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths())).toEqual(first);
  await expect(page.getByTestId('digitizer-image-status')).toHaveText('Map image kept with the project: rescan.png.');

  // delete asks once, then removes the image and the project
  await page.getByTestId('digitizer-delete-project').click();
  await page.getByTestId('digitizer-delete-project-confirm').click();
  await expect(page.getByText('Project deleted', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths())).toEqual([]);
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.listProjects())).toEqual([]);
  expect(errs).toEqual([]);
});

test('before the bucket exists the project saves as before and says the image is not kept', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/contour-map-digitizer?bucket=missing');
  await page.locator('#image-upload-dropzone input').setInputFiles(SCAN);
  await expect(page.getByTestId('digitizer-map-canvas')).toBeVisible();
  await page.getByPlaceholder('Project Name').fill('No bucket yet');
  await page.getByRole('button', { name: 'Save Project' }).click();
  await expect(page.getByText('Project Saved')).toBeVisible();
  await expect(page.getByText('The map image is not kept with the project on this server yet (image storage is waiting to be switched on). The project is saved; you will be asked for the image when you load it.')).toBeVisible();
  expect(await page.evaluate(() => window.__DIGITIZER_BACKEND__.storage.paths())).toEqual([]);
  // loading it asks for the image, as it did before this change
  await page.getByRole('combobox').filter({ hasText: 'Load a project' }).click();
  await page.getByRole('option', { name: /No bucket yet/ }).click();
  await expect(page.getByText(/No bucket yet: 0 contour and 0 fault lines, 0 control points\. Drop the map image \(concentric_contours\.png\) to draw over it; the lines are kept\./)).toBeVisible();
  await expect(page.getByTestId('digitizer-map-canvas')).toHaveCount(0);
});
