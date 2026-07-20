// Public homepage smoke test. Runs anonymously (no login): the homepage is
// the one page every visitor sees, so it must render fully without a session.
import { test, expect } from '@playwright/test';

test.describe('public homepage', () => {
  test('renders all sections for an anonymous visitor', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // Hero
    await expect(page.getByRole('button', { name: 'Start Configuration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book Demo' })).toBeVisible();

    // Modules showcase (static, no auth-gated DB reads)
    await expect(page.getByText('Every discipline. One suite.')).toBeVisible();
    await expect(page.getByText('Reservoir Engineering', { exact: true })).toBeVisible();
    await expect(page.getByText('Nodal Analysis Studio')).toBeVisible();

    // Quote, HSE, and NextGen sections
    await expect(page.getByRole('button', { name: /Get Instant Quote/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Explore HSE/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Discover NextGen/ })).toBeVisible();

    // The dashboard apps grid (auth-gated) must not be on the public page
    await expect(page.getByText('No Applications Found')).toHaveCount(0);
    await expect(page.getByText('Requires License')).toHaveCount(0);

    // Footer
    await expect(page.getByRole('link', { name: 'NextGen Academy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Petrolord HSE' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  });
});
