// Guided Journey stage 2 in a real browser, on the signed-out harness
// /dev/guided-journey with an in-memory journey backend (design section 8):
//  - a new member is welcomed into the organisation and asked what they work on;
//    choosing Drilling turns the next step into Well Design Studio, never seismic
//  - a drilling engineer and a refinery planner each see only their own apps
//  - "I'll find my way" removes the card; the Guide button still opens the
//    drawer, where guidance comes back
//  - the first seismic volume brings "What next?" once, with the recommendation
//  - an organisation without the discipline's apps tells a member to ask the admin
// Run: E2E_BASE_URL=http://127.0.0.1:8375 npx playwright test e2e/guided-journey.spec.js --workers=1

import { test, expect } from '@playwright/test';

const open = async (page, scenario) => {
  await page.goto(`/dev/guided-journey?scenario=${scenario}`);
  await expect(page.getByTestId('journey-harness')).toBeVisible({ timeout: 60000 });
};

test('a new member is welcomed, says what they work on, and gets their own first step', async ({ page }) => {
  await open(page, 'new-member');
  const card = page.getByTestId('guide-card');
  await expect(card).toHaveAttribute('data-stage', 'welcome');
  await expect(card.getByTestId('guide-headline')).toHaveText('Welcome to Harness Energy.');
  await expect(card).toContainText('You were added as a member, and your team has 6 people.');
  await card.getByText('Tell us what you work on').click();
  const picker = page.getByTestId('discipline-picker');
  await picker.getByTestId('discipline-drilling').check();
  await picker.getByTestId('discipline-save').click();
  await expect(picker).toBeHidden();
  // the welcome steps now point at Well Design Studio
  await expect(card).toContainText('Plan a well: start a trajectory or import a survey');
  await expect(card).not.toContainText(/seismic|SEG-Y|LAS/i);
  await card.getByTestId('guide-welcome-done').click();
  await expect(page.getByTestId('guide-card')).toHaveAttribute('data-stage', 'project');
});

for (const [scenario, want, never] of [
  ['drilling', 'Plan a well: start a trajectory or import a survey', /seismic|SEG-Y|LAS|logs/i],
  ['refinery', 'Load a crude assay', /seismic|well|drill|LAS/i],
]) {
  test(`${scenario}: only the person's own apps`, async ({ page }) => {
    await open(page, scenario);
    const card = page.getByTestId('guide-card');
    await expect(card.getByTestId('guide-headline')).toHaveText(want);
    await expect(card).not.toContainText(never);
  });
}

test('"I\'ll find my way" removes the card; the Guide drawer still answers and brings guidance back', async ({ page }) => {
  await open(page, 'drilling');
  await page.getByTestId('guide-quiet').click();
  await expect(page.getByTestId('guide-card')).toHaveCount(0);
  await page.getByTestId('guide-button-sidebar').click();
  const drawer = page.getByTestId('guide-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('guide-path')).toContainText('Plan a well');
  await expect(drawer.getByTestId('guidance-quiet')).toBeChecked();
  await drawer.getByTestId('guidance-guide').check();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('guide-card')).toBeVisible();
});

test('quiet from the start: no card, the drawer greets by name', async ({ page }) => {
  await open(page, 'quiet');
  await expect(page.getByTestId('guide-button-sidebar')).toBeVisible();
  await expect(page.getByTestId('guide-card')).toHaveCount(0);
  await page.getByTestId('guide-button-sidebar').click();
  await expect(page.getByTestId('guide-greeting')).toHaveText(/^Good (morning|afternoon|evening), Chidi\.$/);
});

test('the first seismic volume asks "What next?" once, with a recommendation', async ({ page }) => {
  await open(page, 'geo-seismic');
  const dialog = page.getByTestId('what-next');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Your first seismic volume is in.');
  await expect(dialog.getByTestId('what-next-open')).toContainText('Recommended');
  await expect(dialog.getByTestId('what-next-wells')).toContainText('Load wells to tie');
  await dialog.getByTestId('what-next-later').click();
  await expect(page.getByTestId('what-next')).toHaveCount(0);
});

test('no app of the discipline: a member is told to ask the admin', async ({ page }) => {
  await open(page, 'no-apps');
  await expect(page.getByTestId('guide-headline')).toHaveText('Your organisation has no facilities engineering apps yet. Ask your admin.');
  await expect(page.getByTestId('guide-go')).toBeVisible();
});
