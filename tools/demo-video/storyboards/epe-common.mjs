// Shared by the Petroleum Economics Studio storyboards (Ekene kit v4,
// 12-economics). The field: four producers since 2020, Ekene-11 planned for
// first oil in April 2027 (the Well Design Studio well), USD 75/bbl flat,
// associated gas earns nothing, PIA 2021 in shallow water (35 m, 115 ft),
// valued at 1 January 2026 with 2020 to 2025 shown as sunk history.
// Cases the videos make are named "EPE demo ..." or "Lesson ..." and the
// setups delete them (through the API, signed in as the demo user: the app
// archives cases and has no delete). No other video's data is touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';

export { login, expectText };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EPE = '/dashboard/apps/economics/epe/cases';
export const KIT_DIR = process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4';
export const ECON = path.join(KIT_DIR, '12-economics');
/** seed/epe_assets.mjs writes the "without Ekene-11" files here. */
export const ASSETS = process.env.EPE_ASSETS || '/root/demo-video-work/epe-assets';
export const FILES = {
  prod: path.join(ECON, 'ekene-production-2p.csv'),
  capex: path.join(ECON, 'ekene-capex.csv'),
  opex: path.join(ECON, 'ekene-opex.csv'),
  prodNo11: path.join(ASSETS, 'ekene-production-2p-without-ekene-11.csv'),
  opexNo11: path.join(ASSETS, 'ekene-opex-without-ekene-11.csv'),
  fieldNo11: path.join(ASSETS, 'ekene-production-field-without-ekene-11.csv'),
};
/** Every case the EPE videos make (a setup clears them all). */
export const ALL_VIDEO_CASES = /^(EPE demo|EPE probe|Lesson [A-D]\d+)/;
const SLOT = { prod: 0, capex: 1, opex: 2 };
const DROP = { prod: 'Drop Production CSV here', capex: 'Drop CAPEX CSV here', opex: 'Drop OPEX CSV here' };

export const t = (d, id) => d.page.getByTestId(id);
export const dialog = (d) => d.page.getByRole('dialog').last();
const act = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, String(v)); else { await l.click(); await l.fill(String(v)); } },
  select: (l, v) => (onCamera ? d.select(l, v) : l.selectOption(v)),
});

