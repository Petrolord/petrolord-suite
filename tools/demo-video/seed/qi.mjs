#!/usr/bin/env node
// Loads what QI Studio needs from kit v3 into wells already in the demo
// registry, through Well Data Manager's own screens:
//   1. the dipole shear sonic (DTS), as a LAS into the existing well (only the
//      DEPT and DTS columns of the kit LAS, so no other curve is touched);
//   2. the checkshots (MD in metres, one-way time), pasted on the Checkshots tab;
//   3. the deviation survey (MD in metres, inclination, azimuth), pasted on the
//      Deviation tab (QI Studio grades a well with no survey as limited).
// Idempotent: a well that already shows DTS keeps it unless --replace; the
// checkshot paste replaces what is there either way.
//
//   node tools/demo-video/seed/qi.mjs [--base-url URL] [--wells Ekene-1,Ekene-2] [--replace] [--no-checkshots] [--no-survey] [--headed]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v3');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const baseUrl = opt('base-url', 'http://127.0.0.1:4173');
const wells = opt('wells', 'Ekene-1,Ekene-2,Ekene-3,Ekene-4').split(',');
const env = loadEnv();

/** The kit LAS cut down to DEPT and DTS, written to a temp file. */
function shearLas(name) {
  const text = fs.readFileSync(path.join(KIT, `01-wells/${name}.las`), 'utf8');
  const lines = text.split('\n');
  const cStart = lines.findIndex((l) => l.startsWith('~C'));
  const aStart = lines.findIndex((l) => l.startsWith('~A'));
  const curveLines = lines.slice(cStart + 1, aStart).filter((l) => l.trim() && !l.startsWith('#'));
  const names = curveLines.map((l) => l.split('.')[0].trim());
  const iDts = names.indexOf('DTS');
  if (iDts < 0) throw new Error(`${name}.las has no DTS: is this kit v3?`);
  const keep = [0, iDts];
  const out = [
    ...lines.slice(0, cStart + 1),
    ...keep.map((i) => curveLines[i]),
    ...lines.slice(aStart, aStart + 1),
    ...lines.slice(aStart + 1).filter((l) => l.trim()).map((l) => {
      const v = l.trim().split(/\s+/);
      return keep.map((i) => v[i].padStart(12)).join(' ');
    }),
  ];
  const p = path.join(os.tmpdir(), `${name}-dts.las`);
  fs.writeFileSync(p, `${out.join('\n')}\n`);
  return p;
}

const csvRows = (p) => {
  const [head, ...rows] = fs.readFileSync(p, 'utf8').trim().split('\n');
  const keys = head.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
};

const b = await chromium.launch({ headless: !args.includes('--headed') });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
try {
  await login(page, baseUrl, env);
  for (const name of wells) {
    await page.goto(`${baseUrl}/dashboard/apps/geoscience/well-data-manager`, { waitUntil: 'domcontentloaded' });
    await t('wdm-open-las').waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    const row = t('wdm-well-row').filter({ hasText: new RegExp(`${name}(?!\\d)`) }).first();
    await row.waitFor({ timeout: 60000 });
    await row.click(); await page.waitForTimeout(2000);

    const has = /\bDTS\b/.test(await page.locator('body').innerText());
    if (has && !args.includes('--replace')) {
      console.log(`${name}: DTS already loaded`);
    } else {
      await t('wdm-open-las').click();
      await t('wdm-las-file').setInputFiles(shearLas(name));
      await t('wdm-las-summary').waitFor({ timeout: 60000 });
      await t('wdm-las-target-existing').check();
      const sel = t('wdm-las-target-well');
      const id = await sel.locator('option', { hasText: name }).first().getAttribute('value');
      await sel.selectOption(id);
      await page.waitForTimeout(1500);
      const c = t('wdm-las-clash-DTS');
      if (await c.count()) await c.selectOption('replace');
      const dlg = t('wdm-las-dialog');
      await t('wdm-las-import').click();
      const done = await Promise.race([
        dlg.waitFor({ state: 'hidden', timeout: 180000 }).then(() => 'ok'),
        t('wdm-las-error').waitFor({ timeout: 180000 }).then(() => 'error'),
      ]);
      if (done !== 'ok') {
        await dlg.screenshot({ path: '/root/demo-videos/seed-qi-error.png' });
        throw new Error(`${name}: DTS import refused: ${await t('wdm-las-error').textContent()}`);
      }
      console.log(`${name}: DTS loaded`);
      await row.click(); await page.waitForTimeout(1500);
    }

    if (!args.includes('--no-survey')) {
      await t('wdm-detail-tab-deviation').click();
      await t('wdm-edit-deviation').click();
      await t('wdm-deviation-paste-toggle').click();
      const md = t('wdm-deviation-mdunit');
      if (await md.count()) await md.selectOption('m');
      const sv = csvRows(path.join(KIT, `01-wells/surveys/${name}-survey.csv`));
      await t('wdm-deviation-paste-text').fill(['MD\tInc\tAzi', ...sv.map((r) => `${r.md_m}\t${r.inclination_deg}\t${r.azimuth_deg_grid}`)].join('\n'));
      await page.waitForTimeout(800);
      await t('wdm-deviation-save').click();
      await page.waitForTimeout(2500);
      const derr = t('wdm-deviation-error');
      if (await derr.count()) throw new Error(`${name}: survey refused: ${await derr.textContent()}`);
      console.log(`${name}: ${sv.length} survey stations pasted`);
    }

    if (args.includes('--no-checkshots')) continue;
    await t('wdm-detail-tab-checkshots').click();
    await t('wdm-edit-checkshots').click();
    await t('wdm-checkshots-paste-toggle').click();
    await t('wdm-checkshots-cs-depthref').selectOption('md');
    await t('wdm-checkshots-cs-unit').selectOption('m');
    await t('wdm-checkshots-cs-time').selectOption('owt');
    const cs = csvRows(path.join(KIT, `01-wells/checkshots/${name}-checkshots.csv`));
    await t('wdm-checkshots-paste-text').fill(['MD\tOWT', ...cs.map((r) => `${r.md_m}\t${r.one_way_time_ms}`)].join('\n'));
    await page.waitForTimeout(800);
    await t('wdm-checkshots-save').click();
    const err = t('wdm-checkshots-error');
    await page.waitForTimeout(2500);
    if (await err.count()) throw new Error(`${name}: checkshots refused: ${await err.textContent()}`);
    console.log(`${name}: ${cs.length} checkshots pasted`);
  }
} finally {
  await b.close();
}
