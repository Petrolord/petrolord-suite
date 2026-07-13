// Petrophysics Studio G2.3 acceptance: the workstation drives on the
// /dev harness without auth, and the UI reproduces the ORACLE'S
// numbers — the harness's seeded well IS the analytic type well the
// goldens are generated from, and the default parameter set matches
// its construction params. SAND A net pay must read 18.0 m and an
// added SAND B 2.5 m, straight off the zone cards.

import { test, expect } from '@playwright/test';

const netOf = async (page, zone) => parseFloat(await page.getByTestId(`petro-zone-net-${zone}`).innerText());

test('type well loads, tracks render, zone summaries match the oracle', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');

  await expect(page.getByTestId('petro-well-row')).toHaveCount(2);
  await page.locator('[data-well-name="KETA TYPE-1"]').click();

  // all six standard curves map
  const inventory = page.getByTestId('petro-curve-inventory');
  await expect(inventory).toBeVisible();
  for (const key of ['DEPT', 'GR', 'RHOB', 'NPHI', 'DT', 'RT']) {
    await expect(inventory).toContainText(key);
  }
  await expect(page.getByTestId('petro-missing')).toHaveCount(0);

  // tracks canvas up and sized
  const canvas = page.getByTestId('petro-tracks-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(200);

  // the seeded zone reads the oracle's SAND_A summary
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText('18.0');

  // add SAND B at the golden window -> oracle net 2.5 m
  await page.getByTestId('petro-zone-name').fill('SAND B');
  await page.getByTestId('petro-zone-top').fill('2050');
  await page.getByTestId('petro-zone-base').fill('2080');
  await page.getByTestId('petro-zone-add').click();
  await expect(page.getByTestId('petro-zone-net-SAND B')).toHaveText('2.5');

  // relaxing the Sw cutoff reruns the pipeline live: SAND B's water leg
  // becomes pay and net grows well past the oil-leg-only 2.5 m
  await page.getByTestId('petro-param-cutSw').fill('1.0');
  await page.getByTestId('petro-params-apply').click();
  await expect.poll(() => netOf(page, 'SAND B')).toBeGreaterThan(20);
  expect(await netOf(page, 'SAND A')).toBeGreaterThanOrEqual(18);

  // and zones delete
  await page.getByTestId('petro-zone-delete-SAND B').click();
  await expect(page.getByTestId('petro-zone-net-SAND B')).toHaveCount(0);
});

test('org-shared well is read-only for zones; invalid zone input errors', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');

  // read-only path: published zone visible, no editing affordances
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.locator('[data-zone-name="MAIN"]')).toBeVisible();
  await expect(page.getByTestId('petro-zone-add')).toHaveCount(0);
  await expect(page.getByTestId('petro-zones')).toContainText('read-only');

  // owner path: a zone with base above top is rejected with a message
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await page.getByTestId('petro-zone-name').fill('BAD');
  await page.getByTestId('petro-zone-top').fill('2080');
  await page.getByTestId('petro-zone-base').fill('2050');
  await page.getByTestId('petro-zone-add').click();
  await expect(page.getByTestId('petro-zone-error')).toContainText('base below top');
});
