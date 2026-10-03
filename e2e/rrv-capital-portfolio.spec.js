// Risked Reserves Valuation U2-009 (2026-10-03) on the /dev harnesses,
// signed out: a saved valuation is sent to Capital Portfolio Studio, which
// reads it by its id and opens the project form filled. The success-case
// mean value sits in the NPV slot labelled as a mean, the well cost is the
// CAPEX, no risk score is asked for, and the portfolio's risked EMV of the
// candidate is the valuation's EMV. A colleague's shared valuation goes as
// read-only provenance.

import { test, expect } from '@playwright/test';

const openRrv = async (page, query) => {
  await page.goto(`/dev/risked-reserves${query}`);
  await expect(page.getByTestId('rrv')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('rrv-save-state')).not.toHaveText(/Checking/);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
});

test('U2-009: valuation to portfolio candidate', async ({ page }) => {
  test.setTimeout(300000);
  await openRrv(page, '?saved=1');
  const emv = Number((await page.getByTestId('rrv-emv-Ekene North').textContent()).trim());
  const send = page.getByTestId('rrv-send-portfolio');
  await expect(send).toHaveAttribute('href', '/dev/capital-portfolio-studio?rrvValuation=valuation-1');
  await send.click();

  await expect(page).toHaveURL(/\/dev\/capital-portfolio-studio/, { timeout: 90000 });
  const dialog = page.getByRole('dialog');
  const intake = dialog.getByTestId('cp-rrv-intake');
  await expect(intake).toBeVisible({ timeout: 90000 });
  await expect(intake).toContainText('"Ekene North" (id valuation-1)');
  await expect(intake).toContainText('neither a median nor a P50');
  await expect(dialog.getByTestId('cp-rrv-risk-score')).toContainText('not provided by Risked Reserves Valuation');
  await expect(dialog.getByTestId('cp-rrv-risk-score')).toContainText('Chance of success Pg 32.0%');
  await expect(dialog.locator('#capex')).toHaveValue('25');
  await expect(dialog.locator('#npv_p90')).toHaveValue('-25');
  await expect(dialog.getByText('Value of the success-case P10 size ($MM)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create Project' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const pf = page.getByRole('dialog');
  await pf.locator('#name').fill('Exploration 2027');
  await pf.locator('#capex_limit').fill('100');
  await pf.locator('button[type=submit]').click();
  await page.getByText('Exploration 2027').first().click();

  const row = page.getByTestId('cp-rrv-row-Ekene North');
  await expect(row).toContainText('Pg 32.0%, risk score not provided');
  await expect(row).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('cp-mean-Ekene North')).toHaveText('success-case mean');
  const cells = row.locator('xpath=ancestor::tr').locator('td');
  await expect(cells.nth(5)).toHaveText(`$${Math.round(emv)} MM`);

  await page.getByRole('button', { name: /Run Optimization/ }).click();
  await expect(page.getByTestId('metric-note')).toContainText('includes 1 success-case mean value from Risked Reserves Valuation (each a mean; none is a P50)');
});

test('U2-009: a colleague\'s shared valuation goes as read-only provenance', async ({ page }) => {
  test.setTimeout(300000);
  await openRrv(page, '?saved=1&shared=1');
  // a shared row's cells are disabled inputs, which take no click: select it by its note
  await page.getByTestId('rrv-note-Ada Deep (shared)').click();
  const send = page.getByTestId('rrv-send-portfolio');
  await expect(send).toHaveAttribute('href', '/dev/capital-portfolio-studio?rrvValuation=valuation-shared');
  await expect(send).toHaveAttribute('title', /read-only provenance/);
  await send.click();
  const intake = page.getByRole('dialog').getByTestId('cp-rrv-intake');
  await expect(intake).toBeVisible({ timeout: 90000 });
  await expect(intake).toContainText('a colleague\'s valuation shared with you: read-only provenance');
});
