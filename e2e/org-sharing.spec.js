// Organisation sharing of saved records (docs/scope/OrgSharing-DESIGN-AND-STATUS.md)
// on the auth-free /dev harnesses. Each harness runs on the in-memory mirror
// of the sharing migration (src/lib/recordSharing/memoryDb.js): you, in a
// small organisation with one colleague, Ada. ?shared=1 adds records Ada
// shared; ?sharing=off behaves as the database before the migration.
//
// One control everywhere: "Share with my organisation", "Colleagues can
// view / edit", who is editing, Start editing, Save a copy, History.

import { test, expect } from '@playwright/test';

const T = { timeout: 60000 };

test.describe('Seismolord projects (U2-008)', () => {
  test('the owner shares a project folder; a project a colleague shared says how far it opens', async ({ page }) => {
    await page.goto('/dev/seismolord-workspace?shared=1');
    const explorer = page.locator('#explorer');
    await expect(explorer.getByText('Keta 3D interpretation')).toBeVisible(T);
    await expect(explorer.getByTestId('seis-shared-projects')).toHaveText('Shared with me');
    await expect(explorer.getByText('No volume of this project is shared with your organisation yet.').first()).toBeVisible();

    // own project: share it
    await explorer.locator('[data-testid="seis-project-share"][data-project-name="Keta 3D interpretation"]').click({ force: true });
    const dialog = page.getByTestId('seis-project-sharing');
    await expect(dialog.getByTestId('share-switch')).toHaveAttribute('aria-checked', 'false', T);
    await dialog.getByTestId('share-switch').click();
    await expect(dialog.getByTestId('share-switch')).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByTestId('share-access')).toHaveValue('view');
    await expect(dialog.getByTestId('seis-project-volumes-note')).toContainText('This project has no volumes yet.');
    await dialog.getByTestId('history-button').click();
    await expect(dialog.getByTestId('history-row').first()).toContainText('Shared with the organisation: colleagues can view');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // a project Ada shared for viewing
    await explorer.locator('[data-testid="seis-project-share"][data-project-name="Regional 2D lines (Ada)"]').click({ force: true });
    await expect(dialog.getByTestId('shared-by')).toHaveText('Shared by Ada Colleague', T);
    await expect(dialog.getByTestId('share-switch')).toHaveCount(0);
    await expect(dialog.getByTestId('sharing-banner')).toHaveText('Shared by Ada Colleague for viewing.');
    await expect(dialog.getByTestId('seis-project-volumes-note')).toContainText('No volume of this project is shared with your organisation yet, so there is nothing to open.');
    await dialog.getByTestId('save-copy').click();
    await expect(explorer.getByText('Regional 2D lines (Ada) (copy)')).toBeVisible(T);
  });

  test('before the migration the dialog is a note and nothing can be shared', async ({ page }) => {
    await page.goto('/dev/seismolord-workspace?projects=1&sharing=off');
    const explorer = page.locator('#explorer');
    await expect(explorer.getByText('Keta 3D interpretation')).toBeVisible(T);
    await explorer.locator('[data-testid="seis-project-share"][data-project-name="Keta 3D interpretation"]').click({ force: true });
    const dialog = page.getByTestId('seis-project-sharing');
    await expect(dialog.getByTestId('sharing-unavailable')).toHaveText('Sharing with your organisation is not switched on for this database yet. Records stay private until it is.', T);
    await expect(dialog.getByTestId('share-switch')).toHaveCount(0);
  });
});

