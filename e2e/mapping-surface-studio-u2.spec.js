// Mapping & Surface Studio upgrade Step 2 (MAP-U2, 2026-09-30) in a real
// browser: fault polygon files as fault blocks with the spline in tension
// and kriging (U2-001, U2-004), the PDF plotted to scale read back with
// pdftotext (U2-002), and the later items appended below.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const HOSTILE = path.join(process.cwd(), 'e2e/fixtures/map/hostile');
const geo = JSON.parse(fs.readFileSync(path.join(HOSTILE, 'fault_polygons_two.geojson'), 'utf8'));
// the two-fault file as the culture import stores it (a geo_culture row and its features)
const FAULT_FILE = {
  row: { id: 'cult-faults', name: 'Petrel faults', kind: 'fault_polygon' },
  features: geo.features.map((f) => ({ type: 'polygon', rings: f.geometry.coordinates, props: f.properties })),
};
const seed = (page, s) => page.addInitScript((x) => { window.__MAP_SEED__ = x; }, s);
const errorsOf = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(e.message)); return errs; };
const pdfText = (file, args = ['-layout']) => execFileSync('pdftotext', [...args, file, '-'], { encoding: 'utf8' });

test('MAP-U2-001/004: a two-fault polygon file makes two fault blocks for the spline in tension and for kriging', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page, { culture: [FAULT_FILE] });
  await page.goto('/dev/mapping-surface-studio?scaleWells=80');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-cell').fill('150');
  await page.getByTestId('map-fault-use-Petrel faults').check();
  await page.getByTestId('map-grid-method').selectOption('tension');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 120000 });
  await expect(page.getByTestId('map-status')).toContainText('2 fault-block polygons');
  await expect(page.getByTestId('map-status')).not.toContainText('in this version');
  await page.getByTestId('map-grid-method').selectOption('kriging');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('2 fault-block polygons', { timeout: 120000 });
  await expect(page.getByTestId('map-status')).toContainText('Gridded');
  expect(errs).toEqual([]);
});

test('MAP-U2-002: the PDF is plotted to scale and carries the reviewer header', async ({ page }, info) => {
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 120000 });
  await page.getByTestId('map-report-field').fill('Keta');
  await page.getByTestId('map-report-analyst').fill('Ada Mapper');
  await page.getByTestId('map-pdf-paper').selectOption('A4');
  // a scale that does not fit is refused with one that does
  await page.getByTestId('map-pdf-scale').fill('2000');
  await page.getByTestId('map-export-pdf').click();
  await expect(page.getByTestId('map-status')).toContainText('At 1:2,000 the map needs');
  await page.getByTestId('map-pdf-scale').fill('');
  const dl = page.waitForEvent('download');
  await page.getByTestId('map-export-pdf').click();
  const d = await dl;
  const file = info.outputPath(d.suggestedFilename());
  await d.saveAs(file);
  expect(d.suggestedFilename()).toMatch(/-A4-1_\d+\.pdf$/);
  const scale = Number(d.suggestedFilename().match(/1_(\d+)\.pdf$/)[1]);
  const text = pdfText(file);
  expect(text).toContain(`Scale 1:${scale.toLocaleString('en-US')} on A4 landscape`);
  expect(text).toMatch(/Well top Top Dome from \d+ control points, TVDSS at the borehole/);
  expect(text).toMatch(/Field Keta · Analyst Ada Mapper/);
  expect(text).toContain('KETA-1');
  expect(text).toContain('Grid north');
  // the easting labels are printed gridStep x 1000 / N mm apart
  const words = [...pdfText(file, ['-bbox']).matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">(\d{1,3}(?:,\d{3})+)<\/word>/g)]
    .map((m) => ({ x: (Number(m[1]) + Number(m[3])) / 2, y: Math.round(Number(m[2])), v: Number(m[4].replace(/,/g, '')) }));
  const rows = new Map();
  for (const w of words) rows.set(w.y, [...(rows.get(w.y) || []), w]);
  const east = [...rows.values()].sort((a, b) => b.length - a.length)[0].sort((a, b) => a.x - b.x);
  expect(east.length).toBeGreaterThanOrEqual(3);
  const mm = ((east[1].x - east[0].x) * 25.4) / 72;
  expect(mm).toBeCloseTo(((east[1].v - east[0].v) * 1000) / scale, 0);
  await expect(page.getByTestId('map-status')).toContainText('Print at 100%');
});

