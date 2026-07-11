// SliceView interaction suite: drives the real component on the synthetic
// volume (/dev/seismolord-sliceview) — wheel zoom at cursor, pan, fit,
// picking through the view transform, annotation toggles, slice stepping.
// Pixel-level shader parity lives in seismolord-viewer.spec.js.

import { test, expect } from '@playwright/test';

const ready = async (page) => {
  await page.goto('/dev/seismolord-sliceview');
  await expect(page.getByTestId('harness-status'))
    .toHaveAttribute('data-harness-status', 'ready', { timeout: 60000 });
};

// the interaction overlay is the canvas that receives pointer events
const overlay = (page) => page.locator('canvas.touch-none');

const zoomLabel = (page) => page.locator('span.tabular-nums');

test('zoom in/out via wheel and buttons, fit resets to 100%', async ({ page }) => {
  await ready(page);
  await expect(zoomLabel(page)).toHaveText('100%');

  const box = await overlay(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);           // wheel up = zoom in
  await expect(zoomLabel(page)).not.toHaveText('100%');

  await page.getByTitle('Fit to window (0)').click();
  await expect(zoomLabel(page)).toHaveText('100%');

  await page.getByTitle('Zoom in (+ / wheel)').click();
  await expect(zoomLabel(page)).toHaveText('125%');
  await page.getByTitle('Zoom out (-)').click();
  await expect(zoomLabel(page)).toHaveText('100%');
});

test('pick maps through the transform: same screen point -> same world point after zoom', async ({ page }) => {
  await ready(page);
  await page.getByTestId('harness-pickmode').click();   // pick: seed

  const box = await overlay(page).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.click(cx, cy);
  const first = await page.getByTestId('harness-last-pick').textContent();
  expect(first).not.toBe('-');

  // zoom at that exact point: the world point under the cursor must not move
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -200);
  await page.mouse.wheel(0, -200);
  await page.mouse.click(cx, cy);
  const second = await page.getByTestId('harness-last-pick').textContent();

  const [il1, xl1, s1] = first.split(',').map(Number);
  const [il2, xl2, s2] = second.split(',').map(Number);
  expect(il2).toBe(il1);
  expect(Math.abs(xl2 - xl1)).toBeLessThanOrEqual(1);
  expect(Math.abs(s2 - s1)).toBeLessThanOrEqual(2);
});

test('drag pans the view when zoomed', async ({ page }) => {
  await ready(page);
  const box = await overlay(page).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -400);           // zoom well in so panning unlocks

  // pick BEFORE and AFTER a drag at the same screen point: world must differ
  await page.getByTestId('harness-pickmode').click();
  await page.mouse.click(cx, cy);
  const before = await page.getByTestId('harness-last-pick').textContent();

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy - 80, { steps: 8 });
  await page.mouse.up();

  await page.mouse.click(cx, cy);
  const after = await page.getByTestId('harness-last-pick').textContent();
  expect(after).not.toBe(before);
});

test('cursor readout reports IL/XL/ms/amplitude over the data', async ({ page }) => {
  await ready(page);
  const box = await overlay(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const readout = page.locator('div.font-mono');
  await expect(readout).toContainText('IL ');
  await expect(readout).toContainText('XL ');
  await expect(readout).toContainText('ms');
  await expect(readout).toContainText('amp');
});

test('annotation layers render and toggle off', async ({ page }) => {
  await ready(page);

  const annoInk = () => page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const anno = canvases.find((c) => c.className.includes('pointer-events-none'));
    const ctx = anno.getContext('2d');
    const d = ctx.getImageData(0, 0, anno.width, anno.height).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
    return ink;
  });

  const withAll = await annoInk();
  expect(withAll).toBeGreaterThan(500);       // axes + scale bar + colorbar

  // turn every annotation off via the Layers menu (stays open on toggle)
  await page.getByTitle('Display layers').click();
  for (const item of ['Axes', 'Scale bar', 'Amplitude colorbar']) {
    await page.getByRole('menuitemcheckbox', { name: new RegExp(item) }).click();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  const withNone = await annoInk();
  expect(withNone).toBeLessThan(withAll / 10);
});

test('traverse orientation sections along a path, view-only, readout via positions', async ({ page }) => {
  await ready(page);
  await page.getByTestId('harness-orientation').selectOption('traverse');
  await expect(page.getByTestId('harness-status'))
    .toHaveAttribute('data-harness-status', 'ready');

  // the dog-leg path resampled to a real number of section columns
  const cols = Number(await page.getByTestId('harness-traverse-cols').textContent());
  expect(cols).toBeGreaterThan(10);

  // cursor readout resolves the hovered column to its IL/XL through
  // slice.positions and reads the amplitude from the traverse layout
  const box = await overlay(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const readout = page.locator('div.font-mono');
  await expect(readout).toContainText('IL ');
  await expect(readout).toContainText('XL ');
  await expect(readout).toContainText('ms');
  await expect(readout).toContainText('amp');

  // view-only: arming the harness pick tool must not produce picks here
  await page.getByTestId('harness-pickmode').click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('harness-last-pick')).toHaveText('-');

  // the harness fault stick sits ON the path, so its projection must
  // put orange ink on the interpretation overlay (a plain 2D canvas)
  const faultInk = await page.evaluate(() => {
    const overlayCanvas = Array.from(document.querySelectorAll('canvas'))
      .find((c) => c.className.includes('touch-none'));
    const ctx = overlayCanvas.getContext('2d');
    const d = ctx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // #f97316-ish: strong red, mid green, low blue
      if (d[i + 3] > 0 && d[i] > 180 && d[i + 1] > 60 && d[i + 1] < 190 && d[i + 2] < 90) n += 1;
    }
    return n;
  });
  expect(faultInk).toBeGreaterThan(20);
});

test('north arrow appears on time slices, arrow keys step slices', async ({ page }) => {
  await ready(page);
  await page.getByTestId('harness-orientation').selectOption('time');
  await expect(page.getByTestId('harness-status'))
    .toHaveAttribute('data-harness-status', 'ready');

  // Layers menu shows the north arrow entry enabled on time slices
  await page.getByTitle('Display layers').click();
  const north = page.getByRole('menuitemcheckbox', { name: /North arrow/ });
  await expect(north).not.toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  const idx0 = Number(await page.getByTestId('harness-slice-index').textContent());
  await page.locator('div[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('harness-slice-index')).toHaveText(String(idx0 + 1));
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('harness-slice-index')).toHaveText(String(idx0));
});
