#!/usr/bin/env node
// Removes wells from the demo account through Well Data Manager's own delete
// (the well's context menu, then the confirm dialog), so a take can start
// from a clean registry, e.g. a lesson that imports Ekene-1 on camera.
//   node tools/demo-video/seed/delete-wells.mjs [--base-url URL] --wells Ekene-1,Ekene-2
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

export async function deleteWells(page, baseUrl, names) {
  const t = (id) => page.getByTestId(id);
  for (const name of names) {
    // a fresh page per well: after a delete the closing dialog and its toast
    // sit over the list for a moment
    await page.goto(`${baseUrl}/dashboard/apps/geoscience/well-data-manager`, { waitUntil: 'domcontentloaded' });
    await t('wdm-open-las').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    const row = t('wdm-well-row').filter({ hasText: new RegExp(`^${name.replace(/[-]/g, '\\-')}(?!\\d)`) });
    if (!(await row.count())) { console.log(`${name}: not in the registry`); continue; }
    await row.first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await t('wdm-delete-dialog').waitFor();
    await t('wdm-delete-confirm').click({ timeout: 30000 });
    await t('wdm-delete-dialog').waitFor({ state: 'hidden', timeout: 60000 });
    await page.waitForTimeout(800);
    console.log(`${name}: deleted`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const baseUrl = opt('base-url', 'http://127.0.0.1:4173');
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await login(page, baseUrl, loadEnv());
    await deleteWells(page, baseUrl, opt('wells', '').split(',').filter(Boolean));
  } finally { await b.close(); }
}
