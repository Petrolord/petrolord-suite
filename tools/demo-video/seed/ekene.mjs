#!/usr/bin/env node
// Loads Ekene wells into the demo account through Well Data Manager's real
// import screens: LAS, surface location, CRS, offshore datum, then tops.
// Idempotent: a well already in the registry is left as it is.
//
//   node tools/demo-video/seed/ekene.mjs [--base-url URL] [--wells Ekene-1,Ekene-2] [--headed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v1');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const baseUrl = opt('base-url', 'http://127.0.0.1:4173');
const wells = opt('wells', 'Ekene-1,Ekene-2,Ekene-3,Ekene-4').split(',');
const env = loadEnv();

const csv = (f) => { const [h, ...rows] = fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => l.split(',')); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const headers = Object.fromEntries(csv(path.join(KIT, '01-wells/well-headers.csv')).map((r) => [r.well, r]));

const b = await chromium.launch({ headless: !args.includes('--headed') });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
try {
  await login(page, baseUrl, env);
  await page.goto(`${baseUrl}/dashboard/apps/geoscience/well-data-manager`, { waitUntil: 'domcontentloaded' });
  await t('wdm-open-las').waitFor({ timeout: 120000 });
  for (const name of wells) {
    const h = headers[name];
    const row = t('wdm-well-row').filter({ hasText: name });
    if (await row.count()) { console.log(`${name}: already in the registry`); continue; }
    await t('wdm-open-las').click();
    await t('wdm-las-file').setInputFiles(path.join(KIT, `01-wells/${name}.las`));
    await t('wdm-las-summary').waitFor({ timeout: 60000 });
    await t('wdm-las-x').fill(String(Number(h.surface_easting_m)));
    await t('wdm-las-y').fill(String(Number(h.surface_northing_m)));
    const dlg = t('wdm-las-dialog');
    await dlg.getByRole('button', { name: /coordinate reference system/i }).click();
    await page.getByPlaceholder('Search name, EPSG code or region').fill(h.crs.replace('EPSG:', ''));
    await t('crs-search-results').getByRole('button').first().click();
    // offshore: the 99da110 build proposes onshore from EGL (fixed in #926)
    if (await t('wdm-las-datum-ground').count()) await t('wdm-las-datum-ground').fill('');
    await t('wdm-las-datum-env').selectOption('offshore');
    await t('wdm-las-datum-water').fill(String(Number(h.water_depth_m)));
    await t('wdm-las-import').click();
    await dlg.waitFor({ state: 'hidden', timeout: 180000 });
    await row.first().waitFor({ timeout: 60000 });
    console.log(`${name}: imported`);

    await row.first().click();
    await t('wdm-detail-tab-tops').click();
    await t('wdm-edit-tops').click();
    await t('wdm-tops-paste-toggle').click();
    const tops = csv(path.join(KIT, `01-wells/tops/${name}-tops.csv`));
    await t('wdm-tops-paste-text').fill(['Surface\tMD (m)', ...tops.map((r) => `${r.top_name}\t${r.md_m}`)].join('\n'));
    await t('wdm-tops-save').click();
    await page.waitForTimeout(2500);
    console.log(`${name}: ${tops.length} tops pasted`);
  }
  await page.screenshot({ path: '/root/demo-videos/seed-wdm.png' });
} finally {
  await b.close();
}
