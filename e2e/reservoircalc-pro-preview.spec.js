// ReservoirCalc Pro preview sizing (owner report 2026-10-12): in the live
// /dashboard frame the 2D map and 3D view fill the middle panel, and a top
// and base surface pair with a contact computes and draws both surfaces.
// ?frame=dashboard mounts the app inside the same frame the live route uses
// (an h-screen row, a scrolling main, the min-h-full DashboardScope); before
// the fix the page root resolved to auto there and the map was a 150 px strip.

import { test, expect } from '@playwright/test';

async function importRegistrySurface(page, name) {
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId(`rcp-registry-use-${name}`).click();
  await expect(page.getByTestId('rcp-import-confirm')).toBeEnabled({ timeout: 15000 });
  await page.getByTestId('rcp-import-confirm').click();
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });
}

const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });

for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 1180, h: 800 }]) {
  test(`preview sizing ${vp.w}x${vp.h}: the map and the 3D view fill the middle panel in the dashboard frame`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/dev/reservoircalc-pro?frame=dashboard');
    await page.getByTestId('rcp-tab-surfaces').click();
    await importRegistrySurface(page, 'Harness Dome');
    const pane = page.getByTestId('rcp-vis-canvas');
    const map = page.getByTestId('rcp-map-canvas');
    await expect(map).toBeVisible({ timeout: 15000 });
    const p = await box(pane);
    // the pane takes most of the viewport height
    expect(p.h).toBeGreaterThan(vp.h * 0.7);
    // split view: two halves, side by side or stacked by the pane's shape
    const split = await page.getByTestId('rcp-split').getAttribute('data-split');
    const m = await box(map);
    if (split === 'column') {
      expect(m.w).toBeGreaterThan(p.w * 0.95);
      expect(m.h).toBeGreaterThan(p.h * 0.35);
    } else {
      expect(m.h).toBeGreaterThan(p.h * 0.8);
    }
    // 2D only: the map takes the whole pane
    await page.getByLabel('2D map view').click();
    await expect.poll(async () => (await box(map)).h).toBeGreaterThan(p.h * 0.8);
    // 3D only: the canvas fills the pane at whole device pixels
    await page.getByLabel('3D model view').click();
    const c3 = pane.locator('canvas').first();
    const c = await box(c3);
    expect(c.h).toBeGreaterThan(p.h * 0.9);
    expect(c.w).toBeGreaterThan(p.w * 0.9);
    expect(errors).toEqual([]);
  });
}

test('top and base: Ekene Sand Top and Base with a contact give the closed-form gross rock, and both surfaces are drawn', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/dev/reservoircalc-pro?frame=dashboard&topBase=1');
  await page.getByTestId('rcp-tab-surfaces').click();
  await importRegistrySurface(page, 'Ekene Sand Top');
  await importRegistrySurface(page, 'Ekene Sand Base');
  await page.getByTestId('rcp-set-top-Ekene Sand Top').click();
  await page.getByTestId('rcp-set-base-Ekene Sand Base').click();
  await page.locator('label[for="im-surfaces"]').click();
  await page.getByTestId('rcp-tab-geometry').click();
  await expect(page.getByTestId('rcp-base-status')).toContainText('Base Surface Selected: Ekene Sand Base');
  // contact -1560 m TVDSS, typed in the project's feet
  await page.locator('#owc-input').fill('-5118.1');
  await page.locator('#owc-input').blur();
  // closed form: pi * (60^2 - 30^2) / (2 * 0.00012) m3 = 3.534e7 m3 = 28,650 acre-ft;
  // the 200 m lattice reads it within a few per cent
  const bulk = page.locator('text=Bulk Vol:').locator('..');
  const readBulk = async () => {
    const m = (await bulk.innerText()).match(/([\d,]+)\s*Ac-ft/);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  };
  await expect.poll(async () => Math.abs((await readBulk()) / 28650 - 1), { timeout: 20000 }).toBeLessThan(0.03);
  // the base is its own map layer and sits under the top in the 3D view
  await page.getByLabel('3D model view').click();
  await expect(page.getByTestId('rcp-3d-base-key')).toContainText('Base: Ekene Sand Base');
  await page.getByLabel('2D map view').click();
  await page.locator('#vis-panel-container button[role="combobox"]').click();
  await page.getByRole('option', { name: 'Base: Ekene Sand Base' }).click();
  await expect(page.getByTestId('rcp-map-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
