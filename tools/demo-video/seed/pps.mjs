#!/usr/bin/env node
// Pore Pressure Studio videos: a working copy of Ekene-1 in the demo
// registry, named "PPS demo: Ekene-1" (UWI NG-EK11-001-PPS), loaded through
// Well Data Manager's real LAS import as a NEW well with the kit's surface
// location, CRS and offshore datum (35 m of water, KB 25 m). The videos
// publish their prognosis to this copy, so Ekene-1 itself (and Ekene-8's
// prognosis, which the Well Design Studio videos read) stay as they are.
// Idempotent: a copy already in the registry is left alone (--replace
// deletes it first).
//
//   node tools/demo-video/seed/pps.mjs [--base-url URL] [--replace] [--name "PPS demo: Ekene-1"] [--src Ekene-1]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';
import { deleteWells } from './delete-wells.mjs';

const KIT = process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4';
const OUT = process.env.PPS_ASSETS || '/root/demo-video-work/pps-assets';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const baseUrl = opt('base-url', 'http://127.0.0.1:4193');
const src = opt('src', 'Ekene-1');
const name = opt('name', `PPS demo: ${src}`);
const env = loadEnv();

const csv = (f) => { const [h, ...rows] = fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => l.split(',')); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const h = Object.fromEntries(csv(path.join(KIT, '01-wells/well-headers.csv')).map((r) => [r.well, r]))[src];

/** The kit LAS with the copy's name and UWI (data unchanged). */
export function copyLas(text, { wellName, uwi }) {
  return text
    .replace(/^(WELL\s*\.\s+)\S.*?(\s+:\s*WELL)/m, (m, a, b) => `${a}${wellName}${b}`)
    .replace(/^(UWI\s*\.\s+)\S+(\s+:)/m, (m, a, b) => `${a}${uwi}${b}`);
}

fs.mkdirSync(OUT, { recursive: true });
const lasPath = path.join(OUT, `${src}-pps-copy.las`);
fs.writeFileSync(lasPath, copyLas(fs.readFileSync(path.join(KIT, `01-wells/${src}.las`), 'utf8'), { wellName: name, uwi: `${h.uwi}-PPS` }));

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
const WDM = `${baseUrl}/dashboard/apps/geoscience/well-data-manager`;
try {
  await login(page, baseUrl, env);
  if (args.includes('--replace')) await deleteWells(page, baseUrl, [name]);
  await page.goto(WDM, { waitUntil: 'domcontentloaded' });
  await t('wdm-open-las').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  const row = t('wdm-well-row').filter({ hasText: name });
  if (await row.count()) { console.log(`${name}: already in the registry`); } else {
    await t('wdm-open-las').click();
    await t('wdm-las-file').setInputFiles(lasPath);
    await t('wdm-las-summary').waitFor({ timeout: 60000 });
    await t('wdm-las-target-new').check();
    await page.waitForTimeout(500);
    if (!(await t('wdm-las-target-new').isChecked())) throw new Error('could not choose "a new well"');
    await t('wdm-las-name').fill(name);
    await t('wdm-las-uwi').fill(`${h.uwi}-PPS`);
    await t('wdm-las-x').fill(String(Number(h.surface_easting_m)));
    await t('wdm-las-y').fill(String(Number(h.surface_northing_m)));
    const dlg = t('wdm-las-dialog');
    const chooseCrs = dlg.getByRole('button', { name: /choose a coordinate reference system/i });
    if (await chooseCrs.count()) {
      await chooseCrs.click();
      await page.getByPlaceholder('Search name, EPSG code or region').fill('32632');
      await t('crs-search-results').getByRole('button').first().click();
    }
    if (!/32632|UTM zone 32N/.test(await dlg.textContent())) throw new Error('the import dialog is not on EPSG:32632');
    await t('wdm-las-datum-env').selectOption('offshore');
    const label = (await dlg.textContent()) || '';
    const water = /\(ft\)|ft MD/.test(label) ? Number((Number(h.water_depth_m) / 0.3048).toFixed(3)) : Number(h.water_depth_m);
    await t('wdm-las-datum-water').fill(String(water));
    await page.screenshot({ path: path.join(OUT, 'seed-pps-dialog.png') });
    await t('wdm-las-import').click();
    const done = await Promise.race([
      dlg.waitFor({ state: 'hidden', timeout: 180000 }).then(() => 'ok'),
      t('wdm-las-error').waitFor({ timeout: 180000 }).then(() => 'error'),
    ]);
    if (done !== 'ok') throw new Error(`import refused: ${await t('wdm-las-error').textContent()}`);
    console.log(`${name}: imported`);
  }
} finally {
  await b.close();
}
