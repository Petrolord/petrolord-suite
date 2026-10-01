// Earth Modeling upgrade U2 (Step 2 build, 2026-10-01) in a real browser on
// the /dev harness. One test per item where the browser adds evidence jsdom
// cannot give (a real Web Worker, a PDF download, WebGL, layout).
// Run: E2E_BASE_URL=http://127.0.0.1:8400 npx playwright test e2e/earth-modeling-u2.spec.js --workers=1

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, '..', 'test-results', 'em-u2');
fs.mkdirSync(SHOTS, { recursive: true });

const errorsOf = (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return errs;
};

async function stack(page, url = '/dev/earth-modeling', names = ['TopA', 'TopB', 'BaseB']) {
  await page.goto(url);
  await expect(page.getByTestId('em-explorer')).toBeVisible();
  for (const n of names) await page.getByTestId(`em-add-${n}`).click();
}

/** Depth in metres and metric volumes (the harness profile opens on field units). */
async function metric(page) {
  if ((await page.getByTestId('em-depth-unit').textContent()).includes('ft')) await page.getByTestId('em-depth-unit').click();
  await page.getByTestId('em-volume-units').selectOption('metric');
}

async function buildNow(page) {
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-status')).toContainText('Built', { timeout: 60000 });
}

test('U2-004: the build runs on a Web Worker with progress, and Cancel stops a long build', async ({ page }) => {
  const errs = errorsOf(page);
  await stack(page);
  await buildNow(page);
  await expect(page.getByTestId('em-build')).toHaveAttribute('data-build-where', 'worker');
  // a 1 m cell: about 1.1 million nodes, long enough to cancel
  await page.getByTestId('em-method-phi').selectOption('okrige');
  await page.getByTestId('em-frame-cell').fill('1');
  await page.getByTestId('em-build').click();
  await expect(page.getByTestId('em-build-progress')).toBeVisible();
  // the page stays responsive while the worker builds: the map view button answers
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-view-qc')).toHaveClass(/border-pl-primary/);
  await page.getByTestId('em-build-cancel').click();
  await expect(page.getByTestId('em-status')).toContainText('Build cancelled');
  await expect(page.getByTestId('em-build-progress')).toHaveCount(0);
  expect(errs).toEqual([]);
});

for (const [w, h, theme] of [[1366, 768, 'light'], [1440, 900, 'dark']]) {
  test(`U2-003: the model report PDF downloads and reads back (${w}x${h} ${theme})`, async ({ page }) => {
    const errs = errorsOf(page);
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(() => { try { localStorage.setItem('em.report', JSON.stringify({ field: 'Keta', analyst: 'E2E Reviewer' })); } catch { /* private mode */ } });
    await stack(page);
    if (theme === 'dark') await page.getByTestId('theme-toggle').click();
    await metric(page);
    await page.getByTestId('em-owc-0').fill('1580');
    await page.getByTestId('em-bo-0').fill('1.25');
    await buildNow(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('em-report-pdf').click()]);
    const f = path.join(SHOTS, `report-${w}-${theme}.pdf`);
    await dl.saveAs(f);
    const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
    for (const s of ['Model report', 'Keta', 'E2E Reviewer', 'In-place volumes per zone', 'Contacts and FVFs as used', 'OWC 1580.0 m', 'Prepared by (analyst)', 'Reviewed by', 'Map:']) expect(text).toContain(s);
    // the PDF STOIIP equals the QC panel's
    await page.getByTestId('em-view-qc').click();
    const qc = (await page.getByTestId('em-vol-zone-1-total-stoiip').textContent()).trim();
    expect(text).toContain(qc);
    expect(errs).toEqual([]);
  });
}

test('U2-001: a Seismolord fault joins as a polygon per zone top (fixture through the hook)', async ({ page }) => {
  const errs = errorsOf(page);
  await stack(page);
  await metric(page);
  await page.getByTestId('em-frame-cell').fill('10');
  await buildNow(page);
  await expect(page.getByTestId('em-seis-add-F-Time (Seismolord)')).toBeDisabled();
  await page.getByTestId('em-seis-add-F-East 60 (Seismolord)').click();
  await expect(page.getByTestId('em-status')).toContainText('cut with each zone top');
  await buildNow(page);
  await expect(page.getByTestId('em-status')).toContainText('2 blocks');
  await page.getByTestId('em-map-layer').selectOption('blocks');
  await page.screenshot({ path: path.join(SHOTS, 'u2-001-blocks-zone1.png') });
  await page.getByTestId('em-map-zone').selectOption({ index: 1 });
  await page.screenshot({ path: path.join(SHOTS, 'u2-001-blocks-zone2.png') });
  await page.getByTestId('em-view-qc').click();
  await expect(page.getByTestId('em-qc')).toBeVisible();
  expect(errs).toEqual([]);
});

test('U2-009: the zone goes to ReservoirCalc Pro as a prospect and its inputs fill', async ({ page }) => {
  const errs = errorsOf(page);
  await stack(page);
  await metric(page);
  await page.getByTestId('em-owc-0').fill('1580');
  await page.getByTestId('em-bo-0').fill('1.25');
  await buildNow(page);
  await page.getByTestId('em-view-qc').click();
  const emStoiip = Number((await page.getByTestId('em-vol-zone-1-total-stoiip').textContent()).trim()); // 10^6 sm3
  await page.getByTestId('em-send-rcp').click();
  await expect(page).toHaveURL(/\/dev\/reservoircalc-pro\?emProspect=.+&zone=0/);
  const note = page.getByTestId('rcp-em-prospect');
  await expect(note).toBeVisible({ timeout: 30000 });
  await expect(note).toContainText('From Earth Modeling: New model, Zone 1');
  await expect(note).toContainText('keeps the model');
  // ReservoirCalc Pro computes the same STOIIP (its project opens in field units: STB)
  const kpi = page.getByTestId('rcp-stooip');
  await expect(kpi).not.toHaveAttribute('data-value', '', { timeout: 15000 }).catch(async () => {
    await page.getByRole('button', { name: /Recalculate/ }).click();
  });
  await expect(kpi).not.toHaveAttribute('data-value', '', { timeout: 15000 });
  const stb = Number(await kpi.getAttribute('data-value'));
  expect(Math.abs(stb / ((emStoiip * 1e6) / 0.158987294928) - 1)).toBeLessThan(2e-3);
  await page.screenshot({ path: path.join(SHOTS, 'u2-009-rcp.png') });
  expect(errs).toEqual([]);
});

test('U2-010: the volume distribution runs in QC and orders P90 <= P50 <= P10', async ({ page }) => {
  const errs = errorsOf(page);
  await stack(page);
  await metric(page);
  await page.getByTestId('em-method-phi').selectOption('okrige');
  await page.getByTestId('em-owc-0').fill('1580');
  await page.getByTestId('em-bo-0').fill('1.25');
  await buildNow(page);
  await page.getByTestId('em-view-qc').click();
  await page.getByTestId('em-dist-n').fill('200');
  await page.getByTestId('em-dist-run').click();
  await expect(page.getByTestId('em-dist-table')).toBeVisible({ timeout: 60000 });
  const v = async (k) => Number((await page.getByTestId(`em-dist-zone-1-stoiip-${k}`).textContent()).trim());
  const [p90, p50, p10] = [await v('p90'), await v('p50'), await v('p10')];
  expect(p90).toBeLessThanOrEqual(p50);
  expect(p50).toBeLessThanOrEqual(p10);
  expect(p10).toBeGreaterThan(p90);
  expect(errs).toEqual([]);
});
