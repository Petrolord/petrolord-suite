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

// U2-010: guided two-point tracking in a real browser (the real SliceView picks
// through its view transform; the engine joins the two points)
test('U2-010 1440x900: two guide points picked on the section, the guided pick joins them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/seismolord-u2');
  await expect(page.getByTestId('u2-status')).toHaveText('ready', { timeout: 60000 });
  await page.getByTestId('u2-pick-seed').click();
  const canvas = page.getByTestId('u2-section').locator('canvas').last();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await expect.poll(async () => (await page.getByTestId('u2-guide-points').textContent()).trim().split(' ').length).toBe(2);
  await page.getByTestId('u2-guided').click();
  const txt = await page.getByTestId('u2-guided-result').textContent();
  const m = /^(\d+) traces (\d+)-(\d+)$/.exec(txt.trim());
  expect(m, txt).not.toBeNull();
  expect(Number(m[1])).toBe(Number(m[3]) - Number(m[2]) + 1);
  expect(Number(m[1])).toBeGreaterThan(10);
  await page.screenshot({ path: '/tmp/claude-0/seis-upg2/u2-010.png' });
});

// U2-014: the phase and amplitude mistie table (real crossing measurement and network solve)
test('U2-014 1366x768: phase and amplitude misties per crossing and per line', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/seismolord-u2');
  const box = page.getByTestId('line2d-mistie-character');
  await expect(box).toBeVisible({ timeout: 60000 });
  const rows = box.getByTestId('line2d-crossing-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('L-101 x L-102');
  const cells = await rows.nth(0).locator('td').allTextContents();
  expect(Number(cells[2])).toBeCloseTo(30, 0);
  expect(Number(cells[3])).toBeCloseTo(1.5, 2);
  const lineRows = box.getByTestId('line2d-character-row');
  await expect(lineRows).toHaveCount(3);
  // mean zero: L-101 +3.3, L-102 -26.7, L-103 +23.3
  const rot = await Promise.all([0, 1, 2].map(async (i) => Number((await lineRows.nth(i).locator('td').allTextContents())[1])));
  expect(rot[0] + rot[1] + rot[2]).toBeCloseTo(0, 0);
  expect(rot[1] - rot[0]).toBeCloseTo(-30, 0);
  await expect(box).toContainText(/Phase RMS [\d.]+ deg -> 0\.\d deg/);
  await box.getByTestId('line2d-character-apply').click();
  expect(await page.evaluate(() => window.__mistieApplied.rotationDeg.length)).toBe(3);
  await box.screenshot({ path: '/tmp/claude-0/seis-upg2/u2-014.png' });
});

// U2-013: the well wavelet in the real synthetics window
for (const [vp, theme] of [[{ width: 1366, height: 768 }, 'light'], [{ width: 1440, height: 900 }, 'dark']]) {
  test(`U2-013 ${vp.width}x${vp.height} ${theme}: wavelet extracted from the well, peak and phase shown`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript((t) => {
      try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
    }, theme);
    await page.goto('/dev/seismolord-synthetics');
    await expect(page.getByTestId('synth-well').locator('option[value="w-syn"]')).toHaveCount(1, { timeout: 60000 });
    await page.getByTestId('synth-well').selectOption('w-syn');
    await page.getByTestId('synth-run').click();
    await expect(page.getByTestId('synth-result')).toBeVisible();
    await expect(page.getByTestId('synth-wavelet-info')).toHaveText('ricker wavelet, peak 25.0 Hz, phase 0 deg');
    await page.getByTestId('synth-extract-well').click();
    await expect(page.getByTestId('synth-wavelet-info')).toHaveText(/^well wavelet, peak 2\d\.\d Hz, phase -?\d+ deg, fit (0\.9\d|1\.00)$/);
    await expect(page.getByTestId('synth-canvas')).toBeVisible();
    await page.screenshot({ path: `/tmp/claude-0/seis-upg2/u2-013-${vp.width}-${theme}.png` });
  });
}

// U2-007: fault polygons drawn in the 3D window (WebGL is read through an
// element screenshot, never the drawing buffer)
async function orangeInCube(page, fpoly) {
  await page.goto(`/dev/seismolord-cubeview?dim=64&fpoly=${fpoly}`);
  await expect(page.getByTestId('harness-status')).toHaveAttribute('data-harness-status', 'ready', { timeout: 60000 });
  await page.waitForTimeout(800);
  const png = await page.locator('canvas').first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 70 && data[i + 1] < 160 && data[i + 2] < 90) n++;
    return n;
  }, png.toString('base64'));
}

test('U2-007 1440x900: the fault polygon is drawn on the horizon in the 3D window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const without = await orangeInCube(page, 0);
  const withPoly = await orangeInCube(page, 1);
  await expect(page.getByTestId('harness-fpoly')).toContainText('polygons 1');
  expect(withPoly).toBeGreaterThan(without + 50);
  await page.screenshot({ path: '/tmp/claude-0/seis-upg2/u2-007.png' });
});

// U2-018: the glossary and the first-project walkthrough in the real guide
for (const [vp, theme] of [[{ width: 1366, height: 768 }, 'light'], [{ width: 1440, height: 900 }, 'dark']]) {
  test(`U2-018 ${vp.width}x${vp.height} ${theme}: glossary and first-project walkthrough`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript((t) => {
      try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
    }, theme);
    await page.goto('/dev/seismolord-help');
    await expect(page.locator('#section-first-project')).toContainText('Read the header before you import', { timeout: 60000 });
    await expect(page.locator('#section-glossary')).toContainText('an increase in acoustic impedance downward is a peak');
    await expect(page.locator('#section-glossary')).toContainText('Dix equation');
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    await page.locator('#section-glossary').screenshot({ path: `/tmp/claude-0/seis-upg2/u2-018-${vp.width}-${theme}.png` });
  });
}

// U2-005: a 2D line marker on a 3D inline (2D overlay canvas is readable)
async function magentaOnSection(page, q) {
  await page.goto(`/dev/seismolord-u2${q}`);
  await expect(page.getByTestId('u2-status')).toHaveText('ready', { timeout: 60000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    let n = 0;
    for (const c of document.querySelectorAll('[data-testid="u2-section"] canvas')) {
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 90 && data[i + 1] < 150 && data[i + 2] > 220 && data[i + 3] > 200) n++;
    }
    return n;
  });
}

test('U2-005 1366x768: the 2D line crossing the inline is marked and named', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const without = await magentaOnSection(page, '?lines=0');
  const withLine = await magentaOnSection(page, '');
  expect(without).toBe(0);
  expect(withLine).toBeGreaterThan(100);
  await page.getByTestId('u2-section').screenshot({ path: '/tmp/claude-0/seis-upg2/u2-005.png' });
});
