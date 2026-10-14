// Shared by the Pore Pressure Studio storyboards (Ekene kit v4, oilfield
// units: depths in feet, pressures in psi and ppg EMW).
//
// The videos work on "PPS demo: Ekene-1", a copy of the kit's Ekene-1 LAS
// loaded through Well Data Manager as its own registry well (seed/pps.mjs),
// so Ekene-1 itself and Ekene-8's published prognosis (which the Well Design
// Studio videos read) are never touched. Well Design Studio sites the videos
// make are named "PPS demo ..." or "Lesson ...". A setup resets only what the
// videos own: the demo user's Pore Pressure Studio project (one row, so each
// take opens as a new project) and the PP/FP/OBG curves this studio published
// on the PPS demo wells.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';

export { login, expectText };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v4');
export const PRESSURE = (f) => path.join(process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4', '05-pressure', f);
export const PPS = '/dashboard/apps/geoscience/pore-pressure-studio';
export const WDS = '/dashboard/apps/drilling/well-planning';
export const WELL = 'PPS demo: Ekene-1';
export const SERIES = 'Pore Pressure with Petrolord';

/** The settings the videos use on the copy of Ekene-1 (feet, GR). */
export const NCT = { pickCut: '60', from: '328', to: '4035', every: '100', pressureCut: '82' };

export const t = (d, id) => d.page.getByTestId(id);

export const ppsLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: SERIES,
  eyebrow: `${SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

// ---- registry access as the demo user (setups only, never on camera) --------
let client = null;
async function sb(shared) {
  if (client) return client;
  const src = fs.readFileSync(path.resolve(HERE, '../../../src/lib/customSupabaseClient.js'), 'utf8');
  const url = /supabaseUrl = '([^']+)'/.exec(src)[1];
  const key = /supabaseAnonKey = '([^']+)'/.exec(src)[1];
  client = createClient(url, key, { auth: { persistSession: false } });
  const r = await client.auth.signInWithPassword({ email: shared.env.DEMO_EMAIL, password: shared.env.DEMO_PASSWORD });
  if (r.error) throw new Error(`demo sign-in failed: ${r.error.message}`);
  return client;
}

/** Delete the demo user's Pore Pressure Studio project (the next open is a new project). */
export async function resetProject(shared) {
  const c = await sb(shared);
  const { error } = await c.from('pp_projects').delete().not('id', 'is', null);
  if (error) throw new Error(`could not reset the PP project: ${error.message}`);
}

/** Delete the PP/FP/OBG curves this studio published on the PPS demo wells only. */
export async function clearPublished(shared, { wellRe = /^PPS demo: / } = {}) {
  const c = await sb(shared);
  const { data: wells, error } = await c.from('geo_wells').select('id,name');
  if (error) throw new Error(error.message);
  for (const w of (wells || []).filter((x) => wellRe.test(x.name))) {
    const { data: logs } = await c.from('geo_wells_logs').select('id,mnemonic,storage_path,provenance').eq('well_id', w.id);
    for (const l of (logs || []).filter((x) => ['PP', 'FP', 'OBG'].includes(x.mnemonic) && x.provenance?.engine === 'pore-pressure-studio')) {
      if (l.storage_path) await c.storage.from('wells').remove([l.storage_path]);
      await c.from('geo_wells_logs').delete().eq('id', l.id);
    }
  }
}

/** The registry well rows (for checks in setups). */
export async function registryWells(shared) {
  const c = await sb(shared);
  const { data } = await c.from('geo_wells').select('id,name');
  return data || [];
}

// ---- the studio ---------------------------------------------------------------
export async function openStudio(d, shared) {
  await d.page.goto(`${shared.baseUrl}${PPS}`, { waitUntil: 'domcontentloaded' });
  await t(d, 'pp-well-row').first().waitFor({ timeout: 120000 });
  await d.sleep(2500);
}

const wellRow = (d, name) => t(d, 'pp-well-row').filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
export { wellRow };

/** Select a registry well and wait for the prognosis. */
export async function pickWell(d, name = WELL, { onCamera = false } = {}) {
  const row = wellRow(d, name);
  if (onCamera) await d.click(row); else await row.click();
  await t(d, 'pp-prognosis-chart').waitFor({ timeout: 120000 });
  await d.sleep(2000);
}

/** The full setup: log in, reset what the videos own, open the studio. */
export async function setupStudio(d, shared, { clear = true, well = null } = {}) {
  d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
  await login(d.page, shared.baseUrl, shared.env);
  await resetProject(shared);
  if (clear) await clearPublished(shared);
  await openStudio(d, shared);
  if (well) await pickWell(d, well);
  await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
}

const act = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
  select: (l, v) => (onCamera ? d.select(l, v) : l.selectOption(v)),
});
export { act };

export async function units(d, { pressure = 'ppg', ref = 'md', onCamera = false } = {}) {
  const a = act(d, onCamera);
  if (pressure) await a.select(t(d, 'pp-unit-pressure'), pressure);
  if (ref) await a.select(t(d, 'pp-depth-ref'), ref);
  await d.sleep(600);
}

/** NCT view: GR shale picks in the normal section, fit, then the pressure cutoff. */
export async function fitNct(d, { onCamera = false, pickCut = NCT.pickCut, from = NCT.from, to = NCT.to, every = NCT.every, pressureCut = NCT.pressureCut, back = true } = {}) {
  const a = act(d, onCamera);
  await a.click(t(d, 'pp-view-nct'));
  await d.sleep(1200);
  if (await t(d, 'pp-shale-indicator').count()) await a.select(t(d, 'pp-shale-indicator'), 'gr');
  await a.type(t(d, 'pp-shale-cutoff'), pickCut);
  await a.type(t(d, 'pp-shale-from'), from);
  await a.type(t(d, 'pp-shale-to'), to);
  await a.type(t(d, 'pp-shale-every'), every);
  await a.click(t(d, 'pp-auto-pick'));
  await d.sleep(800);
  await a.click(t(d, 'pp-fit-nct'));
  await d.sleep(1200);
  if (pressureCut) await a.type(t(d, 'pp-shale-cutoff'), pressureCut);
  await d.sleep(600);
  if (back) { await a.click(t(d, 'pp-view-prognosis')); await d.sleep(1500); }
}

/** Type values into dock fields and apply. */
export async function setParams(d, fields, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  if (!(await t(d, 'pp-param-wd').isVisible().catch(() => false))) await t(d, 'pp-toggle-dock').click();
  for (const [id, v] of Object.entries(fields)) {
    if (id.startsWith('method-')) await a.click(t(d, `pp-${id}`));
    else if (id === 'fracmethod') await a.select(t(d, 'pp-param-fracmethod'), v);
    else await a.type(t(d, id.startsWith('pp-') ? id : `pp-param-${id}`), v);
  }
  await a.click(t(d, 'pp-apply-params'));
  await d.sleep(1500);
}

/** Import one kit pressure file through the calibration door (columns guessed by the app). */
export async function importKitFile(d, file, { onCamera = false, hold = 0 } = {}) {
  const a = act(d, onCamera);
  const door = t(d, 'pp-cal-import');
  if (!(await door.isVisible().catch(() => false))) {
    await t(d, 'pp-cal-import-open').scrollIntoViewIfNeeded();
    await a.click(t(d, 'pp-cal-import-open'));
  }
  await t(d, 'pp-cal-import-file').setInputFiles(PRESSURE(file));
  await t(d, 'pp-cal-import-preview').waitFor({ timeout: 20000 });
  if (onCamera) { await d.moveTo(t(d, 'pp-cal-import-preview')); await d.sleep(hold || 1500); }
  await a.click(t(d, 'pp-cal-import-add'));
  await d.sleep(1200);
}

/** Readout at a depth (display unit and frame): {obg, ph, pp, fg} strings. */
export async function readout(d, depth, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.type(t(d, 'pp-readout-depth'), String(depth));
  await d.sleep(500);
  const g = async (id) => ((await t(d, id).innerText()) || '').replace(/\s+/g, ' ').trim();
  return { obg: await g('pp-readout-obg'), ph: await g('pp-readout-ph'), pp: await g('pp-readout-pp'), fg: await g('pp-readout-fg') };
}

/** The dock scrolled so a field sits in view. */
export async function dockTo(d, id) {
  await t(d, id).scrollIntoViewIfNeeded();
  await d.sleep(400);
}

// ---- Well Design Studio: a planned well beside Ekene-1 -------------------------
// "PPS demo: Ekene West": a site at Ekene-1's wellhead (401000 E, 521000 N,
// EPSG:32632), wellbore "Ekene West-1" (KB 82 ft, water 114.8 ft) and a build
// and hold to a target 7,000 ft TVDSS a thousand feet to the north east, so its
// mud window reads the PPS demo copy of Ekene-1 as an offset by subsea depth.
// Only sites named "PPS demo..." are deleted; no other video's site is touched.
export const WEST = { site: 'PPS demo: Ekene West', wellbore: 'Ekene West-1', design: 'Plan 1', target: 'Ekene West TD', e: '401250', n: '521150', tvdssFt: '7000', kop: '1500', rate: '2' };

export async function buildWestSite(d, shared, w = WEST) {
  const W = await import('./wds-common.mjs');
  await W.deleteSites(d, shared, new RegExp(`^${w.site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await W.createSite(d, w.site, { e: '401000', n: '521000' });
  await W.confirmSite(d);
  await W.createWellbore(d, w.site, w.wellbore, { e: '401000', n: '521000' });
  await W.confirmWellbore(d);
  await W.createDesign(d, w.wellbore, w.design);
  await W.tab(d, 'Targets').click(); await d.sleep(1500);
  await W.newTarget(d, { name: w.target, e: w.e, n: w.n, tvdss: w.tvdssFt });
  await W.confirmTarget(d);
  await W.tab(d, 'Design').click(); await d.sleep(1500);
  await W.solveJ(d, w.target, { kop: w.kop, rate: w.rate });
  await W.saveDesign(d);
}

/** Open the West design's section view with the mud window. */
export async function openWestWindow(d, shared, { onCamera = false, w = WEST } = {}) {
  const W = await import('./wds-common.mjs');
  await W.openStudio(d, shared);
  await W.selectDesign(d, w.site, w.wellbore, w.design);
  const view = (name) => d.page.getByRole('button', { name, exact: true }).first();
  const a = act(d, onCamera);
  await a.click(view('Section'));
  await d.sleep(1000);
  await a.click(view('PPFG'));
  await t(d, 'mud-window-panel').waitFor({ timeout: 60000 });
  await d.sleep(2500);
}

/** The prognosis as demo 1 leaves it (off camera): GR picks, Eaton in the shales, the 300 ft line. */
export async function demoOnePrognosis(d) {
  await units(d, { pressure: 'ppg', ref: 'md' });
  await fitNct(d);
  await setParams(d, { 'pp-line-window': '300' });
}
