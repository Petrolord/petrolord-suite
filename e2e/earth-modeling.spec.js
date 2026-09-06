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

  // EM0: depth displays in the account's unit (ft by default); metres on toggle
  for (const tie of goldens.well_ties.filter((t) => t.residual_m !== null).slice(0, 4)) {
    await expect(page.getByTestId(`em-tie-${tie.well}-${tie.top}`)).toHaveText((tie.residual_m / 0.3048).toFixed(2));
  }
  await page.getByTestId('em-depth-unit').click();
  await expect(page.getByTestId('em-ties-unit')).toHaveText('Residual (m)');
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

test('MS4: ?surface= from Mapping stacks the surface on arrival', async ({ page }) => {
  await page.goto('/dev/earth-modeling?surface=surf-2');
  await expect(page.getByTestId('em-status')).toContainText('Added TopB from the link');
  await expect(page.getByTestId('em-explorer')).toContainText('TopB');
  await page.goto('/dev/earth-modeling?surface=no-such-surface');
  await expect(page.getByTestId('em-status')).toContainText('not in your registry');
});

test('MS5: a fault polygon drawn in Mapping (geo_culture) joins the model from the explorer and reproduces the two-block census', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-culture-add-Fixture fault (Mapping)').click();
  await expect(page.getByTestId('em-status')).toContainText('Added fault polygon Fixture fault (Mapping)');
  await expect(page.getByTestId('em-culture-add-Fixture fault (Mapping)')).toBeDisabled();
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('2 blocks');
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-census-0')).toHaveText(String(goldens.blocks.census['0']));
  await expect(page.getByTestId('em-census-1')).toHaveText(String(goldens.blocks.census['1']));
});

test('EM0: volume units, a model cell size and a boundary clip from Mapping', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-view-qc').click();
  const goldBulk = goldens.volumes.zone_a.total.bulk_m3;
  await expect(page.getByTestId('em-vol-zone-1-total-bulk')).toHaveText(fmtM(goldBulk));
  await page.getByTestId('em-volume-units').selectOption('field');
  await expect(page.getByTestId('em-vol-unit-bulk').first()).toHaveText('Bulk (acre-ft)');
  await expect(page.getByTestId('em-vol-unit-hcpv').first()).toHaveText('HCPV (MMbbl)');
  await expect(page.getByTestId('em-vol-zone-1-total-bulk')).toHaveText((goldBulk / 1233.48183754752).toFixed(1));
  await page.getByTestId('em-volume-units').selectOption('metric');

  // a finer frame: the top surface's extent at 25 m gives (nx-1)*dx/25+1 nodes a side
  const { dx, dy, nx, ny } = goldens.model_spec;
  await page.getByTestId('em-frame-cell').fill('25');
  await page.getByTestId('em-build').click();
  const fnx = Math.floor((nx - 1) * dx / 25) + 1;
  const fny = Math.floor((ny - 1) * dy / 25) + 1;
  await expect(page.getByTestId('em-status')).toContainText(`${fnx}×${fny} frame at 25 m`);
  await expect(page.getByTestId('em-frame')).toHaveText(`${fnx}×${fny} @ 25 m`);
  await page.getByTestId('em-frame-cell').fill('');

  // a boundary drawn in Mapping clips the model: fewer live cells, the status says so
  await page.getByTestId('em-frame-boundary').selectOption({ label: 'Fixture lease (Mapping)' });
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('clipped to Fixture lease (Mapping)');
  await page.getByTestId('em-view-qc').click();
  const cells = Number(await page.locator('[data-testid="em-vol-zone-1"] tr').last().locator('td').nth(1).textContent());
  expect(cells).toBeLessThan(nx * ny);
  expect(cells).toBeGreaterThan(0);
});

test('EM1: adjusting the surfaces to the well tops shrinks the residuals and the QC reports before and after', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-adjust-on').check();
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText(/3 surfaces adjusted to the wells \(max residual \d+\.\d to \d+\.\d ft\)/);
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-adjust-report')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const after = Number(await page.getByTestId(`em-adjust-after-${i}`).textContent());
    expect(after).toBeLessThan(2);
  }
  // W2 TopA had the largest residual (-35.8 m); adjusted it sits under a foot
  const w2 = Number(await page.getByTestId('em-tie-W2-TopA').textContent());
  expect(Math.abs(w2)).toBeLessThan(1);
});

