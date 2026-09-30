// AppUpgrade Step 1 for Stratigraphy Studio (docs/upgrade/StratigraphyStudio-UPGRADE.md):
// the practitioner-lens checks that need a real browser, on the /dev harness.
// The evidence kit lives in e2e/fixtures/strat (hostile files, saved strat
// projects) and e2e/fixtures/wc (hostile wells, saved sections of each
// release); they reach the harness through window.__STRAT_SEED__.
//   PL2  hostile interval, zone scheme and column files; core images the door refuses
//   PL3  tract bands in TVDSS sit KB below their MD; hostile wells in the section
//   PL5  strat projects from ST2 and T1, one naming gone refs, one from a newer build;
//        Well Correlation's saved sections of each release open here
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: no page scroll, charts on
//        white chart paper with the watermark, the age-depth depth axis runs downward
//   PL7  the Wheeler SVG and PNG read back with their header
//   PL9  Send to Basin lands in Basin & Charge Modeling's store
//   PL10 30 typed wells: section and Wheeler; an 84-unit column
// SHOTS=<dir> saves screenshots for the review.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOSTILE = path.join(here, 'fixtures', 'strat', 'hostile');
const SAVED = path.join(here, 'fixtures', 'strat', 'saved');
const WC = path.join(here, 'fixtures', 'wc');
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const json = (dir, f) => JSON.parse(read(dir, f));
const SHOTS = process.env.SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `strat-u1-${name}.png`) }); };

async function open(page, { seed = null, query = '' } = {}) {
  await page.addInitScript((s) => {
    window.__STRAT_SEED__ = s || undefined;
    try { window.localStorage.removeItem('strat.scheme'); window.localStorage.removeItem('strat.zoneSchemes'); } catch (e) { /* ignore */ }
  }, seed);
  await page.goto(`/dev/stratigraphy-studio${query}`);
  await expect(page.getByTestId('strat-view-column')).toBeVisible({ timeout: 60000 });
}
const status = (page) => page.getByTestId('strat-status');

test('PL2: hostile interval files: TVDSS refused with the reason, "Top (ft)" read in feet', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-view-intervals').click();
  await page.getByTestId('strat-well-KETA-1').click();
  await expect(page.getByTestId('strat-intervals-editor')).toBeVisible();
  await page.getByTestId('strat-intervals-paste-toggle').click();
  await page.getByTestId('strat-intervals-paste-paste-text').fill(read(HOSTILE, 'intervals_petrel_tvdss.csv'));
  await page.getByTestId('strat-intervals-save').click();
  await expect(status(page)).toContainText('"Top TVDSS (m)" is a TVDSS depth');
  await page.getByTestId('strat-intervals-paste-paste-text').fill(read(HOSTILE, 'intervals_feet_header.tsv'));
  await expect(page.getByTestId('strat-intervals-paste-mdunit')).toHaveValue('ft');
  await page.getByTestId('strat-intervals-save').click();
  await expect(status(page)).toHaveText('2 lithology intervals saved on KETA-1.');
  // STRAT-U2-004: cells show two decimals in the display unit (metres here); the stored metres are unchanged
  await expect(page.getByTestId('strat-intervals-top-0')).toHaveValue('1440');
  await shot(page, 'pl2-intervals');
});

test('PL2: zone schemes from vendor files add up; contradicting zones are refused; a column file comes in', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-view-intervals').click();
  await page.getByTestId('strat-well-KETA-1').click();
  const input = page.getByTestId('strat-zone-scheme-file');
  await input.setInputFiles(path.join(HOSTILE, 'zone_scheme_stratabugs_headers.csv'));
  await expect(page.getByTestId('strat-zone-scheme-row-P')).toContainText('1.2 to 3.1 Ma');
  await input.setInputFiles(path.join(HOSTILE, 'zone_scheme_duplicates.csv'));
  await expect(status(page)).toContainText('NN11 appears 2 times with different ages');
  await expect(page.getByTestId('strat-zone-scheme-row-P')).toBeVisible();
  await expect(page.getByTestId('strat-zone-scheme-row-NN')).toContainText('1 zone');
  await input.setInputFiles(path.join(HOSTILE, 'zone_scheme_ka.csv'));
  await expect(page.getByTestId('strat-zone-scheme-row-MIS')).toContainText('0.116 to 0.191 Ma');
  await shot(page, 'pl2-schemes');

  await page.getByTestId('strat-view-column').click();
  await page.getByTestId('strat-column-import').setInputFiles(path.join(HOSTILE, 'column_spreadsheet_ka.tsv'));
  await expect(status(page)).toContainText('Read 3 units from column_spreadsheet_ka.tsv');
  await expect(status(page)).toContainText('Benin Sands and Qua Iboe Shale overlap in age');
  await page.getByTestId('strat-column-save').click();
  await expect(status(page)).toHaveText('Column saved (3 added, 0 changed, 0 removed).');
  await expect(page.getByTestId('strat-explorer-unit-Qua Iboe Shale')).toBeVisible();
});

