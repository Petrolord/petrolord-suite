// Wells W1 acceptance (Seismolord-WELLS-PLAN.md): the golden S-shape
// well imports through the REAL WellImport UI — headerless file with
// SHUFFLED columns, so the mapping selects must be driven — and lands
// on the ROTATED fixture's map at the oracle's IL/XL (< 0.1 cell;
// wells.json lattice truth, independently inverted in Python). Also
// proves the checkshot monotonicity domain rule rejects bad tables in
// the UI path.

import { test, expect } from '@playwright/test';

// KETA-S1 exactly as tools/validation/seismolord/wells/gen_wells.py
// builds it: vertical to 50, build 3°/30m to 30° at 350 (azi 90), hold
// to 600, drop back to vertical at 900, vertical to 1200.
const s1Stations = () => {
  const sts = [[0, 0, 90], [50, 0, 90]];
  for (let md = 80; md <= 350; md += 30) sts.push([md, (md - 50) / 10, 90]);
  for (const md of [380, 500, 600]) sts.push([md, 30, 90]);
  for (let md = 630; md <= 900; md += 30) sts.push([md, 30 - (md - 600) / 10, 90]);
  for (const md of [1000, 1100, 1200]) sts.push([md, 0, 90]);
  return sts;
};

// oracle truth for KETA-S1 on dome_rot (wells.json lattice block)
const TRUTH = {
  surface: { il: 4.2615365636088445, xl: 12.928203230275509 },
  td: { il: 0.547888850243346, xl: 22.57654301171705 },
};

test('golden S-shape well imports via mapping UI and lands at the oracle IL/XL on the rotated map', async ({ page }) => {
  await page.goto('/dev/seismolord-wells');
  await expect(page.getByTestId('well-import')).toBeVisible();

  await page.getByTestId('well-import-name').fill('KETA-S1');
  await page.getByTestId('well-import-x').fill('500200');
  await page.getByTestId('well-import-y').fill('6700300');
  await page.getByTestId('well-import-kb').fill('30');

  // headerless, columns deliberately shuffled to (azi, md, inc): the
  // positional defaults are wrong, so the mapping selects must be used
  const csv = s1Stations().map(([md, inc, azi]) => `${azi},${md},${inc}`).join('\n');
  await page.getByTestId('well-import-text').fill(csv);
  await expect(page.getByTestId('well-import-rowcount')).toHaveText('28 rows');
  await page.getByTestId('well-map-md').selectOption('1');
  await page.getByTestId('well-map-inc').selectOption('2');
  await page.getByTestId('well-map-azi').selectOption('0');
  await expect(page.getByTestId('well-import-preview')).toBeVisible();

  await page.getByTestId('well-import-save').click();
  await expect(page.getByTestId('harness-well-count')).toHaveText('1');

  const surf = (await page.getByTestId('harness-well-surface-ilxl').textContent())
    .split(',').map(Number);
  expect(Math.abs(surf[0] - TRUTH.surface.il)).toBeLessThan(0.1);
  expect(Math.abs(surf[1] - TRUTH.surface.xl)).toBeLessThan(0.1);
  const td = (await page.getByTestId('harness-well-td-ilxl').textContent())
    .split(',').map(Number);
  expect(Math.abs(td[0] - TRUTH.td.il)).toBeLessThan(0.1);
  expect(Math.abs(td[1] - TRUTH.td.xl)).toBeLessThan(0.1);
  // the whole chain is float64 — the gate should be nowhere near needed
  expect(Math.abs(surf[0] - TRUTH.surface.il)).toBeLessThan(1e-6);

  // the map canvas gained well ink (WELL_COLORS[0] = #fbbf24 amber)
  const ink = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="map-view"] canvas');
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && d[i] > 200 && d[i + 1] > 140 && d[i + 1] < 220 && d[i + 2] < 90) n += 1;
    }
    return n;
  });
  expect(ink).toBeGreaterThan(30);
});

test('non-monotonic checkshots are rejected in the UI with the domain-rule message', async ({ page }) => {
  await page.goto('/dev/seismolord-wells');
  await page.getByTestId('well-import-name').fill('BAD-CS');
  await page.getByTestId('well-import-x').fill('500100');
  await page.getByTestId('well-import-y').fill('6700100');
  await page.getByTestId('well-import-td').fill('400');

  await page.getByTestId('well-tab-checkshots').click();
  await page.getByTestId('well-import-text').fill('0,0\n50,55\n40,60');
  await page.getByTestId('well-import-save').click();
  await expect(page.getByTestId('well-import-error'))
    .toContainText('checkshots must strictly increase');
  await expect(page.getByTestId('harness-well-count')).toHaveText('0');
});
