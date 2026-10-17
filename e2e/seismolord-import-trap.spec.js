// Import trap (owner report 2026-10-17), in a real browser against the
// auth-free /dev/seismolord-workspace harness and its real import dialog:
// the owner picked a file, clicked "View it now" (which closed the dialog
// before the import started and dropped the setup), visited another app and
// came back to an empty Seismolord. Now:
//  - before an import starts, the dialog offers "Start import and view now"
//    (held until the CRS is chosen, with the reason) and "Preview without
//    importing";
//  - a preview keeps the setup: the ribbon says "Not imported yet" and
//    Continue reopens the dialog with the same file, scanned again;
//  - leaving for another app and coming back (in-app navigation) finds the
//    chip and the file on screen again; Discard clears the setup.
// Run: E2E_BASE_URL=http://127.0.0.1:8374 npx playwright test e2e/seismolord-import-trap.spec.js --workers=1

import path from 'path';
import process from 'node:process';
import { test, expect } from '@playwright/test';

const HOSTILE = path.join(process.cwd(), 'e2e/fixtures/seis/hostile');
test.use({ launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function openImport(page) {
  await page.goto('/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('sl-start-toggle').click();
  await page.getByTestId('sl-start-go-import').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** In-app navigation (React Router), as the app's own links do: memory survives, unlike page.goto. */
async function navigateInApp(page, to) {
  await page.evaluate((url) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, to);
}

test('a preview keeps the setup; leaving and coming back finds it and the file on screen', async ({ page }) => {
  const dialog = await openImport(page);
  await dialog.locator('input[type="file"][accept*=".sgy"]').first().setInputFiles(path.join(HOSTILE, 'rev1_ieee_clean.sgy'));
  await expect(dialog.getByText('Vertical axis of this file')).toBeVisible({ timeout: 30000 });

  // starting and viewing waits for the CRS, and says why
  const startView = dialog.getByTestId('sl-import-start-view');
  await expect(startView).toBeVisible();
  if (await startView.isDisabled()) {
    await expect(startView).toHaveAttribute('title', /coordinate reference system|CRS/i);
  }

  // preview without importing: the dialog closes, the ribbon says nothing is imported
  await dialog.getByTestId('sl-import-preview').click();
  await expect(dialog).toBeHidden();
  const chip = page.getByTestId('sl-import-draft');
  await expect(chip).toContainText('Not imported yet: rev1_ieee_clean.sgy');
  await expect(page.locator('[data-testid="window-section"]').getByTitle('Save PNG snapshot')).toBeEnabled({ timeout: 60000 });

  // Continue reopens the same setup, scanned again
  await page.getByTestId('sl-import-draft-continue').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'rev1_ieee_clean.sgy' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Vertical axis of this file')).toBeVisible({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // the owner's path: another app, then back
  await navigateInApp(page, '/dev/well-data-manager');
  await expect(page.locator('[data-testid="viewer-windows"]')).toHaveCount(0, { timeout: 30000 });
  await navigateInApp(page, '/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('sl-import-draft')).toContainText('rev1_ieee_clean.sgy');
  // the file is on screen again, read from disk
  await expect(page.locator('[data-testid="window-section"]').getByTitle('Save PNG snapshot')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('[title="rev1_ieee_clean.sgy (local file)"] >> visible=true').first()).toBeVisible();

  // discard clears the setup
  await page.getByTestId('sl-import-draft-discard').click();
  await expect(page.getByTestId('sl-import-draft')).toHaveCount(0);
});
