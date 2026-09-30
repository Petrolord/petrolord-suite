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
