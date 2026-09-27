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

    // Hero (redesign 2026-09-27)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every discipline of the asset');
    await expect(page.getByRole('button', { name: /Get an instant quote/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book a demo' }).first()).toBeVisible();

    // Module catalogue (static, from src/data/suiteCatalog.js; no auth-gated DB reads)
    await expect(page.getByRole('tab', { name: /All modules/ })).toBeVisible();
    await page.getByRole('tab', { name: /Production/ }).click();
    await expect(page.getByText('Nodal Analysis Studio')).toBeVisible();
    await page.fill('#home-app-search', 'gas lift');
    await expect(page.getByText('Gas Lift Design Studio')).toBeVisible();

    // The dashboard apps grid (auth-gated) must not be on the public page
    await expect(page.getByText('No Applications Found')).toHaveCount(0);
    await expect(page.getByText('Requires License')).toHaveCount(0);

    // How to buy (no prices on the public page), family and data-ownership sections
    await expect(page.getByRole('heading', { name: /Get your quote in minutes/ })).toBeVisible();
    await expect(page.locator('#buy')).not.toContainText('$');
    await expect(page.getByRole('link', { name: /Visit NextGen Academy/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Explore Petrolord HSE/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Data Retention & Offboarding policy/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Verify a deletion certificate/ })).toBeVisible();

    // Footer
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'NextGen Academy', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Petrolord HSE', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Data Processing Agreement' })).toBeVisible();
  });
});