// ---------------------------------------------------------------- database
let client = null;
/** A Supabase client signed in as the demo user (URL and anon key from the app's own client file). */
export async function db(shared) {
  if (client) return client;
  const src = fs.readFileSync(path.resolve(HERE, '../../../src/lib/customSupabaseClient.js'), 'utf8');
  const url = src.match(/supabaseUrl = '([^']+)'/)[1];
  const key = src.match(/supabaseAnonKey = '([^']+)'/)[1];
  client = createClient(url, key, { auth: { persistSession: false } });
  const r = await client.auth.signInWithPassword({ email: shared.env.DEMO_EMAIL, password: shared.env.DEMO_PASSWORD });
  if (r.error) throw new Error(`demo sign-in: ${r.error.message}`);
  return client;
}
/** Delete the demo user's own EPE cases whose names match (runs, files and results go with them). */
export async function deleteCases(shared, re = ALL_VIDEO_CASES) {
  const sb = await db(shared);
  const { data: me } = await sb.auth.getUser();
  const { data, error } = await sb.from('epe_cases').select('id, case_name, user_id').eq('user_id', me.user.id);
  if (error) throw new Error(`listing cases: ${error.message}`);
  for (const c of data.filter((x) => re.test(x.case_name))) {
    const r = await sb.from('epe_cases').delete().eq('id', c.id);
    if (r.error) throw new Error(`deleting ${c.case_name}: ${r.error.message}`);
  }
}
/** The id of the demo user's case with this name, or null. */
export async function caseId(shared, name) {
  const sb = await db(shared);
  const { data } = await sb.from('epe_cases').select('id').eq('case_name', name).order('created_at', { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}
/** The newest complete run of a case with this name (id), or null. */
export async function runId(shared, caseName, runName) {
  const sb = await db(shared);
  const cid = await caseId(shared, caseName);
  if (!cid) return null;
  const { data } = await sb.from('epe_runs').select('id').eq('case_id', cid).eq('run_name', runName).order('created_at', { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

// ---------------------------------------------------------------- navigation
export async function openCases(d, shared) {
  await d.page.goto(`${shared.baseUrl}${EPE}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByRole('button', { name: /New Case/ }).first().waitFor({ timeout: 90000 });
  await d.sleep(2000);
}
export async function openCase(d, shared, name) {
  const id = await caseId(shared, name);
  if (!id) throw new Error(`no case "${name}"`);
  await d.page.goto(`${shared.baseUrl}${EPE}/${id}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByText('Production Volumes').first().waitFor({ timeout: 90000 });
  await d.sleep(2500);
  return id;
}
export async function openRun(d, shared, caseName, runName) {
  const id = await runId(shared, caseName, runName);
  if (!id) throw new Error(`no run "${runName}" in "${caseName}"`);
  await d.page.goto(`${shared.baseUrl}/dashboard/apps/economics/epe/runs/${id}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByText(/^NPV @/).first().waitFor({ timeout: 90000 });
  await d.sleep(3000);
  return id;
}

// ---------------------------------------------------------------- cases and files
export async function newCase(d, name, description = '', { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('button', { name: /New Case/ }).first());
  const dlg = dialog(d);
  await dlg.getByText('Create New Economic Case').waitFor();
  await d.sleep(500);
  await a.type(dlg.locator('#name'), name);
  if (description) await a.type(dlg.locator('#description'), description);
  await d.sleep(400);
  await a.click(dlg.getByRole('button', { name: 'Create Case' }));
  await d.page.waitForURL(/cases\/[0-9a-f-]{36}$/, { timeout: 30000 });
  await d.page.getByText('Production Volumes').first().waitFor({ timeout: 60000 });
  await d.sleep(2000);
}

/** Upload a CSV into a slot: the cursor goes to the drop zone, the file is set, the preview shows, then Confirm Upload. */
export async function upload(d, slot, file, { tag = null, onCamera = false, replace = null, hold = 0, beforeConfirm = null } = {}) {
  const p = d.page;
  const zone = p.getByText(DROP[slot]).first();
  if (onCamera) { await zone.scrollIntoViewIfNeeded(); await d.moveTo(zone); await d.sleep(400); }
  await p.locator('input[type=file]').nth(SLOT[slot]).setInputFiles(file);
  const confirm = p.getByRole('button', { name: 'Confirm Upload' }).first();
  await confirm.waitFor({ timeout: 30000 });
  await d.sleep(800);
  if (tag) {
    const sel = p.locator('select').filter({ has: p.locator(`option[value="${tag}"]`) }).first();
    await act(d, onCamera).select(sel, tag);
  }
  if (replace !== null) {
    const box = p.locator('label', { hasText: /^Replace the/ }).locator('input[type=checkbox]').first();
    if ((await box.count()) && (await box.isChecked()) !== replace) await act(d, onCamera).click(box);
  }
  if (beforeConfirm) await beforeConfirm(d);
  if (hold) await d.sleep(hold);
  await act(d, onCamera).click(confirm);
  await p.getByText(/Processed •/).nth(0).waitFor({ timeout: 60000 });
  await d.sleep(2500);
}
export const fileCard = (d, name) => d.page.locator('div.bg-pl-surface.border', { has: d.page.locator(`p.truncate:text-is("${name}")`) }).first();

// ---------------------------------------------------------------- Run Console
/** The kit's Run Console settings (12-economics/epe-case-inputs.csv). */
export const KIT_CONSOLE = {
  scenario: '2P', oil: '75', gas: '0', discount: '10', inflation: '0', base: '2026', valuation: '2026',
  sunk: true, limit: true, abandonment: '6800000', regime: 'PIA', waterDepthM: '35', waterDepthFt: '114.8',
};
export async function openConsole(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(d.page.getByRole('button', { name: 'New Run' }).first());
  await d.page.locator('#runName').waitFor({ timeout: 60000 });
  await d.sleep(2000);
}
const field = (d, id) => d.page.locator(`#${id}`);
/** Fill the console. `only` limits it to some keys (for a step that types a few on camera). */
export async function fillConsole(d, cfg, { onCamera = false, only = null, runName = null } = {}) {
  const a = act(d, onCamera);
  const want = (k) => cfg[k] != null && (!only || only.includes(k));
  const num = async (id, v) => { const l = field(d, id); await l.scrollIntoViewIfNeeded(); await a.type(l, v); };
  if (runName && (!only || only.includes('runName'))) await a.type(field(d, 'runName'), runName);
  if (want('scenario')) await a.select(field(d, 'production_scenario'), cfg.scenario);
  if (want('oil')) await num('oil_price_usd_bbl', cfg.oil);
  if (want('gas')) await num('gas_price_usd_mscf', cfg.gas);
  if (want('discount')) await num('discount_rate_pct', cfg.discount);
  if (want('inflation')) await num('inflation_rate_pct', cfg.inflation);
  if (want('base')) await num('base_year', cfg.base);
  if (want('valuation')) await num('valuation_year', cfg.valuation);
  if (want('sunk')) {
    const box = d.page.getByLabel('Treat years before valuation as sunk');
    if ((await box.isChecked()) !== cfg.sunk) await a.click(box);
  }
  if (want('limit')) {
    const box = field(d, 'apply_economic_limit');
    if ((await box.isChecked()) !== cfg.limit) await a.click(box);
  }
  if (want('abandonment')) await num('abandonment_cost_usd', cfg.abandonment);
  if (want('regime')) {
    const label = { PIA: 'PIA 2021 (Nigeria)', JV: 'Joint Venture (JV)', PSC: 'Production Sharing (PSC)' }[cfg.regime];
    const b = d.page.getByRole('button', { name: label });
    await b.scrollIntoViewIfNeeded();
    await a.click(b);
    await d.sleep(600);
  }
  if (want('waterDepthM')) {
    // feet on the Oilfield preset once the field follows the unit profile (#1082)
    const ft = await d.page.locator('label[for=pia_water_depth_m]').innerText().then((x) => /\(ft\)/.test(x)).catch(() => false);
    await num('pia_water_depth_m', ft && cfg.waterDepthFt ? cfg.waterDepthFt : cfg.waterDepthM);
  }
}
/** Press Run Economic Analysis and wait for the results page. */
export async function runAnalysis(d, { onCamera = false } = {}) {
  const b = d.page.getByRole('button', { name: 'Run Economic Analysis' });
  await b.scrollIntoViewIfNeeded();
  await act(d, onCamera).click(b);
  await d.page.waitForURL(/\/epe\/runs\//, { timeout: 180000 });
  await d.page.getByText(/^NPV @/).first().waitFor({ timeout: 90000 });
  await d.sleep(2500);
}

/** Off camera: a whole case through the UI (so every run goes through the engine). */
export async function seedCase(d, shared, name, { files, description = '', runs = [] } = {}) {
  await openCases(d, shared);
  await newCase(d, name, description);
  for (const [slot, file, tag] of files) await upload(d, slot, file, { tag });
  for (const r of runs) {
    await openCase(d, shared, name);
    await openConsole(d);
    await fillConsole(d, r.cfg, { runName: r.name });
    await runAnalysis(d);
  }
}

// ---------------------------------------------------------------- results
/** A headline KPI card by its label ("NPV @", "IRR", "Payback", ...). */
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const kpi = (d, label) => d.page.locator('div', { has: d.page.locator('p').filter({ hasText: new RegExp(`^${reEsc(label)}`, 'i') }) }).filter({ hasNot: d.page.locator('div.grid') }).last();
export const resultsTab = (d, name) => d.page.getByText(name, { exact: true }).first();
export async function showTab(d, name, { onCamera = true } = {}) {
  const b = resultsTab(d, name);
  await b.scrollIntoViewIfNeeded();
  if (onCamera) await d.click(b); else await b.click();
  await d.sleep(1500);
  await b.evaluate((el) => el.closest('div.rounded-2xl, section, div')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await d.sleep(1200);
}
export const bodyText = async (d) => (await d.page.locator('body').innerText()).replace(/\s+/g, ' ');

// ---------------------------------------------------------------- Forecast Scenario Hub
export const HUB = '/dashboard/apps/reservoir/forecast-scenario-hub';
export const HUB_SET = 'EPE demo: Ekene-11 forecast';
/** Ekene-11 as the kit forecasts it (12-economics/README.md): first oil 1 April
 *  2027, hyperbolic qi 450 bopd, Di 0.0015 per day nominal (54.79 %/yr of
 *  365.25 days), b 0.5, to 10 bopd. */
export const EKENE11_CASE = {
  id: 'ekene-11', name: 'Ekene-11', qi: 450, declineAnnualPct: 54.79, declineBasis: 'nominal', b: 0.5,
  years: 21, economicLimit: 10, startDate: '2027-04-01',
};
/** Write (or rewrite) a scenario set under the demo user, the shape the hub saves. */
export async function seedHubSet(shared, name = HUB_SET, cases = [EKENE11_CASE]) {
  const sb = await db(shared);
  const { data: me } = await sb.auth.getUser();
  await sb.from('saved_scenario_hub_projects').delete().eq('user_id', me.user.id).eq('project_name', name);
  const payload = {
    name, cases, schema: 2, startDate: '2027-04-01',
    econ: { pricePerBbl: 75, opexPerBbl: 4, discountRatePct: 10 },
    identification: { field: 'Ekene', analyst: 'Reservoir engineering' },
  };
  const r = await sb.from('saved_scenario_hub_projects').insert({ user_id: me.user.id, project_name: name, inputs_data: payload, updated_at: new Date().toISOString() }).select('id').single();
  if (r.error) throw new Error(`hub set: ${r.error.message}`);
  return r.data.id;
}

/** Import a hub case into the production slot (the dialog), untagged (Base). */
export async function importFromHub(d, { set = HUB_SET, caseName = 'Ekene-11', year = '2027', replace = false, onCamera = false, hold = 0 } = {}) {
  const a = act(d, onCamera);
  const p = d.page;
  const btn = p.getByRole('button', { name: 'Import from Forecast Scenario Hub' });
  await btn.scrollIntoViewIfNeeded();
  await a.click(btn);
  const dlg = dialog(d);
  await dlg.getByText('Import from Forecast Scenario Hub').first().waitFor();
  const setSel = dlg.locator('select').first();
  await setSel.locator('option', { hasText: set }).first().waitFor({ state: 'attached', timeout: 30000 });
  const setVal = await setSel.locator('option', { hasText: set }).first().getAttribute('value');
  await a.select(setSel, setVal);
  await d.sleep(500);
  const caseSel = dlg.locator('select').nth(1);
  const caseVal = await caseSel.locator('option', { hasText: caseName }).first().getAttribute('value');
  await a.select(caseSel, caseVal);
  await a.type(dlg.locator('input[type=number]').first(), year);
  const box = dlg.locator('label', { hasText: /^Replace the/ }).locator('input[type=checkbox]').first();
  if ((await box.count()) && (await box.isChecked()) !== replace) await a.click(box);
  if (hold) await d.sleep(hold);
  await a.click(dlg.getByRole('button', { name: 'Import profile' }));
  await p.getByRole('dialog').waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(2500);
}

/** From a results page, Re-run with edits (the console opens on that run's config). */
export async function rerunWithEdits(d, { onCamera = false, runName = null } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('button', { name: /Re-run with edits/ }).first());
  await d.page.locator('#runName').waitFor({ timeout: 60000 });
  await d.sleep(2500);
  if (runName) await a.type(d.page.locator('#runName'), runName);
}
/** Add yearly price deck rows: [[year, oil], ...]. */
export async function addDeck(d, rows, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  const add = d.page.getByRole('button', { name: 'Add year' });
  await add.scrollIntoViewIfNeeded();
  for (const [year, oil] of rows) {
    await a.click(add);
    await d.sleep(300);
    const row = d.page.locator('table tbody tr').last();
    await a.type(row.locator('input').nth(0), year);
    await a.type(row.locator('input').nth(1), oil);
  }
}
/** The results page's one-line KPI text (for checks). */
export const headline = async (d) => (await d.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900);
