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
import os from 'os';
import { writeSyntheticScan, expectedValueAt, SCAN } from './helpers/syntheticScan.js';

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

test('digitizer by hand: inline calibration, clicked trace, review, saved as a new _DIG curve', async ({ page }) => {
  const IMG = path.join(here, '..', 'packages', 'engines', 'test-data', 'petrophysics', 'log_scan.png');
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  await page.getByTestId('petro-digitize').click();
  await page.getByTestId('petro-digitizer-file').setInputFiles(IMG);
  const canvas = page.getByTestId('petro-digitizer-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const at = (fx, fy) => page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);

  // calibration: the armed row advances depth 1 -> depth 2 -> value 1 -> value 2
  await at(0.5, 0.15); await at(0.5, 0.85);
  await at(0.2, 0.5); await at(0.8, 0.5);
  await page.getByTestId('petro-digitizer-cal-depth-0').fill('2000');
  await page.getByTestId('petro-digitizer-cal-depth-1').fill('2100');
  await page.getByTestId('petro-digitizer-cal-value-0').fill('0');
  await page.getByTestId('petro-digitizer-cal-value-1').fill('100');
  await page.getByTestId('petro-digitizer-mnemonic').fill('PORB');
  await page.getByTestId('petro-digitizer-step').fill('1');
  await expect(page.getByTestId('petro-digitizer-savename')).toHaveText('PORB_DIG');
  await page.getByTestId('petro-digitizer-to-trace').click();

  // by hand: distinct depths (different y) so the curve has >= 2 samples
  await page.getByTestId('petro-digitizer-mode-manual').click();
  await at(0.4, 0.2); await at(0.5, 0.4); await at(0.45, 0.6); await at(0.6, 0.8);
  await page.getByTestId('petro-digitizer-to-review').click();
  await expect(page.getByTestId('petro-digitizer-preview')).toContainText('4 points');

  await page.getByTestId('petro-digitizer-save').click();
  await expect(page.getByTestId('petro-status')).toContainText('Digitized PORB_DIG added');
  await expect(page.getByTestId('petro-digitizer-saved')).toContainText('Saved PORB_DIG');
  // the scan and calibration stay for the next curve; a second save gets :2
  await expect(page.getByTestId('petro-digitizer-savename')).toHaveText('PORB_DIG:2');
});

test('PT7: automatic digitizer, AI-read proposal accepted into the form, colour trace of a synthetic scan, saved twice as GR_DIG then GR_DIG:2', async ({ page }) => {
  const IMG = writeSyntheticScan(path.join(os.tmpdir(), `petro-synthetic-scan-${process.pid}.png`));
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  await page.getByTestId('petro-digitize').click();
  await page.getByTestId('petro-digitizer-file').setInputFiles(IMG);
  await expect(page.getByTestId('petro-digitizer-canvas')).toBeVisible();

  // AI read -> proposal card -> accept fills the form (edges assumed, so a note shows)
  await page.getByTestId('petro-digitizer-ai-read').click();
  await expect(page.getByTestId('petro-digitizer-proposal')).toBeVisible();
  await expect(page.getByTestId('petro-digitizer-proposal-mnemonic')).toHaveValue('GR');
  await expect(page.getByTestId('petro-digitizer-proposal-value-right')).toHaveValue('150');
  await page.getByTestId('petro-digitizer-proposal-accept').click();
  await expect(page.getByTestId('petro-digitizer-proposal')).toHaveCount(0);
  await expect(page.getByTestId('petro-digitizer-cal-depth-0')).toHaveValue('2000');
  await expect(page.getByTestId('petro-digitizer-cal-depth-1')).toHaveValue('2100');
  await expect(page.getByTestId('petro-digitizer-cal-value-1')).toHaveValue('150');
  await expect(page.getByTestId('petro-digitizer-assumed')).toBeVisible();
  await expect(page.getByTestId('petro-digitizer-savename')).toHaveText('GR_DIG');
  await page.getByTestId('petro-digitizer-step').fill('1');
  await page.getByTestId('petro-digitizer-to-trace').click();

  // automatic trace over the whole image: the proposal's colour seeds the mask
  await page.getByTestId('petro-digitizer-roi-all').click();
  await page.getByTestId('petro-digitizer-trace').click();
  await expect(page.getByTestId('petro-digitizer-preview')).toBeVisible();
  const preview = await page.getByTestId('petro-digitizer-preview').textContent();
  const m = /Values ([\d.]+) to ([\d.]+)/.exec(preview);
  expect(m).not.toBeNull();
  expect(Math.abs(Number(m[1]) - expectedValueAt(0))).toBeLessThan(1.5);
  expect(Math.abs(Number(m[2]) - expectedValueAt(SCAN.height - 1))).toBeLessThan(1.5);
  expect(preview).toContain('2000 to 2100 m MD');
  await expect(page.getByTestId('petro-digitizer-trace-stats')).toContainText('300 of 300 rows hit');

  await page.getByTestId('petro-digitizer-save').click();
  await expect(page.getByTestId('petro-status')).toContainText('Digitized GR_DIG added');
  // second curve on the same scan: name advances, calibration kept
  await expect(page.getByTestId('petro-digitizer-savename')).toHaveText('GR_DIG:2');
  await page.getByTestId('petro-digitizer-roi-all').click();
  await page.getByTestId('petro-digitizer-trace').click();
  await page.getByTestId('petro-digitizer-save').click();
  await expect(page.getByTestId('petro-status')).toContainText('Digitized GR_DIG:2 added');
  await page.keyboard.press('Escape');
  // both rows are in the inventory, the original GR untouched
  await expect(page.getByTestId('petro-curve-inventory')).toContainText('GR_DIG');
  await expect(page.getByTestId('petro-curve-inventory')).toContainText('GR_DIG:2');
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

  // PT2: depths follow the export options; feet + TVDSS column
  await page.getByTestId('petro-export-unit').click();
  await page.getByTestId('petro-export-col-tvdss').check();
  await expect(page.getByTestId('petro-export-depth-note')).toContainText('TVDSS uses KB');
  const ftCsv = await grab('petro-export-csv');
  const ftText = fs.readFileSync(await ftCsv.path(), 'utf8');
  expect(ftText.split('\n')[0].split(',').slice(0, 2)).toEqual(['DEPT (F)', 'TVDSS (F)']);
  await page.getByTestId('petro-export-unit').click();
  await page.getByTestId('petro-export-col-tvdss').uncheck();
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

test('PS7: histogram cutoff drag writes parameters; twin-well overlay fits identity normalization', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  await page.getByTestId('petro-view-histogram').click();
  const canvas = page.getByTestId('petro-histogram-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('petro-hist-pcts')).toContainText('P50');

  // drag the GR clean line from the left edge to 25% across the plot:
  // the type well's GR spans exactly 20..120 API, so the committed
  // value is 20 + 0.25*100 = 45
  const box = await canvas.boundingBox();
  const M = { l: 46, r: 44 }; // HistogramChart margins
  const plotW = box.width - M.l - M.r;
  const midY = box.y + box.height / 2;
  await page.mouse.move(box.x + M.l, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + M.l + plotW * 0.25, midY, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('petro-param-grClean')).toHaveValue('45');
  await expect(page.getByTestId('petro-status')).toContainText('grClean = 45');

  // overlay the org-shared twin (same analytic curves) and fit the
  // normalization: an identical well must fit the identity
  await page.getByTestId('petro-hist-overlay-AKOMA-2 (org shared)').check();
  await page.getByTestId('petro-hist-norm-target').selectOption({ index: 1 });
  await page.getByTestId('petro-hist-fit').click();
  await expect(page.getByTestId('petro-hist-fit-result')).toContainText('shift 0.000');
  await expect(page.getByTestId('petro-hist-fit-result')).toContainText('scale 1.0000');
});

test('PS8: conditioning saves a _CND curve; the explorer picker swaps it in explicitly', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // no picker while GR has a single candidate
  await expect(page.getByTestId('petro-pick-GR')).toHaveCount(0);

  await page.getByTestId('petro-condition').click();
  await expect(page.getByTestId('petro-cond-dialog')).toBeVisible();
  await page.getByTestId('petro-cond-op').selectOption('smooth-mean');
  await expect(page.getByTestId('petro-cond-preview')).toContainText('samples changed');
  await page.getByTestId('petro-cond-save').click();
  await expect(page.getByTestId('petro-status')).toContainText('Saved GR_CND');

  // the picker appears; choosing GR_CND swaps the input explicitly
  const picker = page.getByTestId('petro-pick-GR');
  await expect(picker).toBeVisible();
  const val = await picker.locator('option', { hasText: 'GR_CND' }).getAttribute('value');
  await picker.selectOption(val);
  await expect(picker).toHaveValue(val);
  // the pipeline still computes on the conditioned input
  await expect(page.getByTestId('petro-missing')).toHaveCount(0);
  await expect(page.getByTestId('petro-zone-net-SAND A')).toBeVisible();
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
  await expect(page.getByTestId('petro-layout-template').locator('option')).toHaveCount(4); // 3 built-ins + the fork (PT6 added Lithology quicklook)

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

test('PS9: field view compares wells side by side with the golden zone summaries', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.getByTestId('petro-view-field').click();
  await expect(page.getByTestId('petro-field')).toBeVisible();

  await page.getByTestId('petro-field-pick-KETA TYPE-1').check();
  await page.getByTestId('petro-field-pick-AKOMA-2 (org shared)').check();
  await expect(page.getByTestId('petro-field-canvas')).toBeVisible();

  // the comparison table matches zones by name: SAND A only on KETA,
  // MAIN only on AKOMA, and KETA's cell carries the golden net pay
  const sandA = page.getByTestId('petro-field-zone-SAND A');
  await expect(sandA).toBeVisible();
  await expect(sandA).toContainText(`net ${goldenNet('SAND_A')} m`);
  await expect(sandA).toContainText('—');
  await expect(page.getByTestId('petro-field-zone-MAIN')).toContainText('net');

  // flatten on a top only KETA carries; the view survives (AKOMA draws
  // unflattened and flagged on the canvas)
  await page.getByTestId('petro-field-datum').selectOption({ label: 'Flatten on Top Sand A' });
  await expect(page.getByTestId('petro-field-canvas')).toBeVisible();
});

test('PS10: Hingle fit recovers Rw; split view brushes selection; TVD toggle; zone edge drag', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();

  // Hingle water-leg fit lands the construction Rw exactly
  await page.getByTestId('petro-view-crossplot').click();
  await page.getByTestId('petro-plot-hingle').click();
  await page.getByTestId('petro-hingle-top').fill('2075');
  await page.getByTestId('petro-hingle-base').fill('2078');
  await page.getByTestId('petro-hingle-fit').click();
  await expect(page.getByTestId('petro-hingle-result')).toContainText('Rw = 0.050000');
  await page.getByTestId('petro-param-rw').fill('0.06'); // distort, then apply the fit back
  await page.getByTestId('petro-hingle-apply').click();
  await expect(page.getByTestId('petro-param-rw')).toHaveValue('0.05');

  // split view: brush a selection polygon on the crossplot, ticks land
  // on the tracks side (both canvases visible at once)
  await page.getByTestId('petro-view-split').click();
  await expect(page.getByTestId('petro-split')).toBeVisible();
  await expect(page.getByTestId('petro-tracks-canvas')).toBeVisible();
  const cp = page.getByTestId('petro-crossplot-canvas');
  await expect(cp).toBeVisible();
  await page.getByTestId('petro-select-start').click();
  const box = await cp.boundingBox();
  const M = { l: 52, r: 12, t: 12, b: 34 };
  const pw = box.width - M.l - M.r;
  const ph = box.height - M.t - M.b;
  const click = (fx, fy) => page.mouse.click(box.x + M.l + fx * pw, box.y + M.t + fy * ph);
  await click(0.05, 0.05);
  await click(0.95, 0.05);
  await click(0.95, 0.95);
  await click(0.05, 0.95);
  await page.getByTestId('petro-select-apply').click();
  await expect(page.getByTestId('petro-status')).toContainText('Selected');
  await expect(page.getByTestId('petro-select-clear')).toBeVisible();
  await page.getByTestId('petro-select-clear').click();

  // TVD axis labels toggle (KETA carries a deviation survey)
  await page.getByTestId('petro-view-tracks').click();
  await expect(page.getByTestId('petro-depth-mode')).toContainText('axis: MD');
  await page.getByTestId('petro-depth-mode').click();
  await expect(page.getByTestId('petro-depth-mode')).toContainText('axis: TVD');
  await page.getByTestId('petro-depth-mode').click();

  // drag SAND A's base edge from 2030 to ~2040: the zone card updates
  const tc = page.getByTestId('petro-tracks-canvas');
  const tb = await tc.boundingBox();
  const plotTop = 52;
  const plotH = tb.height - plotTop - 4;
  const yOf = (d) => tb.y + plotTop + ((d - 2000) / 100) * plotH;
  await page.mouse.move(tb.x + tb.width / 2, yOf(2030));
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, yOf(2040), { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('petro-status')).toContainText('Moved SAND A base');
  await expect(page.locator('[data-zone-name="SAND A"]')).toContainText('2040');
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

test('PT1: an own well offers the Edit well data link into Well Data Manager on its checkshots tab', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  const link = page.getByTestId('petro-edit-well-data');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /\/dev\/well-data-manager\?well=.+&tab=checkshots/);
  // shared wells are read-only: no link
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.getByTestId('petro-edit-well-data')).toHaveCount(0);
});

test('PT3: pick, rename, hide, drag and delete a top; shared wells stay read-only', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  const canvas = page.getByTestId('petro-tracks-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const plotTop = 52;
  const plotH = box.height - plotTop - 4;
  const yOf = (d) => box.y + plotTop + ((d - 2000) / 100) * plotH;

  // pick a top mid-plot at 2065 m
  await page.getByTestId('petro-top-pick').click();
  await page.mouse.click(box.x + box.width / 2, yOf(2065));
  await page.getByTestId('petro-top-name').fill('Top Sand C');
  await page.getByTestId('petro-top-confirm').click();
  await expect(page.getByTestId('petro-top-md-Top Sand C')).toContainText('2065');
  await expect(page.getByTestId('petro-status')).toContainText('Added top Top Sand C');
  // finish picking
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('petro-tracks')).toHaveAttribute('data-pick-mode', '');

  // rename inline
  await page.getByTestId('petro-top-rename-Top Sand C').click();
  await page.getByTestId('petro-top-rename-input').fill('Top Sand C2');
  await page.getByTestId('petro-top-rename-input').press('Enter');
  await expect(page.getByTestId('petro-top-row-Top Sand C2')).toBeVisible();

  // drag the tag at the right edge from 2065 to 2075
  await page.mouse.move(box.x + box.width - 30, yOf(2065));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 30, yOf(2070));
  await page.mouse.move(box.x + box.width - 30, yOf(2075));
  await page.mouse.up();
  await expect(page.getByTestId('petro-top-md-Top Sand C2')).toContainText('2075');

  // hide it, then delete it
  await page.getByTestId('petro-top-visible-Top Sand C2').uncheck();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('petro-top-delete-Top Sand C2').click();
  await expect(page.getByTestId('petro-top-row-Top Sand C2')).toHaveCount(0);

  // the org-shared well is read-only: no pick button, footer says so
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.getByTestId('petro-tops')).toContainText('read-only');
  await expect(page.getByTestId('petro-top-pick')).toHaveCount(0);
});