test('EM2: a horizon parallel to TopA at 50 m joins the stack and builds a 50 m zone with the closed-form bulk volume', async ({ page }) => {
  await page.goto('/dev/earth-modeling');
  await expect(page.getByTestId('em-explorer')).toBeVisible();
  await page.getByTestId('em-add-TopA').click();
  await page.getByTestId('em-derived-source').selectOption({ label: 'TopA' });
  await page.getByTestId('em-derived-thickness').fill('164.042');
  await page.getByTestId('em-derived-name').fill('TopA plus 50 m');
  await page.getByTestId('em-derived-add').click();
  await expect(page.getByTestId('em-status')).toContainText('Added derived horizon TopA plus 50 m (parallel to TopA at 164.0 ft)');
  await expect(page.getByTestId('em-explorer')).toContainText('TopA plus 50 m');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('1 zones');
  await page.getByTestId('em-view-qc').click();
  const { dx, dy, nx, ny } = goldens.model_spec;
  await expect(page.getByTestId('em-vol-zone-1-total-bulk')).toHaveText(fmtM(50 * nx * ny * dx * dy));
  await expect(page.getByTestId('em-derived-row-TopA plus 50 m')).toBeVisible();
});

test('EM3: a section line drawn on the map cuts the model, projects the wells with GR, exaggerates and exports', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-view-section').click();
  await expect(page.getByTestId('em-sec-wells')).toContainText(/\d+ wells? on the line/);
  await page.getByTestId('em-sec-ve').selectOption('1');
  const before = await page.getByTestId('em-section-canvas').getAttribute('data-plot-h');
  await page.getByTestId('em-sec-ve').selectOption('10');
  const after = await page.getByTestId('em-section-canvas').getAttribute('data-plot-h');
  expect(Number(after)).toBeGreaterThan(Number(before));

  // draw a line across the model through W1 and W4 on the map
  await page.getByTestId('em-sec-draw').click();
  await expect(page.getByTestId('em-sec-pending')).toHaveText('0 section vertices');
  const canvas = page.getByTestId('em-map-canvas');
  const box = await canvas.boundingBox();
  const { x0, y0, dx, dy, nx, ny } = goldens.model_spec;
  const [wMinX, wMaxX] = [x0, x0 + (nx - 1) * dx];
  const [wMinY, wMaxY] = [y0, y0 + (ny - 1) * dy];
  const PAD = 44;
  const scale = Math.min((box.width - 2 * PAD) / (wMaxX - wMinX), (box.height - 2 * PAD) / (wMaxY - wMinY));
  const [cx, cy] = [(wMinX + wMaxX) / 2, (wMinY + wMaxY) / 2];
  for (const [wx, wy] of [[1100, 2100], [2050, 2150]]) {
    await canvas.click({ position: { x: box.width / 2 + (wx - cx) * scale, y: box.height / 2 - (wy - cy) * scale } });
  }
  await expect(page.getByTestId('em-sec-pending')).toHaveText('2 section vertices');
  await page.getByTestId('em-sec-finish').click();
  await expect(page.getByTestId('em-status')).toContainText(/Section line set: 2 vertices, \d+ m/);
  await expect(page.getByTestId('em-section-canvas')).toBeVisible();
  await expect(page.getByTestId('em-sec-wells')).toContainText(/[2-3] wells on the line/);
  const dl = page.waitForEvent('download');
  await page.getByTestId('em-sec-png').click();
  expect((await dl).suggestedFilename()).toMatch(/section\.png$/);
  await expect(page.getByTestId('em-status')).toContainText('Section exported as PNG');
});

test('EM4: ordinary kriging with a fitted variogram populates porosity and offers its variance map', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-method-phi').selectOption('okrige');
  await expect(page.getByTestId('em-vg-fit')).toBeChecked();
  await page.getByTestId('em-vg-model').selectOption('gaussian');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('Built');
  await page.getByTestId('em-map-layer').selectOption('phi_var');
  await expect(page.getByTestId('em-map-variance-note')).toBeVisible();
  await expect(page.getByTestId('em-map-canvas')).toBeVisible();
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-prov-zone-1-phi')).toContainText('okrige(4w) gaussian');
  await expect(page.getByTestId('em-prov-zone-1-phi')).toContainText('fitted');
});

test('EM5: volumes CSV in the chosen units, launchers into ReservoirCalc Pro and Mapping after a publish, help', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-volume-units').selectOption('field');
  const dl = page.waitForEvent('download');
  await page.getByTestId('em-volumes-csv').click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/-volumes-field\.csv$/);
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('bulk (acre-ft)');
  expect(text).toContain('hcpv (MMbbl)');
  expect(text).toContain('Zone 1,A,TOTAL');
  await expect(page.getByTestId('em-status')).toContainText('Volumes exported as');

  await expect(page.getByTestId('em-open-rcp')).toHaveCount(0);
  await page.getByTestId('em-map-layer').selectOption('thickness');
  await page.getByTestId('em-publish').click();
  await expect(page.getByTestId('em-status')).toContainText('Published');
  await expect(page.getByTestId('em-open-rcp')).toHaveAttribute('href', /reservoircalc-pro\?surface=surf-/);
  await expect(page.getByTestId('em-open-mapping')).toHaveAttribute('href', /\/dev\/mapping-surface-studio\?surface=surf-/);
  await expect(page.getByTestId('em-map-TopA')).toHaveCount(0); // stacked rows carry no map link
  await expect(page.getByTestId('em-help')).toHaveAttribute('href', '/dev/earth-modeling/help');
});
