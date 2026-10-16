// ZGY import (owner request 2026-10-16) in a real browser, against the
// auth-free /dev/seismolord-workspace harness and its real import dialog:
//  - a compressed (ZFP) ZGY is accepted by the file picker, described (version,
//    storage, the SEG-Y size it is read as), and scanned in the worker with
//    the ZFP WebAssembly decoder loaded from the build: the geometry is the
//    ZGY's own (66 inlines from 1000 step 2, 70 crosslines from 2000 step 4)
//    and the scan shows the 500 ms first sample as 125 empty samples above;
//  - a legacy Petrel compressed ZGY is refused with the re-export advice.
// Run: E2E_BASE_URL=http://127.0.0.1:8373 npx playwright test e2e/seismolord-zgy.spec.js --workers=1

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import process from 'node:process';
import { test, expect } from '@playwright/test';

const FIXTURES = path.join(process.cwd(), 'packages/engines/test-data/seismolord/zgy');
test.use({ launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

function zgyFile(name, as, patch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zgy-e2e-'));
  const bytes = zlib.gunzipSync(fs.readFileSync(path.join(FIXTURES, `${name}.zgy.gz`)));
  if (patch) patch(bytes);
  const file = path.join(dir, as);
  fs.writeFileSync(file, bytes);
  return file;
}

async function openImport(page) {
  await page.goto('/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('sl-start-toggle').click();
  await page.getByTestId('sl-start-go-import').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a compressed ZGY is described and scanned as the SEG-Y it holds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dialog = await openImport(page);
  const input = dialog.locator('input[type="file"][accept*=".zgy"]').first();
  await input.setInputFiles(zgyFile('gen-zfp-snr30', 'legacy_stack.zgy'));
  const note = dialog.getByTestId('sl-import-zgy');
  await expect(note).toBeVisible({ timeout: 30000 });
  await expect(note).toContainText('Petrel ZGY (version 4), stored as float32, compressed');
  await expect(note).toContainText('two-way time in ms');
  await expect(note).toContainText('125 samples above it are kept as nulls');
  // the scan, in the worker, through the ZFP decoder
  await expect(dialog.getByText(/1,000.*1,130|1000.*1130/).first()).toBeVisible({ timeout: 60000 });
  await expect(dialog.getByText(/2,000.*2,276|2000.*2276/).first()).toBeVisible();
  await expect(dialog.getByText(/4,620|4620/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a legacy Petrel compressed ZGY is refused with the re-export advice', async ({ page }) => {
  const dialog = await openImport(page);
  const file = zgyFile('gen-int8', 'old_petrel.zgy', (b) => { b[0] = 0x56; b[1] = 0x43; b[2] = 0x53; b[3] = 0; });
  await dialog.locator('input[type="file"][accept*=".zgy"]').first().setInputFiles(file);
  await expect(dialog.getByText(/old Petrel compression.*export the volume as SEG-Y/)).toBeVisible({ timeout: 30000 });
});