test.describe('ReservoirCalc Pro projects (U2-014)', () => {
  const save = async (page, name) => {
    await page.getByTestId('rcp-save').click();
    await page.getByTestId('rcp-save-name').fill(name);
    await page.getByTestId('rcp-save-confirm').click();
  };

  test('the owner saves, shares for editing and is the one editing; Done editing frees it', async ({ page }) => {
    await page.goto('/dev/reservoircalc-pro?shared=1');
    await expect(page.getByTestId('rcp-save')).toBeVisible(T);
    await expect(page.getByTestId('rcp-share')).toHaveCount(0);          // nothing to share before the first save
    await save(page, 'Keta West');
    await expect(page.getByTestId('rcp-save-name')).toBeHidden(T);
    await page.getByTestId('rcp-share').click();
    const strip = page.getByTestId('rcp-sharing-strip');
    await expect(strip.getByTestId('share-switch')).toHaveAttribute('aria-checked', 'false', T);
    await strip.getByTestId('share-switch').click();
    await expect(strip.getByTestId('share-access')).toHaveValue('view');
    await strip.getByTestId('share-access').selectOption('edit');
    await expect(strip.getByTestId('sharing-banner')).toHaveText('You are editing this project. Colleagues see it read-only until you finish.', T);
    await strip.getByTestId('done-editing').click();
    await expect(strip.getByTestId('start-editing')).toBeVisible(T);
    await expect(page.getByTestId('rcp-read-only')).toBeVisible();
    await strip.getByTestId('history-button').click();
    await expect(strip.getByTestId('history-panel')).toContainText('Colleagues can now edit');
    await expect(strip.getByTestId('history-panel')).toContainText('Finished editing');
  });

  test('a project a colleague shared opens read-only; Save is refused with the reason and Save a copy keeps the work', async ({ page }) => {
    await page.goto('/dev/reservoircalc-pro?shared=1');
    await expect(page.getByTestId('rcp-save')).toBeVisible(T);
    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(page.getByTestId('rcp-shared-projects')).toHaveText('Shared with me', T);
    const row = page.getByTestId('rcp-project-row').filter({ hasText: 'Keta North (Ada)' });
    await expect(row.getByTestId('shared-row-note')).toContainText('Shared by Ada Colleague, view only');
    await row.click();
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Load Project' }).click();
    const strip = page.getByTestId('rcp-sharing-strip');
    await expect(strip.getByTestId('shared-by')).toHaveText('Shared by Ada Colleague', T);
    await expect(page.getByTestId('rcp-read-only')).toBeVisible();
    await page.getByTestId('rcp-save').click();
    await page.getByTestId('rcp-save-confirm').click();
    await expect(page.getByText('Shared by Ada Colleague for viewing. Save a copy to work on your own version. "Save a copy" keeps your work as your own project.')).toBeVisible();
    await page.getByTestId('rcp-save-copy').click();
    await expect(page.getByTestId('rcp-save-name')).toBeHidden(T);
    await expect(page.getByTestId('rcp-read-only')).toHaveCount(0);
    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(page.getByTestId('rcp-project-row').filter({ hasText: 'Keta North (Ada) (copy)' })).toBeVisible(T);
  });

  test('before the migration saving works as before and the control is a note', async ({ page }) => {
    await page.goto('/dev/reservoircalc-pro?sharing=off');
    await expect(page.getByTestId('rcp-save')).toBeVisible(T);
    await save(page, 'Before apply');
    await expect(page.getByTestId('rcp-save-name')).toBeHidden(T);
    await save(page, 'Before apply');                                   // a second save updates, as always
    await expect(page.getByTestId('rcp-save-name')).toBeHidden(T);
    await page.getByTestId('rcp-share').click();
    await expect(page.getByTestId('sharing-unavailable')).toBeVisible(T);
    await expect(page.getByTestId('share-switch')).toHaveCount(0);
  });
});

test.describe('the same control in the other apps', () => {
  test('Earth Modeling: shared models are listed apart and a view-only one is refused on Save', async ({ page }) => {
    await page.goto('/dev/earth-modeling?shared=1');
    await expect(page.getByTestId('em-shared-models')).toHaveText('Shared with me', T);
    await page.getByTestId('em-model-row').filter({ hasText: 'Regional framework (Ada)' }).getByText('load').click();
    await expect(page.getByTestId('shared-by')).toHaveText('Shared by Ada Colleague', T);
    await page.getByTestId('em-save-model').click();
    await expect(page.getByTestId('em-status')).toContainText('Shared by Ada Colleague for viewing.');
  });

  test('Well Correlation: a section colleagues can edit is taken, then saved', async ({ page }) => {
    await page.goto('/dev/well-correlation?shared=1');
    const select = page.getByTestId('corr-section-select');
    await expect(select.locator('optgroup[label="Shared with me"] option')).toHaveCount(2, T);
    await select.selectOption('section-ada-edit');
    await expect(page.getByTestId('shared-by')).toHaveText('Shared by Ada Colleague', T);
    await page.getByTestId('corr-save').click();
    await expect(page.getByTestId('corr-status')).toContainText('Section not saved. Start editing first');
    await page.getByTestId('start-editing').click();
    await expect(page.getByTestId('sharing-banner')).toHaveText('You are editing this section. Colleagues see it read-only until you finish.', T);
    await page.getByTestId('corr-save').click();
    await expect(page.getByTestId('corr-status')).toContainText('Section saved as Field strike line, team');
  });
});
