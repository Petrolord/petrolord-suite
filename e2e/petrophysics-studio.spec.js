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
  path.join(here, '..', 'packages', 'engines', 'test-data', 'petrophysics', 'goldens.json'), 'utf8',
));
const goldenNet = (zone) => goldens.ZONES[zone].summary.net_m.toFixed(1);

const netOf = async (page, zone) => parseFloat(await page.getByTestId(`petro-zone-net-${zone}`).innerText());

test('type well loads, tracks render, zone summaries match the oracle', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');

  await expect(page.getByTestId('petro-well-row')).toHaveCount(3);
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
  await expect(page.getByTestId('petro-status')).toContainText('Saved Default interpretation');

  // reload: the saved project restores the parameter (sessionStorage)
  await page.reload();
  await expect(page.getByTestId('petro-status')).toContainText('Restored Default interpretation');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await page.getByTestId('petro-toggle-dock');
  await expect(page.getByTestId('petro-param-cutSw')).toHaveValue('0.55');

  // batch run across owned wells
  await page.getByTestId('petro-batch').click();
  await page.getByTestId('petro-batch-pick-KETA TYPE-1').check();
  await page.getByTestId('petro-batch-run').click();
  await expect(page.getByTestId('petro-batch-result-KETA TYPE-1')).toContainText('curves published');
});

test('digitizer wizard traces a curve from a scanned image and saves it', async ({ page }) => {
  const IMG = path.join(here, '..', 'packages', 'engines', 'test-data', 'petrophysics', 'log_scan.png');
  // calibration prompts answered in order: 2 depths then 2 values
  const answers = ['2000', '2100', '0', '100'];
  page.on('dialog', (d) => d.accept(answers.shift()));

  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  await page.getByTestId('petro-digitize').click();
  await page.getByTestId('petro-digitizer-file').setInputFiles(IMG);
  const canvas = page.getByTestId('petro-digitizer-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const at = (fx, fy) => page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);

  // depth axis: two horizontal reference lines
  await at(0.5, 0.15); await at(0.5, 0.85);
  // value axis: two vertical reference lines
  await at(0.2, 0.5); await at(0.8, 0.5);
  // trace: distinct depths (different y) so the curve has >=2 samples
  await page.getByTestId('petro-digitizer-mnemonic').fill('PORB');
  await page.getByTestId('petro-digitizer-step').fill('1');
  await at(0.4, 0.2); await at(0.5, 0.4); await at(0.45, 0.6); await at(0.6, 0.8);

  await page.getByTestId('petro-digitizer-save').click();
  await expect(page.getByTestId('petro-status')).toContainText('Digitized PORB added');
});

test('PS1: z-color with colorbar, point identify tooltip, Buckles plot, zoom reset', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await page.getByTestId('petro-view-crossplot').click();
  const canvas = page.getByTestId('petro-crossplot-canvas');
  await expect(canvas).toBeVisible();

  // colorbar pixel probe: the right gutter is white without z-color,
  // painted once Color by = Depth
  const gutterPixel = () => canvas.evaluate((el) => {
    const dpr = window.devicePixelRatio || 1;
    const px = el.getContext('2d').getImageData(
      Math.round((el.clientWidth - 33) * dpr),
      Math.round((el.clientHeight / 2) * dpr), 1, 1,
    ).data;
    return px[0] + px[1] + px[2];
  });
  const before = await gutterPixel();
  expect(before).toBeGreaterThan(740); // white background
  await page.getByTestId('petro-colorby').selectOption('depth');
  await expect.poll(gutterPixel).toBeLessThan(700); // viridis ramp painted

  // hover near a sample -> identify tooltip with depth and z value
  const box = await canvas.boundingBox();
  const probes = [];
  for (let fx = 0.15; fx < 0.9; fx += 0.1) {
    for (let fy = 0.15; fy < 0.9; fy += 0.1) probes.push([fx, fy]);
  }
  let seen = false;
  for (const [fx, fy] of probes) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    if (await page.getByTestId('petro-crossplot-tooltip').isVisible().catch(() => false)) {
      seen = true;
      break;
    }
  }
  expect(seen).toBe(true);
  await expect(page.getByTestId('petro-crossplot-tooltip')).toContainText('m MD');
  await expect(page.getByTestId('petro-crossplot-tooltip')).toContainText('Depth (m MD)');

  // wheel zoom arms the reset button; reset clears it
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await expect(page.getByTestId('petro-zoom-reset')).toBeVisible();
  await page.getByTestId('petro-zoom-reset').click();
  await expect(page.getByTestId('petro-zoom-reset')).toHaveCount(0);

  // Buckles plot renders with iso-BVW overlays (canvas up and sized)
  await page.getByTestId('petro-plot-buckles').click();
  await expect(canvas).toBeVisible();
  const bbox = await canvas.boundingBox();
  expect(bbox.width).toBeGreaterThan(300);
});

