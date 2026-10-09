#!/usr/bin/env node
// Imports kit v3's seismic volumes into the demo account through Seismolord's
// own import dialog, converted on the Petrolord server, one at a time:
// the full stack and the near, mid and far angle stacks. A volume already in
// the Seismic Explorer list is skipped.
//
// The server upload goes to storage.petrolord.com, whose CORS allows the real
// sites only, so run this against https://petrolord.com (it is not filmed):
//   node tools/demo-video/seed/seismic.mjs --base-url https://petrolord.com [--volumes full,near] [--headed]
// --volumes gathers uploads the NMO-corrected gathers the same way: QI
// Studio's Prestack tab builds its gather store from that upload. The tab is
// held open for --hold minutes (default 8) while the 109 MB upload runs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from '../lib/env.mjs';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v3');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const baseUrl = opt('base-url', 'https://petrolord.com');
const volumes = opt('volumes', 'full,near,mid,far').split(',');
const env = loadEnv();

const b = await chromium.launch({
  headless: !args.includes('--headed'),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const t = (id) => page.getByTestId(id);
// a volume is ready once the active-volume picker offers it (it is listed
// under its file name)
const ready = async (name) => (await page.locator('option', { hasText: new RegExp(`^${name}(\\.sgy)?$`) }).count()) > 0;
try {
  await login(page, baseUrl, env);
  await page.goto(`${baseUrl}/dashboard/apps/geoscience/seismolord`, { waitUntil: 'domcontentloaded' });
  await t('sl-start-toggle').waitFor({ timeout: 120000 });
  await page.waitForTimeout(5000);
  if (await t('sl-tour-skip').count()) await t('sl-tour-skip').click();
  for (const v of volumes) {
    const name = v === 'gathers' ? 'EKENE3D-gathers-nmo' : `EKENE3D-${v}`;
    const file = v === 'gathers' ? `04-seismic/gathers/${name}.sgy` : `04-seismic/${name}.sgy`;
    if (v !== 'gathers' && await ready(name)) { console.log(`${name}: already imported`); continue; }
    if (!(await t('sl-start-go-import').isVisible())) await t('sl-start-toggle').click();
    await t('sl-start-go-import').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.locator('input[type="file"][accept*=".sgy"]').first().setInputFiles(path.join(KIT, file));
    await dialog.getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
    await dialog.getByText('On the Petrolord server').click();
    await dialog.getByRole('button', { name: 'Start import' }).click();
    const started = Date.now();
    // the upload runs in this tab and the dialog closes; the server converts;
    // the volume then appears in the picker
    try {
      await dialog.waitFor({ state: 'hidden', timeout: 120000 });
    } catch {
      await dialog.screenshot({ path: '/root/demo-videos/seed-seismic-error.png' });
      throw new Error(`${name}: the import dialog did not close: ${(await dialog.innerText()).split('\n').filter((l) => /fail|error|limit|quota|cannot|refused|wait/i.test(l)).join(' / ')}`);
    }
    if (v === 'gathers') {
      const holdMs = Number(opt('hold', '8')) * 60000;
      while (Date.now() - started < holdMs) {
        await page.waitForTimeout(15000);
        const err = (await page.locator('body').innerText()).split('\n').find((l) => /failed to upload|upload failed/i.test(l));
        if (err) throw new Error(`${name}: ${err}`);
      }
      console.log(`${name}: upload tab held ${Math.round(holdMs / 60000)} min; check qi_datasets for status uploaded`);
      continue;
    }
    for (;;) {
      await page.waitForTimeout(15000);
      const txt = await page.locator('body').innerText();
      const err = txt.split('\n').find((l) => /failed to upload|upload failed|conversion failed/i.test(l));
      if (err) throw new Error(`${name}: ${err}`);
      if (await ready(name)) break;
      if (Date.now() - started > 40 * 60000) throw new Error(`${name}: not in the volume list after 40 minutes`);
    }
    console.log(`${name}: imported in ${Math.round((Date.now() - started) / 60000)} min`);
  }
} finally {
  await b.close();
}
