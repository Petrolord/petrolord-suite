// Basin & Charge Modeling G7.4 (BasinFlow-PLAN.md): the tile↔route
// contract — the route the seeded master_apps tile points at must
// resolve its lazy chunk (engines, contexts, plots — post-G7.3 the
// chunk no longer pulls @tensorflow/tfjs) and hand off to the auth
// gate; not crash, and not fall through to the home-redirect
// catch-all as an unregistered route would.

import { test, expect } from '@playwright/test';

test('basinflow-genesis app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/basinflow-genesis');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('basinflow-genesis'); // redirected by the auth gate
});
