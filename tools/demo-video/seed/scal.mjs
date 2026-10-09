#!/usr/bin/env node
// Builds the Ekene Sand saturation-height project in SCAL Studio through its
// own screens, the way Episode 15 of the kit describes: three plugs on three
// fluid systems (properties from 09-reservoir/capillary/plug-properties.csv,
// Pc tables from EK*-P.csv), J from the samples, the reservoir rock and
// fluids, and the free-water level, then saves it under one name.
// Off camera, for the saturation-height lesson.
//
//   node tools/demo-video/seed/scal.mjs [--base-url URL] [--name "Ekene Sand J-function"] [--headed] [--shot path]
import fs from 'node:fs';
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
const name = opt('name', 'Ekene Sand J-function');
const shot = opt('shot', null);
const env = loadEnv();
const CAP = path.join(KIT, '09-reservoir/capillary');
const [hdr, ...rows] = fs.readFileSync(path.join(CAP, 'plug-properties.csv'), 'utf8').trim().split('\n').map((l) => l.split(','));
const plugs = rows.map((r) => Object.fromEntries(hdr.map((k, i) => [k, r[i]])));
// earth model (spine.mjs, rockmodel.mjs): k 250 mD, phi 0.20, oil-brine
// sigma 26 dyn/cm at 30 deg; water 1.03, 32 API oil 0.8654; FWL 1538.14 m
// TVDSS = 5046.4 ft (contact 5036.1 ft plus the 10.3 ft entry height)
const RESERVOIR = { k_md: 250, phi: 0.2, sigma_dyncm: 26, thetaDeg: 30 };
const FLUIDS = { gammaW: 1.03, gammaHc: 0.8654, fwl_tvdss: 5046.4 };

const b = await chromium.launch({ headless: !args.includes('--headed') });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t = (id) => page.getByTestId(id);
page.on('dialog', (dlg) => dlg.accept()); // the delete asks window.confirm
const tab = (n) => page.getByRole('tab', { name: n, exact: true }).first().click();
try {
  await login(page, baseUrl, env);
  await page.goto(`${baseUrl}/dashboard/apps/reservoir/scal-studio`, { waitUntil: 'domcontentloaded' });
  await t('scal-unit-system').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  // replace an earlier run's project of the same name (delete it), then
  // create the project: the + beside the project picker, then its name
  for (let i = 0; i < 6; i++) {
    await page.getByRole('combobox').first().click(); await page.waitForTimeout(600);
    const opt = page.getByRole('option', { name, exact: true }).first();
    if (!(await opt.count())) { await page.keyboard.press('Escape'); break; }
    await opt.click(); await page.waitForTimeout(2000);
    await page.getByRole('button').filter({ has: page.locator('svg.lucide-trash2, svg.lucide-trash-2') }).first().click();
    await page.waitForTimeout(2500);
    console.log(`deleted an earlier "${name}"`);
  }
  // a fresh page, so the new project starts empty (the open state survives a delete)
  await page.goto(`${baseUrl}/dashboard/apps/reservoir/scal-studio`, { waitUntil: 'domcontentloaded' });
  await t('scal-unit-system').waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).first().click();
  await page.waitForTimeout(1000);
  if (shot) await page.screenshot({ path: `${shot}-new.png` });
  const nameBox = page.getByRole('dialog').getByRole('textbox').first();
  if (await nameBox.count()) {
    await nameBox.fill(name);
    await page.getByRole('dialog').getByRole('button', { name: /create|save|ok/i }).last().click();
    await page.waitForTimeout(2000);
  }
  await tab('Lab Data'); await page.waitForTimeout(800);
  for (const p of plugs) {
    await page.getByRole('button', { name: 'Add sample' }).click(); await page.waitForTimeout(800);
    await page.getByLabel('Name', { exact: true }).fill(p.plug);
    await t('sample-k_md').fill(p.k_md); await t('sample-phi').fill(p.phi);
    await t('sample-sigma_dyncm').fill(p.sigma_dyncm); await t('sample-thetaDeg').fill(p.contact_angle_deg);
    await page.locator('input[type="file"]').nth(1).setInputFiles(path.join(CAP, `${p.plug}.csv`));
    await page.waitForTimeout(1500);
    console.log(`sample ${p.plug} (${p.system}) entered`);
  }
  if (shot) await page.screenshot({ path: `${shot}-lab.png` });
  await tab('Capillary'); await page.waitForTimeout(800);
  await page.getByRole('tab', { name: 'From samples' }).click(); await page.waitForTimeout(800);
  if (shot) await page.screenshot({ path: `${shot}-cap0.png` });
  const tick = async (text) => {
    const row = page.locator('label').filter({ hasText: text }).first();
    const box = row.locator('input[type="checkbox"], [role="checkbox"]').first();
    const on = (await box.count()) ? ((await box.getAttribute('aria-checked')) === 'true' || (await box.isChecked().catch(() => false))) : false;
    if (!on) await row.click();
  };
  for (const p of plugs) await tick(p.plug);
  await tick('Fit Swirr with a and b');
  await page.waitForTimeout(1500);
  for (const [k, v] of Object.entries(RESERVOIR)) await t(`reservoir-${k}`).fill(String(v));
  await page.waitForTimeout(1000);
  if (shot) await page.screenshot({ path: `${shot}-cap.png` });
  await tab('Height & Saturation'); await page.waitForTimeout(800);
  for (const [k, v] of Object.entries(FLUIDS)) await t(`height-${k}`).fill(String(v));
  await page.waitForTimeout(1000);
  if (shot) await page.screenshot({ path: `${shot}-height.png` });
  // the autosave fires 10 s after the last edit; leaving sooner cancels it
  await page.waitForTimeout(14000);
  // verify from a fresh page: the stored project must carry the sample J
  await page.goto(`${baseUrl}/dashboard/apps/reservoir/scal-studio`, { waitUntil: 'domcontentloaded' });
  await t('scal-unit-system').waitFor({ timeout: 120000 }); await page.waitForTimeout(3000);
  await page.getByRole('combobox').first().click(); await page.waitForTimeout(600);
  await page.getByRole('option', { name, exact: true }).first().click(); await page.waitForTimeout(3000);
  await tab('Capillary'); await page.waitForTimeout(1500);
  const cap = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const m = cap.match(/J SOURCE (\S+(?: samples)?) A \(J AT SW\* = 1\) ([0-9.]+) B EXPONENT ([0-9.]+) SWIRR ([0-9.]+)/i);
  console.log('stored:', m ? `J source ${m[1]}, a ${m[2]}, b ${m[3]}, Swirr ${m[4]}` : cap.slice(0, 200));
  if (!m || !/samples/.test(m[1])) throw new Error('the stored project does not carry the sample J');
  if (shot) await page.screenshot({ path: `${shot}-done.png` });
  console.log(`saved as "${name}"`);
} finally {
  await b.close();
}
