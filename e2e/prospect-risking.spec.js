// Prospect Risking G5.3 acceptance: the panel drives on the /dev
// harness without auth. The seeded unrisked run + deterministic Pg
// arithmetic make the risked numbers exact — risked-mean and the
// success-case percentiles stay separate.

import { test, expect } from '@playwright/test';

test('set Pg factors, see risked volume, build inventory + portfolio', async ({ page }) => {
  await page.goto('/dev/prospect-risking');
  await expect(page.getByTestId('prospect-risking')).toBeVisible();

  // seeded harness: one prospect already in the inventory
  await expect(page.getByTestId('prospect-count')).toHaveText('1');

  // seeded unrisked run is mean=40, p50=33 -> shows in the volume fields
  await expect(page.getByTestId('vol-mean')).toHaveValue('40');
  await expect(page.getByTestId('vol-p50')).toHaveValue('33');

  // set Pg = 0.5·0.6·1·1 = 0.30 via the sliders (charge/seal stay 1... set explicitly)
  const setSlider = async (f, v) => {
    const el = page.getByTestId(`pg-${f}`);
    await el.evaluate((node, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(node, String(val));
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  };
  await setSlider('trap', 0.5);
  await setSlider('reservoir', 0.6);
  await setSlider('charge', 1);
  await setSlider('seal', 1);
  await expect(page.getByTestId('pg-total')).toHaveText('30.0%');

  // risked mean = 0.30 * 40 = 12.0; success case P50 = 33 (unscaled)
  await expect(page.getByTestId('risked-mean')).toHaveText('12');
  await expect(page.getByTestId('success-p90p50')).toContainText('33');

  // add to inventory
  await page.getByTestId('prospect-name').fill('Alpha');
  await page.getByTestId('prospect-add').click();
  await expect(page.getByTestId('prospect-count')).toHaveText('2');
  await expect(page.locator('[data-prospect-name="Alpha"]')).toBeVisible();

  // portfolio roll-up present with the two prospects
  await expect(page.getByTestId('portfolio')).toBeVisible();
  // seed prospect risked_mean 25 + Alpha 12 = expected risked volume 37
  await expect(page.getByTestId('portfolio-risked')).toHaveText('37');

  // delete Alpha
  await page.getByTestId('prospect-delete-Alpha').click();
  await expect(page.getByTestId('prospect-count')).toHaveText('1');
});
