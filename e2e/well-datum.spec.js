// The well datum model (WDM U2-007) in a real browser on the /dev harness:
//   a well with no reference elevation says so and withholds TVDSS;
//   the Header editor takes a full offshore datum, with the confirmation
//   that lists what moves on a well that has tops;
//   hostile entries are refused with the reason and Save stays disabled;
//   ?datum=legacy walks the registry before the migration: the elevation
//   alone is saved and the form says so;
//   390 wide: the editor has no sideways page scroll.
import { test, expect } from '@playwright/test';
import { seedUnitView } from './helpers/unitView.js';

test.beforeEach(async ({ page }) => { await seedUnitView(page, 'well-data-manager'); });

async function manualWell(page, { name, kb = null, tops = true }) {
  await page.getByTestId('wdm-open-manual').click();
  await page.getByTestId('well-import-name').fill(name);
  await page.getByTestId('well-import-x').fill('501500');
  await page.getByTestId('well-import-y').fill('6700600');
  if (kb !== null) await page.getByTestId('well-import-kb').fill(String(kb));
  await page.getByTestId('well-import-td').fill('1800');
  if (tops) {
    await page.getByTestId('well-tab-tops').click();
    await page.getByTestId('well-import-text').fill('name,md\nTop Dome,1500\nBase Seal,1690');
  }
  await page.getByTestId('well-import-save').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText(name);
}

test('not set is said and TVDSS withheld; a full offshore datum is entered, confirmed and recorded', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/well-data-manager');
  await manualWell(page, { name: 'DATUM-1' });
  await expect(page.getByTestId('wdm-datum-line')).toHaveText('Depth reference not set');
  await expect(page.getByTestId('wdm-datum-unset')).toContainText('DATUM-1 has no depth reference elevation, so TVDSS and elevations cannot be given.');
  await page.getByTestId('wdm-detail-tab-tops').click();
  await expect(page.getByTestId('wdm-top-md-Top Dome')).toHaveText('1500.0');
  await expect(page.getByTestId('wdm-top-tvdss-Top Dome')).toHaveText('n/a');
  await expect(page.getByTestId('wdm-tops-kb-note')).toContainText('TVDSS is withheld');

  await page.getByTestId('wdm-detail-tab-header').click();
  await page.getByTestId('wdm-edit-header').click();
  await expect(page.getByTestId('wdm-header-kb')).toHaveValue('');
  await page.getByTestId('wdm-datum-kind').selectOption('KB');
  await page.getByTestId('wdm-header-kb').fill('25');
  await page.getByTestId('wdm-datum-vdatum').fill('MSL');
  await page.getByTestId('wdm-datum-env').selectOption('offshore');
  await page.getByTestId('wdm-datum-water').fill('100');
  await page.getByTestId('wdm-header-save').click();
  const impact = page.getByTestId('wdm-datum-impact');
  await expect(impact).toContainText('The reference elevation becomes 25.00 m. TVDSS and elevations of this well become available.');
  await expect(impact).toContainText('2 tops: MD kept, TVDSS and elevation move.');
  await page.getByTestId('wdm-datum-reason').fill('rig survey report');
  await page.getByTestId('wdm-datum-confirm').click();
  await expect(page.getByTestId('wdm-datum-line')).toHaveText('KB 25.00 m above MSL, water depth 100.00 m');
  await expect(page.getByTestId('wdm-datum-history')).toContainText('changed the depth reference from not set to KB 25.00 m (rig survey report)');
  await page.getByTestId('wdm-detail-tab-tops').click();
  await expect(page.getByTestId('wdm-top-tvdss-Top Dome')).toHaveText('1475.0');
  await expect(page.getByTestId('wdm-tops-kb-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hostile datum entries are refused with the reason; 390 wide has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-data-manager');
  await manualWell(page, { name: 'DATUM-2', kb: 30, tops: false });
  await expect(page.getByTestId('wdm-datum-line')).toHaveText('KB 30.00 m above datum (not named, taken as mean sea level)');
  await page.getByTestId('wdm-edit-header').click();
  await page.getByTestId('wdm-datum-env').selectOption('offshore');
  await page.getByTestId('wdm-datum-water').fill('100');
  await page.getByTestId('wdm-datum-env').selectOption('onshore');
  await expect(page.getByTestId('wdm-datum-error')).toHaveText('Water depth belongs to an offshore well. This well is onshore: clear the water depth or change the environment.');
  await expect(page.getByTestId('wdm-header-save')).toBeDisabled();
  await page.getByTestId('wdm-datum-env').selectOption('offshore');
  await page.getByTestId('wdm-header-kb').fill('-30');
  await expect(page.getByTestId('wdm-datum-error')).toHaveText('An offshore KB cannot be below the vertical datum (-30 m). Check the sign.');
  await page.getByTestId('wdm-header-kb').fill('62010');
  await expect(page.getByTestId('wdm-datum-error')).toContainText('is outside any land or rig elevation. Check the unit.');
  await expect(page.getByTestId('wdm-header-save')).toBeDisabled();
  // feet: the unit switch converts what was typed
  await page.getByTestId('wdm-header-kb').fill('30');
  await page.getByTestId('wdm-header-unit').selectOption('ft');
  await expect(page.getByTestId('wdm-header-kb')).toHaveValue('98.425');
  await expect(page.getByTestId('wdm-header-save')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('before the registry upgrade (?datum=legacy) the elevation alone is saved and the form says so', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-data-manager?datum=legacy');
  await manualWell(page, { name: 'DATUM-3', kb: 30, tops: false });
  await page.getByTestId('wdm-edit-header').click();
  await expect(page.getByTestId('wdm-datum-legacy-note')).toContainText('The registry on this server keeps one elevation per well for now, read as the KB.');
  await expect(page.getByTestId('wdm-datum-kind')).toBeDisabled();
  await expect(page.getByTestId('wdm-datum-env')).toBeDisabled();
  await page.getByTestId('wdm-header-kb').fill('32');
  await page.getByTestId('wdm-header-save').click();
  await expect(page.getByTestId('wdm-datum-line')).toHaveText('KB 32.00 m above datum (not named, taken as mean sea level)');
  await expect(page.getByTestId('wdm-datum-history')).toContainText('changed the depth reference from KB 30.00 m to KB 32.00 m');
  // a blank KB on this side keeps the earlier reading, and says what a 0 may mean
  await manualWell(page, { name: 'DATUM-4', tops: true });
  await page.getByTestId('wdm-detail-tab-tops').click();
  await expect(page.getByTestId('wdm-top-tvdss-Top Dome')).toHaveText('1500.0');
  await expect(page.getByTestId('wdm-tops-kb-note')).toContainText('KB is 0 in the registry, which cannot yet tell 0 from not entered.');
});