test('PL2: core images the door cannot store are refused with the reason', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-view-core').click();
  await page.getByTestId('strat-well-KETA-1').click();
  for (const f of ['core_photo.tif', 'core_photo.heic']) {
    await page.getByTestId('strat-core-file').setInputFiles(path.join(HOSTILE, f));
    await page.getByTestId('strat-core-top').fill('1500');
    await page.getByTestId('strat-core-base').fill('1509');
    await page.getByTestId('strat-core-upload').click();
    await expect(status(page)).toContainText('core photos must be JPEG, PNG or WebP');
  }
});

test('PL1/PL3: tracts pair across formation tops and sit KB below their MD in TVDSS', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-view-section').click();
  const sec = page.getByTestId('corr-section');
  await expect(page.getByTestId('strat-section-summary')).toContainText('3 wells');
  await expect(page.getByTestId('strat-section-summary')).toContainText('2 tracts');
  await expect(sec).toHaveAttribute('data-band-spans', /KETA-1:1440\.0-1580\.0/);
  await page.getByTestId('strat-depth-ref').selectOption('tvdss');
  await expect(sec).toHaveAttribute('data-band-spans', /KETA-1:1410\.0-1550\.0/);
  await shot(page, 'pl3-tvdss');
  await page.getByTestId('strat-datum-mode').selectOption('flatten');
  await expect(page.getByTestId('strat-section-controls')).toHaveAttribute('data-datum', /"datumM":1410/);
});

test('PL3: hostile wells (US feet, UTM, no KB, no survey) draw in the studio section', async ({ page }) => {
  const wells = json(path.join(WC, 'hostile'), 'wells.json');
  const ids = wells.map((w) => w.id);
  await open(page, { seed: { wells, sections: [{ id: 'hs', name: 'Hostile', well_ids: ids, datum: { mode: 'structural' }, track_layout: { depthRef: 'tvdss' } }] }, query: '?sample=0' });
  await page.getByTestId('strat-view-section').click();
  await expect(page.getByTestId('strat-section-summary')).toContainText(`${ids.length} wells`);
  const notes = await page.getByTestId('corr-section').getAttribute('data-well-notes');
  expect(notes).toContain('no KB: TVDSS = TVD');
  expect(notes).toContain('stored bottom-up: read top-down');
});

test('PL5: strat projects of each release open; gone refs and a newer build say so', async ({ page, context }) => {
  for (const f of ['project-st2-2026-09-06.json', 'project-t1-2026-09-26.json']) {
    const p = await context.newPage();
    await open(p, { seed: { project: json(SAVED, f) } });
    await p.getByTestId('strat-view-section').click();
    await expect(p.getByTestId('strat-section-summary')).toContainText('3 wells');
    const mode = json(SAVED, f).flatten.mode;
    await expect(p.getByTestId('corr-section')).toHaveAttribute('data-datum-mode', mode);
    await p.close();
  }
  const g = await context.newPage();
  await open(g, { seed: { project: json(SAVED, 'project-gone-refs.json') } });
  await g.getByTestId('strat-view-section').click();
  await expect(g.getByTestId('strat-status')).toContainText('its ghost curve names a well no longer in the section');
  await expect(g.getByTestId('strat-status')).toContainText('"Top Chalk"');
  await g.close();
  await open(page, { seed: { project: json(SAVED, 'project-newer-build.json') } });
  await expect(status(page)).toContainText('Your saved stratigraphy view was not opened');
  await page.getByTestId('strat-view-section').click();
  await page.getByTestId('strat-save-view').click();
  await expect(status(page)).not.toHaveText('Stratigraphy view saved.');
});

