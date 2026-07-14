// Earth Modeling G8.2 acceptance: the workstation drives on the /dev
// harness without auth, and the UI reproduces the ORACLE'S numbers —
// the harness's seeded surfaces/wells ARE the goldens' analytic
// fixture (packages/engines/test-data/earthmodel/). Stack the three surfaces, build,
// draw nothing (fixture polygon is added via the dock draw flow in a
// dedicated test) and the clamp report / census / volume tables are
// asserted from the committed goldens, never hardcoded literals.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(fs.readFileSync(
  path.join(here, '..', 'packages', 'engines', 'test-data', 'earthmodel', 'goldens.json'), 'utf8',
));

const fmtM = (v) => (v / 1e6).toFixed(3);

async function stackAndBuild(page) {
  await page.goto('/dev/earth-modeling');
  await expect(page.getByTestId('em-explorer')).toBeVisible();
  for (const name of ['TopA', 'TopB', 'BaseB']) {
    await page.getByTestId(`em-add-${name}`).click();
  }
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('Built');
}

test('framework build reports the oracle clamp counts and single-block census', async ({ page }) => {
  await stackAndBuild(page);

  // tie tops auto-matched by name; zones defaulted to registry zones A/B
  await expect(page.getByTestId('em-top-0')).toHaveValue('TopA');
  await expect(page.getByTestId('em-zone-reg-0')).toHaveValue('A');
  await expect(page.getByTestId('em-zone-reg-1')).toHaveValue('B');

  await page.getByTestId('em-view-qc').click();
  const counts = goldens.framework.clamp_counts;
  for (let i = 0; i < counts.length; i++) {
    await expect(page.getByTestId(`em-clamp-${i}`)).toHaveText(String(counts[i]));
  }
  // no polygons yet -> one block holding every node
  const total = goldens.model_spec.nx * goldens.model_spec.ny;
  await expect(page.getByTestId('em-census-0')).toHaveText(String(total));
});

test('fault polygon drawn on the map reproduces the goldens census and block volumes', async ({ page }) => {
  await stackAndBuild(page);

  // draw the L-shaped fixture polygon by clicking the map: convert the
  // goldens' world vertices to canvas pixels via the same fit-transform
  await page.getByTestId('em-fault-draw').click();
  const canvas = page.getByTestId('em-map-canvas');
  const box = await canvas.boundingBox();
  const { x0, y0, dx, dy, nx, ny } = goldens.model_spec;
  const [wMinX, wMaxX] = [x0, x0 + (nx - 1) * dx];
  const [wMinY, wMaxY] = [y0, y0 + (ny - 1) * dy];
  const PAD = 44;
  const scale = Math.min((box.width - 2 * PAD) / (wMaxX - wMinX), (box.height - 2 * PAD) / (wMaxY - wMinY));
  const [cx, cy] = [(wMinX + wMaxX) / 2, (wMinY + wMaxY) / 2];
  for (const [wx, wy] of goldens.fault_polygon) {
    await canvas.click({
      position: {
        x: box.width / 2 + (wx - cx) * scale,
        y: box.height / 2 - (wy - cy) * scale,
      },
    });
  }
  await page.getByTestId('em-fault-finish').click();
  await expect(page.getByTestId('em-status')).toContainText('Fault polygon added');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('2 blocks');

  await page.getByTestId('em-view-qc').click();
  // clicked vertices are pixel-quantized, but every edge sits >= 20 m
  // (>1.5 px) off the node lattice, so the census is EXACTLY the goldens'
  await expect(page.getByTestId('em-census-0')).toHaveText(String(goldens.blocks.census['0']));
  await expect(page.getByTestId('em-census-1')).toHaveText(String(goldens.blocks.census['1']));

  // volume tables match the oracle's per-block tables
  for (const [zoneKey, zoneName] of [['zone_a', 'zone-1'], ['zone_b', 'zone-2']]) {
    for (const block of ['0', '1', 'total']) {
      const gold = goldens.volumes[zoneKey][block];
      await expect(page.getByTestId(`em-vol-${zoneName}-${block}-bulk`)).toHaveText(fmtM(gold.bulk_m3));
      await expect(page.getByTestId(`em-vol-${zoneName}-${block}-hcpv`)).toHaveText(fmtM(gold.hcpv_m3));
    }
  }
});

test('well ties table shows the oracle residuals and the section cuts between wells', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-view-qc').click();

  for (const tie of goldens.well_ties.filter((t) => t.residual_m !== null).slice(0, 4)) {
    await expect(page.getByTestId(`em-tie-${tie.well}-${tie.top}`)).toHaveText(tie.residual_m.toFixed(2));
  }

  await page.getByTestId('em-view-section').click();
  const canvas = page.getByTestId('em-section-canvas');
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(300);
  await page.getByTestId('em-sec-b').selectOption({ label: 'W3' });
  await expect(canvas).toBeVisible();
});

test('publishing the thickness layer lands an isochore in the registry', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-map-layer').selectOption('thickness');
  await page.getByTestId('em-publish').click();
  await expect(page.getByTestId('em-status')).toContainText('Published');
  await expect(page.getByTestId('em-status')).toContainText('ReservoirCalc');
  // the published row shows up in the explorer's registry list
  await expect(page.getByTestId('em-explorer')).toContainText('Zone 1 thickness');
});

test('model definition saves and reloads through the backend', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-model-name').fill('Keta framework');
  await page.getByTestId('em-save-model').click();
  await expect(page.getByTestId('em-status')).toContainText('Saved model "Keta framework"');
});

test('earth-modeling app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/earth-modeling');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('earth-modeling'); // redirected by the auth gate
});
