// Rock Physics Studio G6.4 acceptance: the workstation drives on the
// /dev harness without auth, and the UI reproduces the ORACLE'S
// numbers — the harness's seeded wells ARE the goldens' anchor cases
// (test-data/rockphysics/). Brine-sand Gassmann substitution, the
// shale/gas-sand AVO interface and the default wedge tuning are all
// asserted from the committed goldens, never hardcoded literals, so
// fixture regeneration cannot silently drift past this spec.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(fs.readFileSync(
  path.join(here, '..', 'test-data', 'rockphysics', 'goldens.json'), 'utf8',
));
const LOG = goldens.gassmann.log_domain;
const CLASS3 = goldens.avo.find((c) => c.name === 'class3_gas_sand');
const WEDGE = goldens.wedge;

test('fluid substitution on the brine sand matches the oracle log-domain golden', async ({ page }) => {
  await page.goto('/dev/rock-physics-studio');

  await expect(page.getByTestId('rp-well-row')).toHaveCount(2);
  await page.locator('[data-well-name="KETA RP-1"]').click();

  // engine inputs mapped, measured shear -> no provenance badge
  const inventory = page.getByTestId('rp-curve-inventory');
  await expect(inventory).toBeVisible();
  for (const key of ['DEPT', 'DT', 'DTS', 'RHOB', 'PHIE', 'VSH']) {
    await expect(inventory).toContainText(key);
  }
  await expect(page.getByTestId('rp-vs-badge')).toHaveCount(0);

  // default zone = BRINE SAND; the seeded project's K_min override is
  // the golden's 37 GPa and the default scenario is brine -> gas, so
  // the Batzle-Wang table and the interval means ARE the golden
  await expect(page.getByTestId('rp-fluid-a-k')).toHaveText((LOG.fl_a.k / 1e9).toFixed(3));
  await expect(page.getByTestId('rp-fluid-a-rho')).toHaveText(LOG.fl_a.rho.toFixed(2));
  await expect(page.getByTestId('rp-fluid-b-k')).toHaveText((LOG.fl_b.k / 1e9).toFixed(3));

  await expect(page.getByTestId('rp-sub-before-vp')).toHaveText('3200.00');
  await expect(page.getByTestId('rp-sub-after-vp')).toHaveText(LOG.vp.toFixed(2));
  await expect(page.getByTestId('rp-sub-after-vs')).toHaveText(LOG.vs.toFixed(2));
  await expect(page.getByTestId('rp-sub-after-rho')).toHaveText(LOG.rho.toFixed(2));

  // switching the zone re-runs the substitution live on gas-sand rock
  await page.getByTestId('rp-zone-select').selectOption({ label: 'GAS SAND (2060–2080 m)' });
  await expect(page.getByTestId('rp-sub-before-vp')).toHaveText('2540.00');
});

test('AVO from the Top GAS SAND top reads the class-III golden intercept/gradient', async ({ page }) => {
  await page.goto('/dev/rock-physics-studio');
  await page.locator('[data-well-name="KETA RP-1"]').click();
  await expect(page.getByTestId('rp-curve-inventory')).toBeVisible();

  await page.getByTestId('rp-view-avo').click();
  await expect(page.getByTestId('rp-avo-panel')).toBeVisible();
  await page.getByTestId('rp-avo-top-select').selectOption({ label: 'Top GAS SAND (2060 m)' });

  // averaging windows land on the pure shale / gas-sand constants, so
  // the interface IS the class-III oracle case
  await expect(page.getByTestId('rp-avo-upper-mean-vp')).toHaveText(CLASS3.upper.vp.toFixed(1));
  await expect(page.getByTestId('rp-avo-lower-mean-vp')).toHaveText(CLASS3.lower.vp.toFixed(1));
  await expect(page.getByTestId('rp-avo-a')).toHaveText(CLASS3.A.toFixed(4));
  await expect(page.getByTestId('rp-avo-b')).toHaveText(CLASS3.B.toFixed(4));
  await expect(page.getByTestId('rp-avo-class')).toHaveText(`Class ${CLASS3.avo_class}`);

  // manual halfspaces default to the same fixture and stay drivable
  // with no well context
  await page.getByTestId('rp-avo-mode-manual').click();
  await expect(page.getByTestId('rp-avo-a')).toHaveText(CLASS3.A.toFixed(4));

  // the white chart cards carry the suite watermark
  await expect(page.getByTestId('rp-avo-panel').locator('img[alt="Petrolord"]').first()).toBeVisible();
});

test('wedge panel tunes at the oracle thickness and recomputes live', async ({ page }) => {
  await page.goto('/dev/rock-physics-studio');

  // the wedge is pure parameters — usable with no well selected
  await page.getByTestId('rp-view-wedge').click();
  await expect(page.getByTestId('rp-wedge-panel')).toBeVisible();
  await expect(page.getByTestId('rp-wedge-tuning')).toHaveText(String(WEDGE.tuning_thickness_ms));

  const canvas = page.getByTestId('rp-wedge-canvas').locator('canvas');
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(200);
  expect(box.height).toBeGreaterThan(100);

  // doubling the Ricker frequency halves the tuning thickness
  await page.getByTestId('rp-wedge-freq').fill(String(WEDGE.freq_hz * 2));
  await expect(page.getByTestId('rp-wedge-tuning')).toHaveText(String(WEDGE.tuning_thickness_ms / 2));
});

test('no-DTS well flags estimated Vs; project state survives reload', async ({ page }) => {
  await page.goto('/dev/rock-physics-studio');

  // the org-shared well has no shear log -> provenance badge
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.getByTestId('rp-vs-badge')).toBeVisible();
  await expect(page.getByTestId('rp-status')).toContainText('Vs estimated');

  // change the mineral modulus override, save, reload -> restored
  await page.getByTestId('rp-param-kmin').fill('40');
  await page.getByTestId('rp-apply-params').click();
  await page.getByTestId('rp-save-project').click();
  await expect(page.getByTestId('rp-status')).toContainText('Project saved');

  await page.reload();
  await expect(page.getByTestId('rp-status')).toContainText('Restored saved project');
  await expect(page.getByTestId('rp-param-kmin')).toHaveValue('40');
});

test('rock-physics-studio app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/rock-physics-studio');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('rock-physics-studio'); // redirected by the auth gate
});
