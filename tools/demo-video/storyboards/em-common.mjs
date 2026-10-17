// Shared by the Earth Modeling storyboards (Ekene kit v4, oilfield units).
// The model is built from the booked six-well maps already in the registry
// ("Ekene Sand top/base (6-well map)", seed/rcp.mjs), the Ekene wells and
// their tops, and the PHIE, VSH, SW and KPERM curves Petrophysics Studio
// published on Ekene-1 to Ekene-4. Nothing here changes registry data: the
// videos only save models named "EM demo: ..." or "Lesson ...", and the
// setups delete those before a take.
// 3D grid upgrade (2026-10-17): a new model is a fine grid (25 m cells, 2.5 ft
// layers, porosity by sequential Gaussian simulation); the Ekene Sand splits at
// the "Ekene Sand Middle" and "Ekene Sand Lower" tops (added to the demo wells
// on 2026-10-17) into Upper, Middle and Lower, under a 50 ft cap.
// The booked case (ReservoirCalc Pro, rcp-01): OWC 5,036.1 ft TVDSS,
// NTG 0.8, porosity 0.2, Sw 0.35, Bo 1.2 = GRV 18,058 acre-ft over 418 acres,
// STOIIP 12.14 MMstb.
import { login } from '../lib/session.mjs';

export { login };
export const EM = '/dashboard/apps/geoscience/earth-modeling';
export const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';
export const TOP = 'Ekene Sand top (6-well map)';
export const BASE = 'Ekene Sand base (6-well map)';
export const OWC_FT = '5036.1';
export const BO = '1.2';
export const BOOKED = { phi: '0.2', sw: '0.35', ntg: '0.8' };
export const DEMO_MODEL = 'EM demo: Ekene static model';

export const t = (d, id) => d.page.getByTestId(id);

export async function expectText(d, target, re, what) {
  try { await d.waitText(target, re, { timeout: 30000 }); } catch (e) {
    const shown = await d.text(target).catch(() => '?');
    if (process.env.LENIENT) { console.log(`MISMATCH ${what}: ${shown.slice(0, 400)}`); return; }
    throw new Error(`Narration mismatch at "${what}": expected ${re}, screen shows "${shown.slice(0, 400)}"`);
  }
}

/** Earth Modeling open on an empty workspace. */
export async function openEm(d, shared) {
  await d.page.goto(`${shared.baseUrl}${EM}`, { waitUntil: 'domcontentloaded' });
  await t(d, 'em-explorer').waitFor({ timeout: 120000 });
  await t(d, `em-add-${TOP}`).waitFor({ timeout: 120000 });
  await d.sleep(2500);
}

const maybe = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
  select: async (l, v) => { if (onCamera) await d.select(l, v); else await l.selectOption(v); },
});

/** Stack the two booked maps (ties and the zone fill in by name). */
export async function stackEkene(d, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await m.click(t(d, `em-add-${TOP}`));
  await d.sleep(500);
  await m.click(t(d, `em-add-${BASE}`));
  await d.sleep(800);
}

/** The contact and Bo of zone 0. */
export async function fluids(d, { owc = OWC_FT, bo = BO, onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await t(d, 'em-owc-0').scrollIntoViewIfNeeded();
  await m.type(t(d, 'em-owc-0'), owc);
  await m.type(t(d, 'em-bo-0'), bo);
}

export async function methods(d, { phi, sw, ntg }, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  for (const [k, v] of Object.entries({ phi, sw, ntg })) {
    if (!v) continue;
    const sel = t(d, `em-method-${k}`);
    await sel.scrollIntoViewIfNeeded();
    if ((await sel.inputValue()) !== v) await m.select(sel, v);
  }
}

export async function typedBooked(d, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  for (const k of ['phi', 'sw', 'ntg']) await m.type(t(d, `em-typed-${k}-0`), BOOKED[k]);
}

/** Build and wait for "Built ..." in the status bar. */
export async function build(d, { onCamera = false, timeout = 180000 } = {}) {
  if (onCamera) await d.click('em-build'); else await t(d, 'em-build').click();
  await d.page.waitForFunction(() => /^Built /.test(document.querySelector('[data-testid="em-status"]')?.textContent || ''), null, { timeout });
  await d.sleep(800);
}

export const zoneSlug = 'ekene-sand';
export const vol = (d, block, col) => t(d, `em-vol-${zoneSlug}-${block}-${col}`);

/** Delete saved models whose name matches (off camera). */
export async function deleteModels(shared, re) {
  const { createClient } = await import('@supabase/supabase-js');
  const fs = await import('node:fs');
  const url = 'https://ssyckywijlrkgcwvkwlr.supabase.co';
  // the public anon key (it ships in every Suite bundle); never a service key
  const key = shared.env.DEMO_SUPABASE_ANON_KEY || process.env.DEMO_SUPABASE_ANON_KEY
    || fs.readFileSync(process.env.SUPABASE_ANON_KEY_FILE || '/tmp/claude-0/emv/anon.key', 'utf8').trim();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: shared.env.DEMO_EMAIL, password: shared.env.DEMO_PASSWORD });
  const { data } = await sb.from('em_models').select('id,name');
  for (const r of data || []) if (re.test(r.name)) await sb.from('em_models').delete().eq('id', r.id);
}

