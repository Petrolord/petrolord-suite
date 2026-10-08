#!/usr/bin/env node
// One-off repair (2026-10-08): the first seed typed 35 into a water-depth
// box shown in feet. Corrects each well's water depth to the kit value
// through the Header tab's datum correction, which asks for a reason and
// keeps the change in the well's history.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v1');
const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const wells = (process.argv[3] || 'Ekene-1,Ekene-3,Ekene-4').split(',');
const [h, ...rows] = fs.readFileSync(path.join(KIT, '01-wells/well-headers.csv'), 'utf8').trim().split('\n').map((l) => l.split(','));
const wd = Object.fromEntries(rows.map((r) => [r[0], Number(r[h.indexOf('water_depth_m')])]));

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
try {
  await login(page, baseUrl, loadEnv());
  await page.goto(`${baseUrl}/dashboard/apps/geoscience/well-data-manager`, { waitUntil: 'domcontentloaded' });
  await t('wdm-open-las').waitFor({ timeout: 120000 });
  for (const name of wells) {
    await t('wdm-well-row').filter({ hasText: name }).first().click();
    await t('wdm-detail-tab-header').click();
    await t('wdm-edit-header').click();
    const ft = Number((wd[name] / 0.3048).toFixed(3));
    await t('wdm-datum-water').fill(String(ft));
    await t('wdm-header-save').click();
    if (await t('wdm-datum-reason').isVisible({ timeout: 5000 }).catch(() => false)) {
      await t('wdm-datum-reason').fill('Water depth entered in feet by mistake at import; kit value 35 m');
      await t('wdm-datum-confirm').click();
    }
    await page.waitForTimeout(2500);
    console.log(`${name}: water depth set to ${ft} ft (${wd[name]} m)`);
  }
} finally {
  await b.close();
}
