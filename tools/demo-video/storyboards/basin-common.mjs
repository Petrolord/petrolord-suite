// Shared by the Basin & Charge Modeling storyboards (Ekene kit v4 plus the
// basin files made by seed/basin_assets.mjs, oilfield units: ft and F).
// Ekene-1 comes from the registry (its tops, untouched) dated by the column
// file; the East kitchen is a pseudo-well read from its column file. The
// videos only save models named "Basin demo: ..." or "Lesson ...", and the
// setups delete those before a take. Nothing here writes to the registry.
//
// Truth (basin-truth.json): heat flow 58.5 mW/m2 at Ekene-1 (Horner BHTs
// 172.6, 196.1 and 226.3 F; Ro 0.63 % at TD); in the kitchen the Upper Akata
// (Pepper and Corvi B, TOC 2.4, HI 330) expels oil from about 12 Ma, the
// Lower Akata (F, TOC 2.2, HI 220) gas; Ekene (formed 12 Ma) takes 37.5
// MMboe, 3.1 times its 12.14 MMstb, factor 0.9; Oboro (16 Ma) 14.3 MMboe
// (85.2 Bcf), 1.4 times its 60 Bcf, factor 0.7.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { login } from '../lib/session.mjs';

export { login };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BF = '/dashboard/apps/geoscience/basinflow-genesis';
export const ASSETS = process.env.BF_ASSETS || '/root/demo-video-work/bf-assets';
export const asset = (f) => path.join(ASSETS, f);
export const FIXTURES = path.join(HERE, 'basin-fixtures');
export const EK1 = 'Basin demo: Ekene-1';
export const KITCHEN = 'Basin demo: Ekene East kitchen';

export const t = (d, id) => d.page.getByTestId(id);

export async function expectText(d, target, re, what) {
  try { await d.waitText(target, re, { timeout: 30000 }); } catch (e) {
    const shown = await d.text(target).catch(() => '?');
    if (process.env.LENIENT) { console.log(`MISMATCH ${what}: ${shown.slice(0, 400)}`); return; }
    throw new Error(`Narration mismatch at "${what}": expected ${re}, screen shows "${shown.slice(0, 400)}"`);
  }
}

export const maybe = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, String(v)); else { await l.click(); await l.fill(String(v)); await l.press('Tab'); } },
  select: async (l, v) => { if (onCamera) await d.select(l, v); else await l.selectOption(v); },
});

// ---- the demo account's own basin models (off camera) ------------------------
async function client(shared) {
  const { createClient } = await import('@supabase/supabase-js');
  const key = shared.env.DEMO_SUPABASE_ANON_KEY || process.env.DEMO_SUPABASE_ANON_KEY
    || fs.readFileSync(process.env.SUPABASE_ANON_KEY_FILE || '/tmp/claude-0/bfv/anon.key', 'utf8').trim();
  const sb = createClient('https://ssyckywijlrkgcwvkwlr.supabase.co', key, { auth: { persistSession: false } });
  const { data } = await sb.auth.signInWithPassword({ email: shared.env.DEMO_EMAIL, password: shared.env.DEMO_PASSWORD });
  return { sb, uid: data.user.id };
}

/** Delete the demo account's basin models whose name matches (its own rows only). */
export async function deleteModels(shared, re) {
  const { sb, uid } = await client(shared);
  const { data } = await sb.from('bf_wells').select('id,name,user_id');
  for (const r of data || []) if (r.user_id === uid && re.test(r.name)) await sb.from('bf_wells').delete().eq('id', r.id);
}