test('MAP-U2-005: a gas-oil contact splits the closure into gas cap and oil leg', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-grid-method').selectOption('tension');
  await page.getByTestId('map-extent').selectOption('beyond');
  await page.getByTestId('map-extent-distance').fill('1500');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 120000 });
  await page.getByTestId('map-grv-contact').fill('-5100');
  await page.getByTestId('map-grv-goc').fill('-4950');
  await page.getByTestId('map-grv-run').click();
  await expect(page.getByTestId('map-grv-result')).toContainText('Gas cap');
  await expect(page.getByTestId('map-grv-result')).toContainText('oil leg');
  const row = page.getByTestId('map-grv-split-all');
  await expect(row).toBeVisible();
  const cells = (await row.locator('td').allTextContents()).map(Number);
  expect(cells[1] + cells[2]).toBeCloseTo(cells[3], 1);
  // a GOC below the OWC is refused
  await page.getByTestId('map-grv-goc').fill('-5300');
  await page.getByTestId('map-grv-run').click();
  await expect(page.getByTestId('map-status')).toContainText('must be above (shallower than) the oil-water contact');
});

test('MAP-U2-003: a horizon on a rotated survey lattice grids from the file and publishes', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-cell').fill('100');
  await page.getByTestId('map-import').click();
  await page.getByTestId('map-import-file').setInputFiles(path.join(HOSTILE, 'xyz_rotated_survey_lattice.xyz'));
  await expect(page.getByTestId('map-import-preview')).toContainText('Points (not a regular grid)');
  await expect(page.getByTestId('map-import-run')).toHaveText(/Grid these points/);
  await page.getByTestId('map-import-name').fill('Lattice horizon');
  await page.getByTestId('map-import-unit').selectOption('m');
  await page.getByTestId('map-import-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded Lattice horizon (TVDSS elevation', { timeout: 120000 });
  await expect(page.getByTestId('map-status')).toContainText('points from xyz_rotated_survey_lattice.xyz');
  await page.getByTestId('map-publish').click();
  await expect(page.locator('[data-testid="map-surface-row"][data-surface-name="Lattice horizon"]')).toBeVisible();
  expect(errs).toEqual([]);
});

async function screenOf(canvas, wx, wy) {
  const scale = Number(await canvas.getAttribute('data-scale'));
  const cx = Number(await canvas.getAttribute('data-cx'));
  const cy = Number(await canvas.getAttribute('data-cy'));
  const vw = Number(await canvas.getAttribute('data-vw'));
  const vh = Number(await canvas.getAttribute('data-vh'));
  return { x: vw / 2 + (wx - cx) * scale, y: vh / 2 - (wy - cy) * scale };
}

test('MAP-U2-013: a section line shows the surfaces and the wells along it, with its vertical exaggeration', async ({ page }) => {
  const errs = errorsOf(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 120000 });
  await page.getByTestId('map-section-draw').click();
  const canvas = page.getByTestId('map-canvas');
  for (const [wx, wy] of [[500900, 6700200], [503600, 6700400]]) await canvas.click({ position: await screenOf(canvas, wx, wy) });
  await expect(page.getByTestId('map-section-count')).toHaveText('2');
  await page.getByTestId('map-section-run').click();
  await expect(page.getByTestId('map-section-chart')).toBeVisible();
  await expect(page.getByTestId('map-section-note')).toContainText(/Section 2\.\d\d km long; \d wells? within 500 m posted/);
  await expect(page.getByTestId('map-section-note')).toContainText('Vertical exaggeration about');
  // the chart draws lines (not blank) and names KETA-1 and KETA-3
  expect(await page.getByTestId('map-section-chart').locator('path.recharts-curve').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('map-section-chart')).toContainText('KETA-1');
  await expect(page.getByTestId('map-section-chart')).toContainText('KETA-3');
  expect(errs).toEqual([]);
});