test('PT4: zones between tops, bulk creation, and a two-click pick on the track', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  const canvas = page.getByTestId('petro-tracks-canvas');
  await expect(canvas).toBeVisible();

  // between two named tops
  await page.getByTestId('petro-zone-mode-tops').click();
  await page.getByTestId('petro-zone-from-top').selectOption({ label: 'Top Sand A 2010.0 m' });
  await page.getByTestId('petro-zone-to-top').selectOption({ label: 'Top Shale 2030.0 m' });
  await expect(page.getByTestId('petro-zone-name')).toHaveValue('Top Sand A');
  await page.getByTestId('petro-zone-add-from-tops').click();
  const card = page.locator('[data-testid="petro-zone-card"][data-zone-name="Top Sand A"]');
  await expect(card).toContainText('2010.0');
  await expect(card).toContainText('2030.0');

  // bulk: only the Top Shale -> Top Sand B pair is new (Top Sand A now exists)
  await page.getByTestId('petro-zone-fill-between-tops').click();
  await expect(page.getByTestId('petro-status')).toContainText('Created 1 zone');
  await expect(page.locator('[data-testid="petro-zone-card"][data-zone-name="Top Shale"]')).toBeVisible();

  // two-click pick: 2060 to 2080, default name is the nearest top above (Top Sand B)
  const box = await canvas.boundingBox();
  const plotTop = 52;
  const plotH = box.height - plotTop - 4;
  const yOf = (d) => box.y + plotTop + ((d - 2000) / 100) * plotH;
  await page.getByTestId('petro-zone-mode-pick').click();
  await page.getByTestId('petro-zone-pick').click();
  await page.mouse.click(box.x + box.width * 0.4, yOf(2060));
  await page.mouse.click(box.x + box.width * 0.4, yOf(2080));
  await expect(page.getByTestId('petro-zone-pick-name')).toHaveValue('Top Sand B');
  await page.getByTestId('petro-zone-pick-name').fill('Picked');
  await page.getByTestId('petro-zone-pick-confirm').click();
  const picked = page.locator('[data-testid="petro-zone-card"][data-zone-name="Picked"]');
  await expect(picked).toContainText('2060.0');
  await expect(picked).toContainText('2080.0');
  await expect(page.getByTestId('petro-tracks')).toHaveAttribute('data-pick-mode', '');
});