/** A saved model from a fixture (captured from the app), under a new name; replaces one of that name. */
export async function seedModel(shared, fixture, name, patch = {}) {
  const { sb, uid } = await client(shared);
  const row = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${fixture}.json`), 'utf8'));
  await sb.from('bf_wells').delete().eq('user_id', uid).eq('name', name);
  const now = new Date().toISOString();
  const out = { ...row, ...patch, id: crypto.randomUUID(), user_id: uid, name, created_at: now, updated_at: now };
  for (const k of ['organization_id', 'version', 'updated_by', 'editing_by', 'editing_since', 'editing_expires', 'visibility', 'org_access', 'change_note']) delete out[k];
  const { error } = await sb.from('bf_wells').insert([out]);
  if (error) throw new Error(`seed ${name}: ${error.message}`);
  return out.id;
}

/** Dump a saved model to a fixture (used once, to capture what the app built). */
export async function dumpModel(shared, name, fixture) {
  const { sb } = await client(shared);
  const { data } = await sb.from('bf_wells').select('*').eq('name', name).limit(1);
  if (!data?.length) throw new Error(`no model ${name}`);
  fs.mkdirSync(FIXTURES, { recursive: true });
  const row = { ...data[0] };
  for (const k of ['id', 'user_id', 'created_at', 'updated_at', 'organization_id', 'version', 'updated_by', 'editing_by', 'editing_since', 'editing_expires']) delete row[k];
  fs.writeFileSync(path.join(FIXTURES, `${fixture}.json`), `${JSON.stringify(row, null, 1)}\n`);
}

// ---- the app -------------------------------------------------------------------
/** The welcome screen. */
export async function openBf(d, shared) {
  await d.page.goto(`${shared.baseUrl}${BF}`, { waitUntil: 'domcontentloaded' });
  await t(d, 'bf-mode-expert').waitFor({ timeout: 120000 });
  await d.sleep(1500);
}

/** Expert mode with the model list loaded. */
export async function enterExpert(d, { onCamera = false } = {}) {
  await maybe(d, onCamera).click(t(d, 'bf-mode-expert'));
  await t(d, 'bf-well-row').first().waitFor({ timeout: 60000 });
  await d.sleep(1500);
}

export const wellRow = (d, name) => d.page.getByTestId('bf-well-row').filter({ hasText: name });

/** Open a saved model from the list. */
export async function openModel(d, name, { onCamera = false } = {}) {
  await maybe(d, onCamera).click(wellRow(d, name).first());
  await d.page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="bf-well-row"]')].some((e) => e.dataset.wellName === n && e.dataset.active === 'true'), name, { timeout: 15000 });
  await d.sleep(1500);
}

/** A new model through the + dialog (it opens). */
export async function newModel(d, name, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await m.click(t(d, 'bf-new-well'));
  await t(d, 'bf-new-well-name').waitFor();
  await m.type(t(d, 'bf-new-well-name'), name);
  await m.click(t(d, 'bf-new-well-create'));
  await wellRow(d, name).first().waitFor({ timeout: 20000 });
  await d.sleep(2500);
}

export async function tab(d, id, { onCamera = false } = {}) {
  await maybe(d, onCamera).click(t(d, `bf-tab-${id}`));
  await d.sleep(800);
}

/** Import tab, Registry well: Ekene-1 dated by its column file. */
export async function importEkene1(d, { onCamera = false, apply = true } = {}) {
  const m = maybe(d, onCamera);
  await tab(d, 'import', { onCamera });
  await m.click(t(d, 'bf-import-tab-registry'));
  await t(d, 'bf-registry-well').waitFor();
  const v = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-registry-well"] option')].find((o) => /^Ekene-1 \(/.test(o.textContent))?.value);
  await m.select(t(d, 'bf-registry-well'), v);
  await t(d, 'bf-registry-preview').waitFor();
  await d.sleep(800);
  await t(d, 'bf-import-input-registry-column').setInputFiles(asset('ekene-1-basin-column.csv'));
  await t(d, 'bf-registry-column-file').waitFor();
  await d.sleep(1000);
  if (apply) { await m.click(t(d, 'bf-registry-apply')); await d.sleep(1500); }
}

/** Import tab, Calibration data: a file whose depths are MD below KB. */
export async function importCalibration(d, file, { onCamera = false, mode = 'replace' } = {}) {
  const m = maybe(d, onCamera);
  await tab(d, 'import', { onCamera });
  await m.click(t(d, 'bf-import-tab-calibration'));
  if (await t(d, 'bf-import-clear-calibration').count()) await t(d, 'bf-import-clear-calibration').click();
  await t(d, 'bf-import-input-calibration').setInputFiles(asset(file));
  await t(d, 'bf-import-preview-calibration').waitFor();
  await d.sleep(800);
  await m.select(t(d, 'bf-import-cal-datum'), 'kb');
  await d.sleep(800);
  await m.click(t(d, mode === 'append' ? 'bf-import-apply-calibration-append' : 'bf-import-apply-calibration'));
  await d.sleep(1200);
}

/** Import tab, Formation tops: a column file with depths (the kitchen). */
export async function importColumn(d, file, { onCamera = false, apply = true } = {}) {
  const m = maybe(d, onCamera);
  await tab(d, 'import', { onCamera });
  await m.click(t(d, 'bf-import-tab-tops'));
  if (await t(d, 'bf-import-clear-tops').count()) await t(d, 'bf-import-clear-tops').click();
  await t(d, 'bf-import-input-tops').setInputFiles(asset(file));
  await t(d, 'bf-import-preview-tops').waitFor();
  await d.sleep(1000);
  if (apply) { await m.click(t(d, 'bf-import-apply-tops')); await d.sleep(1500); }
}

/** Properties tab, Global History, Thermal: surface temperature (F) and a constant heat flow. */
export async function thermal(d, { surfaceF = null, hf = null, onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await tab(d, 'properties', { onCamera });
  await t(d, 'bf-history-tab-thermal').click();
  if (surfaceF != null) { await t(d, 'bf-surface-temp').scrollIntoViewIfNeeded(); await m.type(t(d, 'bf-surface-temp'), surfaceF); await d.page.keyboard.press('Tab'); }
  if (hf != null) { await t(d, 'bf-heatflow-value').scrollIntoViewIfNeeded(); await m.type(t(d, 'bf-heatflow-value'), hf); await d.page.keyboard.press('Tab'); }
  await d.sleep(600);
}

/** Simulate and land on the Analysis tab. */
export async function simulate(d, { onCamera = false } = {}) {
  await maybe(d, onCamera).click(t(d, 'bf-simulate'));
  const view = d.page.getByRole('button', { name: 'View Results' });
  await view.waitFor({ timeout: 180000 });
  await d.sleep(onCamera ? 1500 : 300);
  await maybe(d, onCamera).click(view);
  await t(d, 'bf-results-tab-summary').waitFor({ timeout: 30000 });
  await d.sleep(1200);
}

export async function resultsTab(d, id, { onCamera = false } = {}) {
  await maybe(d, onCamera).click(t(d, `bf-results-tab-${id}`));
  await d.sleep(1500);
}

/** The trap table row for a trap (0 Ekene, 1 Oboro on the traps file). */
export const trapCell = (d, kind, i) => t(d, `bf-trap-${kind}-${i}`);

/** A layer's card in Properties (the name is an input, so match the data attribute). */
export const layerCard = (d, name) => d.page.locator(`[data-testid="bf-layer-card"][data-layer-name="${name}"]`).first();
