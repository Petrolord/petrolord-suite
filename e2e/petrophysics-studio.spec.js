// Petrophysics Studio G2.3 acceptance: the workstation drives on the
// /dev harness without auth, and the UI reproduces the ORACLE'S
// numbers — the harness's seeded well IS the analytic type well the
// goldens are generated from, and the default parameter set matches
// its construction params. SAND A net pay must read 18.0 m and an
// added SAND B 2.5 m, straight off the zone cards.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// expected zone numbers come from the committed goldens, not hardcoded
// literals — fixture regeneration cannot silently drift past this spec
const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(fs.readFileSync(
  path.join(here, '..', 'test-data', 'petrophysics', 'goldens.json'), 'utf8',
));
const goldenNet = (zone) => goldens.ZONES[zone].summary.net_m.toFixed(1);

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
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText(goldenNet('SAND_A'));

  // add SAND B at the golden window -> the oracle's net pay
  await page.getByTestId('petro-zone-name').fill('SAND B');
  await page.getByTestId('petro-zone-top').fill('2050');
  await page.getByTestId('petro-zone-base').fill('2080');
  await page.getByTestId('petro-zone-add').click();
  await expect(page.getByTestId('petro-zone-net-SAND B')).toHaveText(goldenNet('SAND_B'));

  // relaxing the Sw cutoff reruns the pipeline live: SAND B's water leg
  // becomes pay and net grows well past the oil-leg-only value
  await page.getByTestId('petro-param-cutSw').fill('1.0');
  await page.getByTestId('petro-params-apply').click();
  await expect.poll(() => netOf(page, 'SAND B')).toBeGreaterThan(20);
  expect(await netOf(page, 'SAND A')).toBeGreaterThanOrEqual(18);

  // and zones delete
  await page.getByTestId('petro-zone-delete-SAND B').click();
  await expect(page.getByTestId('petro-zone-net-SAND B')).toHaveCount(0);
});

test('crossplots: ND facies polygon tagging and Pickett fit writes parameters back', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // white-theme crossplot with the suite watermark
  await page.getByTestId('petro-view-crossplot').click();
  const canvas = page.getByTestId('petro-crossplot-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('petro-crossplot').locator('img[alt="Petrolord"]')).toBeVisible();

  // draw a facies polygon covering most of the ND plot area
  await page.getByTestId('petro-facies-draw').click();
  const box = await canvas.boundingBox();
  const M = { l: 52, r: 12, t: 12, b: 34 }; // Crossplot margins
  const pw = box.width - M.l - M.r;
  const ph = box.height - M.t - M.b;
  const click = (fx, fy) => page.mouse.click(box.x + M.l + fx * pw, box.y + M.t + fy * ph);
  await click(0.1, 0.1);
  await click(0.9, 0.1);
  await click(0.9, 0.9);
  await click(0.1, 0.9);
  await page.getByTestId('petro-facies-name').fill('Sand cluster');
  await page.getByTestId('petro-facies-close').click();
  await expect(page.getByTestId('petro-facies-chip-Sand cluster')).toBeVisible();
  const tagged = parseInt(await page.getByTestId('petro-facies-count-Sand cluster').innerText(), 10);
  expect(tagged).toBeGreaterThan(100);

  // distort m, then the Pickett water-line fit on the type well's
  // aquifer recovers the construction truth and writes it back
  await page.getByTestId('petro-param-m').fill('1.8');
  await page.getByTestId('petro-params-apply').click();
  await page.getByTestId('petro-plot-pickett').click();
  await page.getByTestId('petro-pickett-top').fill('2075');
  await page.getByTestId('petro-pickett-base').fill('2078');
  await page.getByTestId('petro-pickett-fit').click();
  await expect(page.getByTestId('petro-pickett-result')).toContainText('m = 2.000');
  await expect(page.getByTestId('petro-pickett-result')).toContainText('a·Rw = 0.0500');
  await page.getByTestId('petro-pickett-apply').click();
  await expect(page.getByTestId('petro-param-m')).toHaveValue('2');
  await expect(page.getByTestId('petro-param-rw')).toHaveValue('0.05');

  // facies delete clears the chip
  await page.getByTestId('petro-plot-nd').click();
  await page.getByTestId('petro-facies-delete-Sand cluster').click();
  await expect(page.getByTestId('petro-facies-chip-Sand cluster')).toHaveCount(0);
});

test('publish curves + zone, batch run, and project persistence across reload', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // publish computed curves -> the 4 outputs appear as mapped inputs
  await page.getByTestId('petro-publish').click();
  await expect(page.getByTestId('petro-status')).toContainText('Published 4 curves');

  // publish the seeded SAND A zone summary -> "on record" marker
  await page.getByTestId('petro-zone-publish-SAND A').click();
  await expect(page.getByTestId('petro-zone-summary-SAND A')).toBeVisible();
  await expect(page.getByTestId('petro-zones')).toContainText('published summary on record');

  // change a parameter and save the project
  await page.getByTestId('petro-param-cutSw').fill('0.55');
  await page.getByTestId('petro-params-apply').click();
  await page.getByTestId('petro-save-project').click();
  await expect(page.getByTestId('petro-status')).toContainText('Project saved');

  // reload: the saved project restores the parameter (sessionStorage)
  await page.reload();
  await expect(page.getByTestId('petro-status')).toContainText('Restored saved project');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await page.getByTestId('petro-toggle-dock');
  await expect(page.getByTestId('petro-param-cutSw')).toHaveValue('0.55');

  // batch run across owned wells
  await page.getByTestId('petro-batch').click();
  await page.getByTestId('petro-batch-pick-KETA TYPE-1').check();
  await page.getByTestId('petro-batch-run').click();
  await expect(page.getByTestId('petro-batch-result-KETA TYPE-1')).toContainText('curves published');
});

test('org-shared well is read-only for zones; invalid zone input errors', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');

  // read-only path: published zone visible, no editing/publish affordances
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.locator('[data-zone-name="MAIN"]')).toBeVisible();
  await expect(page.getByTestId('petro-zone-add')).toHaveCount(0);
  await expect(page.getByTestId('petro-zones')).toContainText('read-only');
  await expect(page.getByTestId('petro-publish')).toBeDisabled();

  // owner path: a zone with base above top is rejected with a message
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await page.getByTestId('petro-zone-name').fill('BAD');
  await page.getByTestId('petro-zone-top').fill('2080');
  await page.getByTestId('petro-zone-base').fill('2050');
  await page.getByTestId('petro-zone-add').click();
  await expect(page.getByTestId('petro-zone-error')).toContainText('base below top');
});