test('PL5: Well Correlation sections of each release open in the studio, the named one is picked', async ({ page }) => {
  const rows = ['section-g3-2026-07-13.json', 'section-wc2-2026-09-03.json', 'section-st2-2026-09-06.json', 'section-missing-well.json']
    .map((f, i) => ({ ...json(path.join(WC, 'saved'), f), id: `sec-${i}`, name: f.replace('.json', '') }));
  await open(page, { seed: { sections: rows } });
  await page.getByTestId('strat-view-section').click();
  await expect(page.getByTestId('strat-section-pick')).toHaveValue('sec-3');
  await expect(status(page)).toContainText('no longer in your registry');
  for (const r of rows.slice(0, 3)) {
    await page.getByTestId('strat-section-pick').selectOption(r.id);
    await expect(page.getByTestId('strat-section-controls')).toHaveAttribute('data-section-id', r.id);
    await expect(page.getByTestId('corr-section')).toHaveAttribute('data-datum-mode', r.datum.mode || 'structural');
  }
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6: ${w}x${h} ${scheme}: no page scroll, white charts with the watermark, depth down`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('[data-pl-theme="dark"]').first()).toBeAttached();
      }
      for (const v of ['column', 'section', 'wheeler', 'ages']) {
        await page.getByTestId(`strat-view-${v}`).click();
        if (v === 'ages') await page.getByTestId('strat-well-KETA-1').click();
        await page.waitForTimeout(400);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(sw).toBeLessThanOrEqual(1);
        await shot(page, `pl6-${v}-${w}-${scheme}`);
      }
      for (const [v, id] of [['column', 'strat-column-chart'], ['wheeler', 'strat-wheeler-chart'], ['ages', 'strat-agedepth-plot']]) {
        await page.getByTestId(`strat-view-${v}`).click();
        const el = page.getByTestId(id);
        await expect(el).toHaveAttribute('data-canvas', 'chart');
        const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor);
        expect(bg).toBe('rgb(255, 255, 255)');
        await expect(el.getByAltText('Petrolord')).toHaveCount(1);
      }
      // age-depth: the deeper surface plots lower on the page
      const ys = await page.getByTestId('strat-agedepth-plot').evaluate((n) => ['Top Marker', 'Mid Shale', 'Base Sand']
        .map((name) => Number(n.querySelector(`[data-testid="strat-agedepth-point-${name}"] circle`).getAttribute('cy'))));
      expect(ys[0]).toBeLessThan(ys[1]);
      expect(ys[1]).toBeLessThan(ys[2]);
    });
  }
}

test('PL7: the Wheeler exports read back with their header', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-report-analyst').fill('A. Stratigrapher');
  await page.getByTestId('strat-report-field').fill('Keta (sample)');
  await page.getByTestId('strat-view-wheeler').click();
  const [svgDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('strat-wheeler-export-svg').click()]);
  const svg = fs.readFileSync(await svgDl.path(), 'utf8');
  expect(svg).toContain('Wheeler chart: KETA section');
  expect(svg).toContain('Wells: KETA-1, KETA-2, KETA-3 | Section: KETA section | Field: Keta (sample)');
  expect(svg).toContain('Terms: Catuneanu | Timescale: ICS 2026/06');
  expect(svg).toMatch(/Prepared by: A\. Stratigrapher \| \d{4}-\d{2}-\d{2} \| Petrolord Suite/);
  const [pngDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('strat-wheeler-export-png').click()]);
  const png = fs.readFileSync(await pngDl.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const width = png.readUInt32BE(16); const height = png.readUInt32BE(20);
  expect(width).toBeGreaterThanOrEqual(960);
  expect(height).toBeGreaterThan(900); // 2x of the chart plus the four-line header
});

test('PL9: Send to Basin lands in Basin & Charge Modeling', async ({ page }) => {
  await open(page);
  await page.getByTestId('strat-view-ages').click();
  await page.getByTestId('strat-well-KETA-2').click();
  await page.getByTestId('strat-send-basin').click();
  await expect(status(page)).toContainText('Basin model "KETA-2 stratigraphy" created');
  const stored = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('bf.dev.wells.v1') || '[]'));
  const row = stored.find((r) => r.name === 'KETA-2 stratigraphy');
  expect(row).toBeTruthy();
  const mid = row.stratigraphy.find((l) => l.name === 'Mid Shale');
  expect(mid.provenance.thickness_basis).toBe('tvd');
  expect(mid.thickness).toBeLessThan(95);
});

test('PL10: 30 typed wells: section and Wheeler; an 84-unit column', async ({ page }) => {
  await open(page, { query: '?scaleWells=30&sample=0&scaleUnits=1' });
  let t0 = Date.now();
  await page.getByTestId('strat-view-section').click();
  await expect(page.getByTestId('strat-section-summary')).toContainText('30 wells', { timeout: 120000 });
  const sectionMs = Date.now() - t0;
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-col-fixed-w', '140');
  t0 = Date.now();
  await page.getByTestId('strat-view-wheeler').click();
  await expect(page.getByTestId('strat-wheeler-chart')).toHaveAttribute('data-cell-count', /\d+/);
  const wheelerMs = Date.now() - t0;
  const cells = Number(await page.getByTestId('strat-wheeler-chart').getAttribute('data-cell-count'));
  expect(cells).toBeGreaterThanOrEqual(30 * 4);
  await shot(page, 'pl10-wheeler');
  t0 = Date.now();
  await page.getByTestId('strat-view-column').click();
  await expect(page.getByTestId(/^strat-unit-row-/)).toHaveCount(84);
  const columnMs = Date.now() - t0;
  console.log(`PL10 timings: section 30 wells ${sectionMs} ms, Wheeler ${wheelerMs} ms (${cells} cells), column 84 units ${columnMs} ms`);
});