/** Delete the demo account's own registry surfaces whose name matches (off camera; grid file first). */
export async function deleteSurfaces(shared, re) {
  const { createClient } = await import('@supabase/supabase-js');
  const fs = await import('node:fs');
  const key = shared.env.DEMO_SUPABASE_ANON_KEY || process.env.DEMO_SUPABASE_ANON_KEY
    || fs.readFileSync(process.env.SUPABASE_ANON_KEY_FILE || '/tmp/claude-0/emv/anon.key', 'utf8').trim();
  const sb = createClient('https://ssyckywijlrkgcwvkwlr.supabase.co', key, { auth: { persistSession: false } });
  const { data: auth } = await sb.auth.signInWithPassword({ email: shared.env.DEMO_EMAIL, password: shared.env.DEMO_PASSWORD });
  const uid = auth.user.id;
  const { data } = await sb.from('geo_surfaces').select('id,name,user_id,storage_path');
  for (const r of data || []) {
    if (r.user_id !== uid || !re.test(r.name)) continue;
    if (r.storage_path?.startsWith(`${uid}/`)) await sb.storage.from('surfaces').remove([r.storage_path]);
    await sb.from('geo_surfaces').delete().eq('id', r.id);
  }
}

/**
 * The demo 1 model definition, off camera unless asked: the two maps, the
 * logs upscaled to five layers, kriged porosity and NTG, Sw by inverse
 * distance (or saturation height), the contact and Bo.
 */
export async function logsModel(d, { layers = '5', sw = 'idw', onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await stackEkene(d, { onCamera });
  await t(d, 'em-control').scrollIntoViewIfNeeded();
  await m.select(t(d, 'em-control'), 'logs');
  await m.type(t(d, 'em-layers-0'), layers);
  await methods(d, { phi: 'okrige', ntg: 'okrige', sw }, { onCamera });
  if (sw === 'shm') {
    const sel = t(d, 'em-shm-project');
    await sel.scrollIntoViewIfNeeded();
    const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
    await m.select(sel, v);
  }
  await fluids(d, { onCamera });
}

/** Save the open definition under a name. */
export async function saveModel(d, name, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await t(d, 'em-model-name').scrollIntoViewIfNeeded();
  await m.type(t(d, 'em-model-name'), name);
  await t(d, 'em-save-model').scrollIntoViewIfNeeded();
  await m.click(t(d, 'em-save-model'));
  await d.sleep(2500);
}

/** The saved-model row of that name. */
export const modelRow = (d, name) => d.page.getByTestId('em-model-row').filter({ hasText: name }).first();

/** The view buttons in the ribbon. */
export const view = (d, v, onCamera = true) => (onCamera ? d.click(`em-view-${v}`) : t(d, `em-view-${v}`).click());

export const CAP = 'Ogbia Shale cap';
export const SPLITS = ['Ekene Sand Middle', 'Ekene Sand Lower'];
export const ZONES = [CAP, 'Ekene Sand Upper', 'Ekene Sand Middle', 'Ekene Sand Lower'];
export const slug = (s) => s.replace(/\s+/g, '-').toLowerCase();
/** A zone's volume cell in the Details table. */
export const zvol = (d, zone, block, col) => t(d, `em-vol-${slug(zone)}-${block}-${col}`);

/** Split the sand at the Middle and Lower tops, and the 50 ft cap above it. */
export async function zonesAndCap(d, { onCamera = false, cap = true, split = true } = {}) {
  const m = maybe(d, onCamera);
  if (split) {
    for (const top of SPLITS) {
      const box = t(d, `em-split-0-${top}`);
      await box.scrollIntoViewIfNeeded();
      if (!(await box.isChecked())) await m.click(box);
    }
  }
  if (cap) {
    const on = t(d, 'em-cap-on');
    await on.scrollIntoViewIfNeeded();
    if (!(await on.isChecked())) await m.click(on);
    await m.type(t(d, 'em-cap-name'), CAP);
  }
}

/**
 * The Ekene grid model the 3D videos build: the two maps, the zones and the cap,
 * the logs, porosity by SGS, NTG kriged, Sw by inverse distance, the contact and Bo.
 */
export async function gridModel(d, { onCamera = false, phi = 'sgs', ntg = 'okrige', sw = 'idw', cap = true, split = true } = {}) {
  const m = maybe(d, onCamera);
  await stackEkene(d, { onCamera });
  await zonesAndCap(d, { onCamera, cap, split });
  await t(d, 'em-control').scrollIntoViewIfNeeded();
  if ((await t(d, 'em-control').inputValue()) !== 'logs') await m.select(t(d, 'em-control'), 'logs');
  await methods(d, { phi, ntg, sw }, { onCamera });
  if (sw === 'shm') {
    const sel = t(d, 'em-shm-project');
    await sel.scrollIntoViewIfNeeded();
    const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
    await m.select(sel, v);
  }
  await fluids(d, { onCamera });
}

/** The Results view on a tab ('charts' or 'details'). */
export async function results(d, tab = 'charts', { onCamera = false } = {}) {
  if (onCamera) await d.click('em-view-qc'); else await t(d, 'em-view-qc').click();
  await d.sleep(800);
  const b = t(d, `em-results-${tab}`);
  if ((await b.getAttribute('aria-selected')) !== 'true') { if (onCamera) await d.click(b); else await b.click(); }
  await d.sleep(1200);
}

/** The 3D view with the grid toolbar set ({prop, mode, density, ve}). */
export async function grid3d(d, { prop = null, mode = null, density = null, ve = null, onCamera = true } = {}) {
  const m = maybe(d, onCamera);
  if ((await t(d, 'em-view-3d').getAttribute('class') || '').indexOf('border-pl-primary') < 0) await m.click(t(d, 'em-view-3d'));
  await d.sleep(1500);
  if (ve) await m.click(t(d, `em-3d-ve-${ve}`));
  if (mode) await m.select(t(d, 'em-3d-mode'), mode);
  if (prop) await m.select(t(d, 'em-3d-gridprop'), prop);
  if (density !== null) await m.select(t(d, 'em-3d-density'), String(density));
  await d.sleep(1500);
}

/** Move a range slider to a value (React reads the native input event). */
export async function setRange(locator, v) {
  await locator.evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
}