test('PS3: per-zone overrides drive the summary; named interpretations round-trip them', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // baseline: the seeded SAND A zone reads the golden net pay
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText(goldenNet('SAND_A'));

  // zone scope: override Rw for SAND A only — Sw blows past the cutoff
  // and the zone's net pay collapses, while global Rw stays 0.05
  await page.getByTestId('petro-param-scope').selectOption({ label: 'Zone: SAND A' });
  await page.getByTestId('petro-param-rw').fill('0.5');
  await page.getByTestId('petro-params-apply').click();
  await expect(page.getByTestId('petro-zone-overrides-SAND A')).toBeVisible();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText('0.0');
  await page.getByTestId('petro-param-scope').selectOption({ label: 'Global' });
  await expect(page.getByTestId('petro-param-rw')).toHaveValue('0.05');

  // save the state as a named interpretation
  page.once('dialog', (d) => d.accept('Case B'));
  await page.getByTestId('petro-interp').click();
  await page.getByTestId('petro-interp-saveas').click();
  await expect(page.getByTestId('petro-interp-name')).toHaveText('Case B');

  // clear the override live — golden net returns
  await page.getByTestId('petro-param-scope').selectOption({ label: 'Zone: SAND A •' });
  await page.getByTestId('petro-params-clear-zone').click();
  await expect(page.getByTestId('petro-zone-overrides-SAND A')).toHaveCount(0);
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText(goldenNet('SAND_A'));

  // reopen Case B — the zone override comes back from zone_params
  await page.getByTestId('petro-interp').click();
  await page.getByTestId('petro-interp-open-Case B').click();
  await expect(page.getByTestId('petro-zone-overrides-SAND A')).toBeVisible();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText('0.0');
});

test('PS2: export deliverables download; a well without logs shows the empty state', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');

  // C2 empty state: a well with no depth curve is guidance, not an error
  await page.locator('[data-well-name="EMPTY-3 (no logs)"]').click();
  await expect(page.getByTestId('petro-no-depth')).toBeVisible();
  await expect(page.getByTestId('petro-no-depth')).toContainText('Well Data Manager');
  await expect(page.getByTestId('petro-export')).toBeDisabled();

  // deliverables from the type well
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await page.getByTestId('petro-export').click();
  await expect(page.getByTestId('petro-export-dialog')).toBeVisible();

  const grab = async (testid) => {
    const dl = page.waitForEvent('download');
    await page.getByTestId(testid).click();
    return dl;
  };

  const csv = await grab('petro-export-csv');
  expect(csv.suggestedFilename()).toBe('KETA_TYPE-1_curves.csv');
  const las = await grab('petro-export-las');
  expect(las.suggestedFilename()).toBe('KETA_TYPE-1_interpretation.las');
  const zones = await grab('petro-export-zones');
  expect(zones.suggestedFilename()).toBe('KETA_TYPE-1_zones.csv');
  const pdf = await grab('petro-export-pdf');
  expect(pdf.suggestedFilename()).toBe('KETA_TYPE-1_petrophysics_report.pdf');
  await expect(page.getByTestId('petro-status')).toContainText('Exported PDF report');
});

