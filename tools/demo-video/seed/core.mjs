#!/usr/bin/env node
// Loads the kit's routine core analysis (01-wells/core/<well>-core.las, kit
// v2.1) into wells already in the demo registry, through Well Data Manager's
// "A LAS into an existing well" import. Idempotent: a well that already shows
// a CPOR curve is left as it is, unless --replace (then the curves are replaced).
//
//   node tools/demo-video/seed/core.mjs [--base-url URL] [--wells Ekene-1,Ekene-3] [--replace] [--headed]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v2');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const baseUrl = opt('base-url', 'http://127.0.0.1:4173');
const wells = opt('wells', 'Ekene-1').split(',');
const env = loadEnv();

const b = await chromium.launch({ headless: !args.includes('--headed') });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
try {
  await login(page, baseUrl, env);
  for (const name of wells) {
    await page.goto(`${baseUrl}/dashboard/apps/geoscience/well-data-manager`, { waitUntil: 'domcontentloaded' });
    await t('wdm-open-las').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    const row = t('wdm-well-row').filter({ hasText: name }).first();
    await row.waitFor({ timeout: 60000 });
    await row.click(); await page.waitForTimeout(2000);
    const has = /\bCPOR\b/.test(await page.locator('body').innerText());
    if (has && !args.includes('--replace')) { console.log(`${name}: core already loaded`); continue; }
    await t('wdm-open-las').click();
    await t('wdm-las-file').setInputFiles(path.join(KIT, `01-wells/core/${name}-core.las`));
    await t('wdm-las-summary').waitFor({ timeout: 60000 });
    await t('wdm-las-target-existing').check();
    const sel = t('wdm-las-target-well');
    const id = await sel.locator('option', { hasText: name }).first().getAttribute('value');
    await sel.selectOption(id);
    await page.waitForTimeout(1500);
    for (const m of ['CPOR', 'CKH']) {
      const c = t(`wdm-las-clash-${m}`);
      if (await c.count()) await c.selectOption('replace');
    }
    const dlg = t('wdm-las-dialog');
    await t('wdm-las-import').click();
    const done = await Promise.race([
      dlg.waitFor({ state: 'hidden', timeout: 180000 }).then(() => 'ok'),
      t('wdm-las-error').waitFor({ timeout: 180000 }).then(() => 'error'),
    ]);
    if (done !== 'ok') {
      await dlg.screenshot({ path: '/root/demo-videos/seed-core-error.png' });
      throw new Error(`${name}: core import refused: ${await t('wdm-las-error').textContent()}`);
    }
    console.log(`${name}: core loaded`);
  }
} finally {
  await b.close();
}
