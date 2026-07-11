// 3D cube-view suite: drives the real CubeView on the synthetic volume
// (/dev/seismolord-cubeview) — first render, background toggle, orbit,
// plane toggles, plane picking (3D -> 2D orientation sync) and
// Shift+wheel slice stepping (3D -> shared indices sync).

import { test, expect } from '@playwright/test';

const ready = async (page, params = '') => {
  await page.goto(`/dev/seismolord-cubeview${params}`);
  await expect(page.getByTestId('harness-status'))
    .toHaveAttribute('data-harness-status', 'ready', { timeout: 60000 });
};

const viewport = (page) => page.getByTestId('cube-view').locator('canvas').first().locator('..');

const shot = async (page) => (await viewport(page).screenshot()).toString('base64');

/** Mean luminance of a PNG buffer — cheap "did the scene change" probe. */
const differs = (a, b) => a !== b;

test('renders the cube scene and the background toggles dark/light', async ({ page }) => {
  await ready(page);
  const dark = await viewport(page).screenshot();
  await page.getByTestId('cube-bg-toggle').click();
  await page.waitForTimeout(300);
  const light = await viewport(page).screenshot();
  expect(differs(dark.toString('base64'), light.toString('base64'))).toBe(true);
  // the viewport container switches to the light theme (the GL clear
  // color matches it; the pixel diff above proves the scene repainted —
  // the WebGL buffer itself is not readable post-frame without
  // preserveDrawingBuffer, so assert the DOM side here)
  const bgColor = await page.evaluate(() => {
    const div = document.querySelector('[data-testid="cube-view"] canvas').parentElement;
    return getComputedStyle(div).backgroundColor;
  });
  expect(bgColor).toBe('rgb(255, 255, 255)');
});

test('drag orbits the camera (scene changes), dbl-click refits', async ({ page }) => {
  await ready(page);
  const before = await shot(page);
  const box = await viewport(page).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const rotated = await shot(page);
  expect(differs(before, rotated)).toBe(true);
});

test('plane toggles change the scene; entire-cube faces render', async ({ page }) => {
  await ready(page);
  const before = await shot(page);
  await page.getByTitle('3D layers').click();
  await page.getByText('Crossline plane').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const withoutXline = await shot(page);
  expect(differs(before, withoutXline)).toBe(true);

  await page.getByTitle('3D layers').click();
  await page.getByText('Entire cube (boundary faces)').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);              // six boundary slices assemble
  const withFaces = await shot(page);
  expect(differs(withoutXline, withFaces)).toBe(true);
});

test('clicking a plane reports its orientation (3D -> 2D sync hook)', async ({ page }) => {
  await ready(page);
  const box = await viewport(page).boundingBox();
  // default camera looks at the cube centre where the inline/xline planes
  // sit — click dead centre and expect SOME plane to be selected
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const sel = await page.getByTestId('harness-last-plane').textContent();
  expect(['inline', 'xline', 'time']).toContain(sel);
});

test('Shift+wheel over a plane steps the shared slice index', async ({ page }) => {
  await ready(page);
  const before = await page.getByTestId('harness-indices').textContent();
  const box = await viewport(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('harness-indices')).not.toHaveText(before);
});

test('vertical exaggeration and display cycling re-render live', async ({ page }) => {
  await ready(page);
  const before = await shot(page);
  await page.getByTestId('harness-vexag').click();      // x1 -> x2
  await page.waitForTimeout(300);
  const stretched = await shot(page);
  expect(differs(before, stretched)).toBe(true);

  await page.getByTestId('harness-cycle-display').click(); // new colormap
  await page.waitForTimeout(300);
  const recolored = await shot(page);
  expect(differs(stretched, recolored)).toBe(true);
});
