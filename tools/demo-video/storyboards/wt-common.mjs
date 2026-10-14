// Shared by the Well Test Analysis Studio storyboards (Ekene kit v4, oilfield
// units: ft, psi, STB/D, md).
//
// Three tests, each with a known answer:
//   Ekene-1, February 2025 (the kit, 11-production-engineering): k 225 md,
//     skin 5, infinite acting.
//   Ekene-5, May 2024 (seed/wt_assets.mjs): wellbore storage 0.0025 bbl/psi,
//     the Ekene Growth Fault 533 ft away, partial penetration plus a
//     mechanical skin of 2.0.
//   Ekene-11, March 2027 (seed/wt_assets.mjs): a clean-up, the main flow, four
//     hours choked back for samples, then a buildup, read correctly only on
//     the rate history.
// The videos own the demo user's Well Test projects named "WT demo: ..." and
// "Lesson ...": a setup deletes those it is about to make, and nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';

export { login, expectText };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT = process.env.EKENE_KIT || '/tmp/claude-0/wtv/kit/x/ekene-demo-v4';
export const ASSETS = process.env.WT_ASSETS || '/root/demo-video-work/wt-assets';
export const WT = '/dashboard/apps/reservoir/well-test-analysis-studio';
export const SERIES = 'Well Testing with Petrolord';
export const t = (d, id) => d.page.getByTestId(id);

export const FILES = {
  e1: path.join(KIT, '11-production-engineering/ekene-1-buildup-2025-02.csv'),
  e5: path.join(ASSETS, 'ekene-5-buildup-2024-05.csv'),
  e11: path.join(ASSETS, 'ekene-11-initial-test-2027-03.csv'),
  e11rates: path.join(ASSETS, 'ekene-11-initial-test-rates.csv'),
};

// The typed inputs of each test (the kit's inputs sheets), label pattern -> value
export const INPUTS = {
  e1: {
    setup: [[/^Producing time tp/, '68510'], [/^Flowing pressure at shut-in/, '2086.684']],
    reservoir: [[/^Net thickness h/, '31.50'], [/^Porosity/, '0.2'], [/^Wellbore radius rw/, '0.5104'], [/^Total ct/, '1.2749e-5'],
      [/^Oil FVF B/, '1.2157'], [/^Viscosity/, '1.7962'], [/^Rate q/, '35.88'], [/^Initial pressure pi/, '2112.25']],
  },
  e5: {
    setup: [[/^Producing time tp/, '40581'], [/^Shut-in time on the gauge clock/, '24']],
    reservoir: [[/^Net thickness h/, '21.00'], [/^Porosity/, '0.2'], [/^Wellbore radius rw/, '0.5104'], [/^Total ct/, '1.2749e-5'],
      [/^Oil FVF B/, '1.2158'], [/^Viscosity/, '1.7938'], [/^Rate q/, '47.60'], [/^Initial pressure pi/, '2101.85']],
    completion: [[/^Perforations top, MD/, '5091.9'], [/^Perforations base, MD/, '5105.0'], [/^Top of net pay, MD/, '5091.9']],
  },
  e11: {
    setup: [[/^Shut-in time on the gauge clock/, '21.5']],
    reservoir: [[/^Net thickness h/, '16.74'], [/^Porosity/, '0.2'], [/^Wellbore radius rw/, '0.5104'], [/^Total ct/, '1.2751e-5'],
      [/^Oil FVF B/, '1.2155'], [/^Viscosity/, '1.7988'], [/^Rate q/, '40'], [/^Initial pressure pi/, '2123.45']],
    completion: [[/^Perforations top, MD/, '5364.5'], [/^Perforations base, MD/, '5377.3'], [/^Perforations top, TVD/, '5097.2'],
      [/^Perforations base, TVD/, '5109.0'], [/^Top of net pay, MD/, '5364.5'], [/^Top of net pay, TVD/, '5097.2']],
    rates: [['0', '40'], ['4', '0'], ['5', '100'], ['17', '40'], ['21', '0']],
  },
};

export const wtLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: SERIES,
  eyebrow: `${SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

// ---- the demo user's Well Test projects (setups only, never on camera) -------
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

/** Delete the demo user's Well Test projects with exactly these names (only "WT demo: " or "Lesson " ones). */
export async function deleteProjects(shared, names) {
  const own = names.filter((n) => /^(WT demo: |Lesson )/.test(n));
  if (!own.length) return;
  const c = await sb(shared);
  const { data: me } = await c.auth.getUser();
  const { error } = await c.from('saved_well_test_projects').delete().eq('user_id', me.user.id).in('project_name', own);
  if (error) throw new Error(`could not delete Well Test projects: ${error.message}`);
}

/** The demo user's Well Test projects (for checks). */
export async function listProjects(shared) {
  const c = await sb(shared);
  const { data } = await c.from('saved_well_test_projects').select('id,project_name,inputs_data');
  return data || [];
}

// ---- driving the studio ---------------------------------------------------------
const act = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => {
    if (onCamera) await d.type(l, v);
    else { await l.click(); await l.fill(String(v)); }
    await l.blur();
  },
});
export { act };

export async function openStudio(d, shared, { tab = null } = {}) {
  await d.page.goto(`${shared.baseUrl}${WT}${tab ? `?tab=${tab}` : ''}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByRole('tab', { name: 'Data' }).waitFor({ timeout: 120000 });
  await d.sleep(2500);
}