test('PS5: Rw tools apply through Arps; Waxman-Smits at Qv=0 reproduces the Archie net pay', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText(goldenNet('SAND_A'));

  // Arps converter: 0.1 ohm.m at 25 C converted to 65 C, applied as Rw
  const cToF = (c) => (c * 9) / 5 + 32;
  const rw2 = (0.1 * (cToF(25) + 6.77)) / (cToF(65) + 6.77);
  await page.getByTestId('petro-rwtools').click();
  await expect(page.getByTestId('petro-rw-arps-result')).toContainText(String(Number(rw2.toFixed(6))));
  await page.getByTestId('petro-rw-arps-apply').click();
  await expect(page.getByTestId('petro-param-rw')).toHaveValue(String(Number(rw2.toFixed(6))));

  // back to the construction Rw, then Waxman-Smits with Qv = 0 and a
  // manual B: the exact Archie reduction must land the same net pay
  await page.getByTestId('petro-param-rw').fill('0.05');
  await page.getByTestId('petro-param-swMethod').selectOption('waxman-smits');
  await expect(page.getByText('m* (shaly rock)')).toBeVisible();
  await page.getByTestId('petro-param-qv').fill('0');
  await page.getByTestId('petro-param-bMode').selectOption('manual');
  await page.getByTestId('petro-param-bValue').fill('3');
  await page.getByTestId('petro-params-apply').click();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toHaveText(goldenNet('SAND_A'));
});

test('PS6: Timur permeability lands the golden zone geometric mean and publishes as KPERM', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // no perm by default
  await expect(page.getByTestId('petro-zone-kgm-SAND A')).toHaveCount(0);

  await page.getByTestId('petro-param-permMethod').selectOption('timur');
  await expect(page.getByTestId('petro-param-hint')).toContainText('Timur 1968');
  await page.getByTestId('petro-params-apply').click();

  // the zone card reads the oracle's thickness-weighted geometric mean
  const wantK = goldens.PERM.zones.SAND_A.k_gm_timur.toFixed(1);
  await expect(page.getByTestId('petro-zone-kgm-SAND A')).toContainText(`${wantK} mD`);

  // KPERM joins the published set
  await page.getByTestId('petro-publish').click();
  await expect(page.getByTestId('petro-status')).toContainText('Published 5 curves');
});

test('PS4: track builder forks the built-in, layout persists, ft toggle and PNG export work', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // header click on the first track opens its editor in the dock
  const canvas = page.getByTestId('petro-tracks-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 70, box.y + 20); // inside the GR header, right of the axis gutter
  await expect(page.getByTestId('petro-layout-track-title')).toBeVisible();
  await expect(page.getByTestId('petro-layout-track-title')).toHaveValue('GR (API)');

  // removing a track from the built-in forks it (clone-on-edit)
  await page.getByTestId('petro-layout-remove-Pay').click();
  await expect(page.getByTestId('petro-layout-template')).toContainText('Standard triple combo (edited)');
  await expect(page.getByTestId('petro-layout-template').locator('option')).toHaveCount(3);

  // the fork survives save + reload with the interpretation
  await page.getByTestId('petro-save-project').click();
  await expect(page.getByTestId('petro-status')).toContainText('Saved');
  await page.reload();
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  const sel = page.getByTestId('petro-layout-template');
  await expect(sel).toContainText('Standard triple combo (edited)');
  const selected = await sel.inputValue();
  const label = await sel.locator(`option[value="${selected}"]`).innerText();
  expect(label).toContain('(edited)');

  // display-unit toggle flips the badge (labels are display-only)
  await expect(page.getByTestId('petro-depth-unit')).toContainText('depth: m');
  await page.getByTestId('petro-depth-unit').click();
  await expect(page.getByTestId('petro-depth-unit')).toContainText('depth: ft');

  // PNG export of the rendered track view
  await page.getByTestId('petro-export').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('petro-export-png').click();
  expect((await dl).suggestedFilename()).toBe('KETA_TYPE-1_tracks.png');
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