test('PT5-prep: a zone typed in feet converts to metres and reads back in the chosen unit', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-tracks-canvas')).toBeVisible();
  await page.getByTestId('petro-depth-unit').click();
  await expect(page.getByTestId('petro-depth-unit')).toContainText('ft');
  await page.getByTestId('petro-zone-name').fill('FEET');
  await page.getByTestId('petro-zone-top').fill('6726');   // 2050.1 m
  await page.getByTestId('petro-zone-base').fill('6823.5');  // 2079.8 m
  await page.getByTestId('petro-zone-add').click();
  const card = page.locator('[data-testid="petro-zone-card"][data-zone-name="FEET"]');
  await expect(card).toContainText('6726.0');
  await expect(card).toContainText('ft');
  await page.getByTestId('petro-depth-unit').click();
  await expect(card).toContainText('2050.1');
  await expect(card).toContainText('2079.8');
});

test('PT5: the depth navigator scrolls, rescales and refits the track window', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-tracks-canvas')).toBeVisible();
  const nav = page.getByTestId('petro-depth-nav');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute('data-view-top', '2000.0');
  await expect(nav).toHaveAttribute('data-view-base', '2100.0');
  const nb = await nav.boundingBox();
  const plotTop = 52;
  const plotH = nb.height - plotTop - 4;
  const yOf = (d) => nb.y + plotTop + ((d - 2000) / 100) * plotH;
  const cx = nb.x + nb.width / 2;

  // zoom in with the wheel on the track, then scroll the band down
  const canvas = page.getByTestId('petro-tracks-canvas');
  const cb = await canvas.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 52 + (cb.height - 56) * 0.3);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await nav.getAttribute('data-view-base')) - Number(await nav.getAttribute('data-view-top'))).toBeLessThan(100);
  const top1 = Number(await nav.getAttribute('data-view-top'));
  const base1 = Number(await nav.getAttribute('data-view-base'));
  const mid = (top1 + base1) / 2;
  await page.mouse.move(cx, yOf(mid));
  await page.mouse.down();
  await page.mouse.move(cx, yOf(mid + 10));
  await page.mouse.move(cx, yOf(mid + 20));
  await page.mouse.up();
  const top2 = Number(await nav.getAttribute('data-view-top'));
  expect(top2).toBeGreaterThan(top1 + 5);
  expect(Number(await nav.getAttribute('data-view-base')) - top2).toBeCloseTo(base1 - top1, 0);

  // stretch: drag the top handle up, the span grows and the base stays
  const base2 = Number(await nav.getAttribute('data-view-base'));
  await page.mouse.move(cx, yOf(top2));
  await page.mouse.down();
  await page.mouse.move(cx, yOf(top2 - 5));
  await page.mouse.move(cx, yOf(top2 - 10));
  await page.mouse.up();
  const top3 = Number(await nav.getAttribute('data-view-top'));
  expect(top3).toBeLessThan(top2 - 5);
  expect(Number(await nav.getAttribute('data-view-base'))).toBeCloseTo(base2, 0);

  // double-click refits the whole well
  await page.getByTestId('petro-depth-nav-canvas').dblclick();
  await expect(nav).toHaveAttribute('data-view-top', '2000.0');
  await expect(nav).toHaveAttribute('data-view-base', '2100.0');
});

