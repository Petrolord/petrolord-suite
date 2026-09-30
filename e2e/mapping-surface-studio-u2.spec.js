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
