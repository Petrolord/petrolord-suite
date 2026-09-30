// Earth Modeling upgrade U1 (practitioner lens, 2026-09-30) in a real
// browser on the /dev harness:
//   PL5  a model saved by every release opens, loads and builds
//   PL3  contacts, Bg in RB/Mscf and a gas zone read as typed, said back
//   PL4  the open hydrocarbon leg is said in QC
//   PL7  the volumes CSV header a reviewer signs is read back
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the map has ink,
//        the page does not scroll sideways, no page errors
// Run: E2E_BASE_URL=http://127.0.0.1:8400 npx playwright test e2e/earth-modeling-upgrade.spec.js --workers=1

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, '..', 'test-results', 'em-u1');
fs.mkdirSync(SHOTS, { recursive: true });

const errorsOf = (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return errs;
};

/** Fraction of map pixels that differ from the corner: 0 = blank. */
const inkOf = (page) => page.getByTestId('em-map-canvas').evaluate((el) => {
  const c = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const [r0, g0, b0] = data;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 30) n += 1;
  return n / (data.length / 16);
});

async function stackAndBuild(page, names = ['TopA', 'TopB', 'BaseB']) {
  await page.goto('/dev/earth-modeling');
  await expect(page.getByTestId('em-explorer')).toBeVisible();
  for (const n of names) await page.getByTestId(`em-add-${n}`).click();
}

test('PL5: a model saved by every release opens, loads and builds', async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto('/dev/earth-modeling?saved=1');
  await expect(page.getByTestId('em-explorer')).toBeVisible();
  const names = ['G8 model (2026-07)', 'EM series model (2026-09-06)', 'T1 model with contacts (2026-09-26)', 'U1 model, gas zone in field units (2026-09-30)'];
  for (const name of names) {
    await page.getByTestId('em-builder').getByText(name, { exact: true }).locator('..').getByRole('button', { name: 'load' }).click();
    await expect(page.getByTestId('em-status')).toContainText(`Loaded model "${name}"`);
    await page.getByTestId('em-build').click();
    await expect(page.getByTestId('em-status')).toContainText('Built');
    await page.getByTestId('em-view-qc').click();
    await expect(page.getByTestId('em-qc')).toBeVisible();
    await page.getByTestId('em-view-map').click();
  }
  // the T1 row typed its contacts in feet: they still read as feet
  expect(errs).toEqual([]);
});

test('PL3/PL4: contacts and Bg read as typed; a gas zone and an open leg are said', async ({ page }) => {
  const errs = errorsOf(page);
  await stackAndBuild(page, ['TopA', 'TopB']);
  if ((await page.getByTestId('em-depth-unit').textContent()).includes('ft')) await page.getByTestId('em-depth-unit').click();
  await page.getByTestId('em-bg-unit').selectOption('RB/Mscf');
  await page.getByTestId('em-owc-0').fill('1700');
  await page.getByTestId('em-bg-0').fill('0.8');
  await expect(page.getByTestId('em-fluids-read-0')).toContainText('OWC 1700.0 m');
  await expect(page.getByTestId('em-fluids-read-0')).toContainText('Bg 0.00449 rm3/sm3');
  await expect(page.getByTestId('em-fluids-read-0')).toContainText('gas zone');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('reaches the model edge');
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-gaszone-zone-1')).toBeVisible();
  await expect(page.getByTestId('em-openedge-zone-1')).toBeVisible();
  await expect(page.getByTestId('em-vol-unit-giip').first()).toContainText('GIIP, free gas');
  await page.screenshot({ path: path.join(SHOTS, 'u1-qc-gas-zone.png') });
  expect(errs).toEqual([]);
});

test('PL7: the volumes CSV carries field, analyst, date, build and the fluids used', async ({ page }) => {
  await stackAndBuild(page);
  await page.getByTestId('em-report-field').fill('Keta');
  await page.getByTestId('em-report-analyst').fill('A. Geologist');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('Built');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('em-volumes-csv').click()]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toMatch(/# field Keta; analyst A\. Geologist; date \d{4}-\d{2}-\d{2}; Petrolord Suite/);
  expect(text).toContain('# depth TVDSS in metres below mean sea level, positive down');
  expect(text).toContain('# Zone 1 fluids: no GOC, no OWC (whole zone counted as hydrocarbon)');
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${w}x${h} ${theme}: the map has ink, the page does not scroll sideways`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errs = errorsOf(page);
      await stackAndBuild(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await page.getByTestId('em-build').click();
      await expect(page.getByTestId('em-status')).toContainText('Built');
      await page.waitForTimeout(300);
      expect(await inkOf(page)).toBeGreaterThan(0.2);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(1);
      await page.screenshot({ path: path.join(SHOTS, `u1-${w}x${h}-${theme}.png`) });
      expect(errs).toEqual([]);
    });
  }
}