export const field = (d, label) => d.page.getByLabel(label).first();
export async function fill(d, rows, { onCamera = false, pause = 250 } = {}) {
  const a = act(d, onCamera);
  for (const [label, v] of rows) {
    const l = field(d, label);
    if (onCamera) await l.scrollIntoViewIfNeeded();
    await a.type(l, v);
    if (onCamera) await d.sleep(pause);
  }
}

/** A Radix select by its aria-label, then the option. */
export async function pick(d, aria, option, { onCamera = false } = {}) {
  const trigger = d.page.getByLabel(aria).first();
  if (onCamera) { await trigger.scrollIntoViewIfNeeded(); await d.click(trigger); await d.sleep(500); } else await trigger.click();
  const opt = d.page.getByRole('option', { name: option }).first();
  if (onCamera) { await d.moveTo(opt); await d.sleep(300); await d.click(opt); } else await opt.click();
  await d.sleep(400);
}

export async function tab(d, name, { onCamera = false } = {}) {
  const l = d.page.getByRole('tab', { name });
  if (onCamera) await d.click(l); else await l.click();
  await d.sleep(1500);
}

/** Import a gauge file; on camera the cursor goes to the button first. */
export async function importGauge(d, file, { onCamera = false } = {}) {
  const btn = d.page.getByRole('button', { name: /Import CSV/ }).first();
  if (onCamera) { await btn.scrollIntoViewIfNeeded(); await d.moveTo(btn); await d.sleep(600); }
  await d.page.locator('input[type=file]').first().setInputFiles(file);
  await d.page.getByTestId('wts-import-mapping').waitFor({ timeout: 60000 });
  await d.sleep(1500);
}

export async function newProject(d, name) {
  await d.page.getByRole('button', { name: 'Create new project' }).first().click();
  await d.page.getByLabel('Project name').fill(name);
  await d.page.getByLabel('Project name').press('Enter');
  await d.page.getByText(`Project "${name}" created`).first().waitFor({ timeout: 60000 });
  await d.sleep(1000);
}

export async function rateRows(d, rows, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  for (let i = 0; i < rows.length; i += 1) {
    const add = d.page.getByRole('button', { name: /Add rate step/ });
    if (onCamera) { await add.scrollIntoViewIfNeeded(); await d.click(add); } else await add.click();
    await a.type(d.page.getByLabel(`Start time, step ${i + 1} (hr)`), rows[i][0]);
    await a.type(d.page.getByLabel(`Rate, step ${i + 1}`), rows[i][1]);
  }
}

/** The value of a Kpi card by its title (first match). */
export function kpi(d, title) {
  return d.page.locator('div.uppercase', { hasText: new RegExp(`^${title}$`, 'i') }).first().locator('xpath=following-sibling::div[1]');
}
/** A right-rail row value by its label. */
export function railRow(d, label) {
  return d.page.locator('div.flex.justify-between.text-xs', { has: d.page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).first().locator('span').nth(1);
}

export const mainArea = (d) => d.page.getByTestId('wts-theme-scope').getByRole('main');
export async function scrollMain(d, to, { ms = 900 } = {}) {
  await mainArea(d).evaluate((el, [y, dur]) => el.scrollTo({ top: y, behavior: dur ? 'smooth' : 'auto' }), [to, ms]);
  await d.sleep(ms + 200);
}
export async function scrollIntoMain(d, target) {
  await target.scrollIntoViewIfNeeded();
  await d.sleep(800);
}

/**
 * Set up a test off camera: a new project with the test's inputs, the gauge
 * file and (Ekene-11) the rate history. Options pick what is left for camera.
 */
export async function setupTest(d, shared, { name, test, gauge = true, inputs = true, completion = true, rates = true, basis = null, tabName = null }) {
  d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
  await login(d.page, shared.baseUrl, shared.env);
  await deleteProjects(shared, [name]);
  await openStudio(d, shared);
  if (name) await newProject(d, name);
  const I = INPUTS[test];
  await pick(d, 'Test type', 'Pressure buildup');
  if (inputs) await fill(d, I.setup);
  if (gauge) await importGauge(d, FILES[test]);
  if (inputs) await fill(d, I.reservoir);
  if (completion && I.completion) await fill(d, I.completion);
  if (rates && I.rates) await rateRows(d, I.rates);
  if (basis) await pick(d, 'Buildup time basis', basis);
  await d.sleep(1000);
  if (tabName) await tab(d, tabName);
  await scrollMain(d, 0, { ms: 0 });
  await d.page.evaluate(() => window.__demo?.moveTo(900, 500, 10));
}

/** expectText for an input's value (LENIENT=1 logs instead of stopping). */
export async function expectValue(d, target, re, what) {
  let v = '';
  for (let i = 0; i < 40; i += 1) { v = await target.inputValue().catch(() => ''); if (re.test(v)) return; await d.sleep(500); }
  const msg = `Narration mismatch at "${what}": expected ${re}, input shows "${v}"`;
  if (process.env.LENIENT) console.log(`MISMATCH ${msg}`); else throw new Error(msg);
}