test('PT6: the lithology quicklook paints a GR ramp and a two-colour cut-off; editing a fill colour forks the built-in', async ({ page }) => {
  await page.goto('/dev/petrophysics-studio');
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  const canvas = page.getByTestId('petro-tracks-canvas');
  await expect(canvas).toBeVisible();
  await page.getByTestId('petro-layout-template').selectOption('lithology-quicklook');
  await page.waitForTimeout(400);
  // sample the lithology track (second of four): shale at 2040 m is brownish, clean sand at 2020 m is pale
  const rgbAt = (fx, d) => page.evaluate(([fx, d]) => {
    const c = document.querySelector('[data-testid="petro-tracks-canvas"]');
    const rect = c.getBoundingClientRect();
    const scale = c.width / rect.width;
    const plotTop = 52;
    const plotH = rect.height - plotTop - 4;
    const x = Math.round((56 + (rect.width - 56) * fx) * scale);
    const y = Math.round((plotTop + ((d - 2000) / 100) * plotH) * scale);
    return Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
  }, [fx, d]);
  // track widths 1 : 0.6 : 1 : 1.2 -> the lithology track spans 26% to 42% of the plot; sample its middle
  const shale = await rgbAt(0.34, 2040);
  const sand = await rgbAt(0.34, 2020);
  expect(shale[0]).toBeGreaterThan(shale[2]);          // brown: red above blue
  expect(shale[0]).toBeLessThan(200);
  expect(sand[0]).toBeGreaterThan(220);                // pale yellow
  expect(sand[2]).toBeLessThan(215);
  // the GR track's cut-off fill: sand side yellowish at 2020, shale side gray at 2040
  const grSand = await rgbAt(0.05, 2020);
  const grShale = await rgbAt(0.05, 2040);
  expect(grSand[2]).toBeLessThan(grSand[0]);
  expect(Math.abs(grShale[0] - grShale[2])).toBeLessThan(25);
  // change the cut-off colour: the built-in forks
  await page.getByTestId('petro-layout-expand-GR (API)').click();
  await page.getByTestId('petro-layout-fill-color-0').fill('#ff0000');
  await expect(page.getByTestId('petro-layout-template')).toContainText('(edited)');
  await expect(page.getByTestId('petro-layout-template').locator('option')).toHaveCount(4);
});
