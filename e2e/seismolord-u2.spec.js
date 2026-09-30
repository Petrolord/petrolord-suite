// Seismolord upgrade U2 (Step 2 batches) in a real browser, against the
// auth-free /dev/seismolord-u2 harness (synthetic volume, no DB).
// Run: E2E_BASE_URL=http://127.0.0.1:8370 npx playwright test e2e/seismolord-u2.spec.js --workers=1

import fs from 'fs';
import { execFileSync } from 'child_process';
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-']).toString();

async function openHarness(page, vp, theme) {
  await page.setViewportSize(vp);
  await page.addInitScript((t) => {
    try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
  }, theme);
  await page.goto('/dev/seismolord-u2');
  await expect(page.getByTestId('u2-status')).toHaveText('ready', { timeout: 60000 });
}

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  for (const theme of ['light', 'dark']) {
    test(`U2-001 ${vp.width}x${vp.height} ${theme}: section-with-a-well plot carries legend, company and analyst`, async ({ page }, info) => {
      await openHarness(page, vp, theme);
      // no page scroll; the seismic canvas stays dark
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-canvas="dark"]').first()).toBeVisible();

      // negative control: a line with no well refuses the template with the reason
      await page.getByTestId('u2-line-index').fill('5');
      await page.getByTestId('u2-open-plot').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('plot-template').selectOption('section_well');
      await dialog.getByRole('button', { name: /Generate PDF/ }).click();
      await expect(dialog.getByTestId('plot-template-problems')).toContainText('No well is drawn on this line');
      await page.keyboard.press('Escape');

      // the line through the well
      await page.getByTestId('u2-line-index').fill('32');
      await page.waitForTimeout(500);
      await page.getByTestId('u2-open-plot').click();
      await dialog.getByTestId('plot-template').selectOption('section_well');
      await dialog.getByLabel('Company').fill('Lordsway Energy');
      await dialog.getByLabel('Analyst').fill('A. Asaolu');
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        dialog.getByRole('button', { name: /Generate PDF/ }).click(),
      ]);
      expect(dl.suggestedFilename()).toBe('seismolord-u2_synthetic-section-well.pdf');
      const file = info.outputPath('section.pdf');
      await dl.saveAs(file);
      const text = pdfText(file);
      expect(text).toContain('Company: Lordsway Energy');
      expect(text).toContain('Analyst: A. Asaolu');
      expect(text).toContain('Legend');
      expect(text).toContain('Top Reservoir');
      expect(text).toContain('Fault F1');
      expect(text).toContain('OKAN-1');
      expect(text).toContain('Inline 1032');
      // saved per user
      expect(await page.evaluate(() => window.__plotIdentity)).toEqual({ company: 'Lordsway Energy', analyst: 'A. Asaolu' });
      fs.copyFileSync(file, `/tmp/claude-0/seis-upg2/u2-001-${vp.width}-${theme}.pdf`);
    });
  }
}

test('U2-001: map with contours and wells, legend states the contour interval', async ({ page }, info) => {
  await openHarness(page, { width: 1440, height: 900 }, 'light');
  await page.getByTestId('u2-open-plot').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('plot-template').selectOption('map_contours_wells');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /Generate PDF/ }).click(),
  ]);
  const file = info.outputPath('map.pdf');
  await dl.saveAs(file);
  const text = pdfText(file);
  expect(text).toMatch(/Top Reservoir, interval \d/);
  expect(text).toContain('OKAN-1');
  expect(text).toContain('Analyst: Harness Analyst');
});

// U2-002: the seismic backdrop in Well Correlation's section (in-memory
// backend: the synthetic KETA 3D volume under the sample wells)
const gapInk = (page) => page.evaluate(() => {
  const sec = document.querySelector('[data-testid="corr-section"]');
  const c = document.querySelector('[data-testid="corr-section-canvas"]');
  const xs = sec.dataset.colX.split(',').map(Number);
  const ws = sec.dataset.colW.split(',').map(Number);
  const top = Number(sec.dataset.plotTop);
  const h = Number(sec.dataset.plotH);
  const dpr = c.width / c.getBoundingClientRect().width;
  const x = Math.round(((xs[0] + ws[0] + xs[1]) / 2) * dpr);
  const { data } = c.getContext('2d').getImageData(x, Math.round(top * dpr), 1, Math.round(h * dpr));
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - data[i + 2]) > 60) n++;
  return n / (data.length / 4);
});

for (const [vp, theme] of [[{ width: 1366, height: 768 }, 'light'], [{ width: 1440, height: 900 }, 'dark']]) {
  test(`U2-002 ${vp.width}x${vp.height} ${theme}: seismic backdrop between the wells of a TWT section`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript((t) => {
      try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
    }, theme);
    await page.goto('/dev/well-correlation?wells=corr-w1,corr-w2,corr-w3');
    await expect(page.getByTestId('corr-order-count')).toHaveText('3', { timeout: 120000 });
    await page.getByTestId('corr-depth-ref').selectOption('twt');
    const sec = page.getByTestId('corr-section');
    await expect(sec).toHaveAttribute('data-backdrop-spans', '0');
    const before = await gapInk(page);
    await page.getByTestId('corr-backdrop-volume').selectOption({ label: 'KETA 3D' });
    await expect(sec).toHaveAttribute('data-backdrop-spans', '2', { timeout: 60000 });
    await expect(page.getByTestId('corr-status')).toContainText('Seismic backdrop from KETA 3D through 3 wells');
    await expect.poll(() => gapInk(page), { timeout: 30000 }).toBeGreaterThan(0.2);
    expect(before).toBeLessThan(0.02); // negative control: no backdrop, no seismic colour in the gap
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    // flattening hides it and says why
    await page.screenshot({ path: `/tmp/claude-0/seis-upg2/u2-002-${vp.width}-${theme}.png` });
  });
}

// U2-003: a Seismolord fault reaches Earth Modeling through the shared
// reader (in-memory backend: an east-dipping fault over the fixture frame)
for (const [vp, theme] of [[{ width: 1366, height: 768 }, 'dark'], [{ width: 1440, height: 900 }, 'light']]) {
  test(`U2-003 ${vp.width}x${vp.height} ${theme}: Seismolord fault becomes a hanging-wall block in Earth Modeling`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript((t) => {
      try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
    }, theme);
    await page.goto('/dev/earth-modeling');
    await expect(page.getByTestId('em-explorer')).toBeVisible({ timeout: 60000 });
    for (const name of ['TopA', 'TopB', 'BaseB']) await page.getByTestId(`em-add-${name}`).click();
    await page.getByTestId('em-build').click();
    await expect(page.getByTestId('em-status')).toContainText('Built');
    await expect(page.getByTestId('em-seis-row-F-East (Seismolord)')).toBeVisible();
    await page.getByTestId('em-seis-add-F-East (Seismolord)').click();
    await expect(page.getByTestId('em-status')).toContainText('Added the hanging-wall block of F-East (Seismolord) (trace at 1,200 ms TWT in EM fixture 3D)');
    await expect(page.getByTestId('em-seis-add-F-East (Seismolord)')).toBeDisabled();
    await page.getByTestId('em-build').click();
    await expect(page.getByTestId('em-status')).toContainText('2 blocks');
    await page.getByTestId('em-view-qc').click();
    // east of x = 1600: 12 or 13 of 25 columns, all 20 rows
    const east = Number(await page.getByTestId('em-census-1').textContent());
    expect(east).toBeGreaterThanOrEqual(240);
    expect(east).toBeLessThanOrEqual(260);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
  });
}
