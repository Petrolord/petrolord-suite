// Shared by the Material Balance Studio storyboards (Ekene kit v4, oilfield
// units). The kit's tank history (09-reservoir/ekene-mbal-tank-history.csv:
// first oil 1 January 2020, six surveys to 1 January 2023, Bo, Rs and Bw on
// every row) returns the volumetric STOIIP, 12.14 MM stb, at r2 1. The flood
// era (2023 to 2025, water injected by Ekene-2 and Ekene-4) is the extra file
// seed/mbal_assets.mjs writes. The booked volumetric case is the RCP project
// seed/mbal.mjs saves ("MBAL demo: Ekene booked volumetric").
// Cases the videos make are named "MBAL demo ..." or "Lesson ..." and their
// setups delete them; no other video's data is touched.
import path from 'node:path';
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';
import { RCP_PROJECT, deleteCases } from '../seed/mbal.mjs';

export { login, expectText, RCP_PROJECT, deleteCases };
export const MBAL = '/dashboard/apps/reservoir/reservoir-balance';
export const KIT_DIR = process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4';
export const TANK = path.join(KIT_DIR, '09-reservoir/ekene-mbal-tank-history.csv');
export const ASSETS = process.env.MBAL_ASSETS || '/root/demo-video-work/mbal-assets';
export const FLOOD = path.join(ASSETS, 'ekene-mbal-tank-history-2025.csv');

/** Discovery conditions (kit episode 12): psia, degF, fraction, psia. */
export const EKENE = { pi: '3200', temp: '180', swi: '0.35', pb: '2000', api: '32', salinity: '35000', cf: '4e-6', cw: '3e-6' };

export const t = (d, id) => d.page.getByTestId(id);
export const tab = (d, name) => d.page.getByRole('button', { name, exact: true }).or(d.page.getByRole('tab', { name, exact: true })).first();
const act = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
});

/** Material Balance Studio with no case open. */
export async function openStudio(d, shared) {
  await d.page.goto(`${shared.baseUrl}${MBAL}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByText(/Select case|No case open/).first().waitFor({ timeout: 90000 });
  await d.sleep(2500);
}

/** Open a saved case from the left rail picker. */
export async function openCase(d, name, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('combobox').first());
  await d.sleep(600);
  await a.click(d.page.getByRole('option', { name, exact: true }).first());
  await t(d, 'mbal-case-summary').waitFor({ timeout: 60000 });
  await d.sleep(2500);
}

const unitInput = (d, id) => t(d, id).locator('input').first();
async function typeUnit(d, id, v, onCamera) {
  const l = (await unitInput(d, id).count()) ? unitInput(d, id) : t(d, id);
  if (onCamera) await d.type(l, v, { delay: 60 }); else { await l.click(); await l.fill(v); }
  await l.press('Tab');
}

/** The New case dialog, filled with the Ekene discovery conditions. */
export async function createCase(d, name, { onCamera = false, field = 'Ekene', reservoir = 'Ekene Sand', c = EKENE, open = true, fluid = null } = {}) {
  const a = act(d, onCamera);
  if (open) {
    const btn = d.page.getByRole('button', { name: 'Create a case' });
    await a.click((await btn.count()) ? btn : d.page.locator('button:has(svg.lucide-plus)').first());
  }
  await d.page.locator('#name').waitFor();
  await d.sleep(500);
  await a.type(d.page.locator('#name'), name);
  await a.type(d.page.locator('#field'), field);
  await a.type(d.page.locator('#reservoir'), reservoir);
  if (fluid) {
    await a.click(d.page.getByRole('dialog').getByRole('combobox').first());
    await d.sleep(400);
    await a.click(d.page.getByRole('option', { name: fluid }).first());
    await d.sleep(400);
  }
  await typeUnit(d, 'mbal-case-pi', c.pi, onCamera);
  await typeUnit(d, 'mbal-case-temp', c.temp, onCamera);
  await typeUnit(d, 'mbal-case-swi', c.swi, onCamera);
  if (c.pb != null) await typeUnit(d, 'mbal-case-pb', c.pb, onCamera);
}
export async function confirmCase(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(d.page.getByRole('button', { name: 'Create case' }));
  await t(d, 'mbal-case-summary').waitFor({ timeout: 60000 });
  await t(d, 'mbal-data-dropzone').waitFor({ timeout: 60000 });
  await d.sleep(1500);
}

/** Drop a file on the Data tab (the cursor goes to the drop zone; no native dialog). */
export async function dropFile(d, file, { onCamera = false } = {}) {
  if (onCamera) {
    const p = await d.moveTo(t(d, 'mbal-data-dropzone'));
    await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
  }
  await t(d, 'mbal-data-file').setInputFiles(file);
  await t(d, 'mbal-pending-status').waitFor({ timeout: 30000 });
  await d.sleep(800);
}
export async function saveData(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(t(d, 'mbal-data-save'));
  await t(d, 'mbal-data-table').waitFor({ timeout: 60000 });
  await t(d, 'mbal-data-save').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
  await d.sleep(1500);
}

/** PVT tab: oil gravity, salinity and the two compressibilities, then Save. */
export async function setPvt(d, { api = EKENE.api, salinity = EKENE.salinity, cf = EKENE.cf, cw = EKENE.cw, sg = null, m = null } = {}, { onCamera = false } = {}) {
  await act(d, onCamera).click(tab(d, 'PVT'));
  await t(d, 'mbal-pvt-cf').waitFor({ timeout: 60000 });
  // the tab loads the saved config after it mounts; typing before that is overwritten
  await d.page.getByText(/PVT preview table/i).first().waitFor({ timeout: 60000 }).catch(() => {});
  await d.sleep(onCamera ? 1200 : 2500);
  if (api != null) await typeUnit(d, 'mbal-pvt-api', api, onCamera);
  if (sg != null) await typeUnit(d, 'mbal-pvt-sg', sg, onCamera);
  if (salinity != null) await typeUnit(d, 'mbal-pvt-salinity', salinity, onCamera);
  if (cf != null) await typeUnit(d, 'mbal-pvt-cf', cf, onCamera);
  if (cw != null) await typeUnit(d, 'mbal-pvt-cw', cw, onCamera);
  if (m != null) {
    const mf = d.page.locator('#gasCapM');
    if (onCamera) await d.type(mf, m); else { await mf.click(); await mf.fill(m); }
    await mf.press('Tab');
  }
  await d.sleep(500);
  if (await t(d, 'mbal-pvt-save').count()) {
    await act(d, onCamera).click(t(d, 'mbal-pvt-save'));
    await t(d, 'mbal-pvt-save').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  }
  await d.sleep(1200);
  if (api != null) {
    const f = (await unitInput(d, 'mbal-pvt-api').count()) ? unitInput(d, 'mbal-pvt-api') : t(d, 'mbal-pvt-api');
    const v = await f.inputValue().catch(() => '');
    if (Number(v) !== Number(api)) throw new Error(`PVT tab: oil gravity reads "${v}" after save, typed ${api}`);
  }
}

/** Aquifer tab, Model: pick a model by its label and Save. */
export async function setAquifer(d, label, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(tab(d, 'Aquifer'));
  await d.sleep(1500);
  const seg = d.page.getByRole('radio', { name: 'Model' }).or(d.page.getByRole('button', { name: 'Model', exact: true })).first();
  if (await seg.count()) await seg.click();
  await d.sleep(800);
  await a.click(d.page.getByRole('combobox').filter({ hasText: /None|Pot aquifer|Fetkovich|Carter-Tracy/ }).first());
  await d.sleep(500);
  await a.click(d.page.getByRole('option', { name: new RegExp(label, 'i') }).first());
  await d.sleep(800);
  const save = d.page.getByRole('button', { name: /^Save/ }).first();
  if (await save.isEnabled().catch(() => false)) await a.click(save);
  await d.sleep(2500);
}

/** Aquifer tab: the Carter-Tracy parameters (testids mbal-aq-*), then Save. */
export async function setCarterTracy(d, p, { onCamera = false } = {}) {
  await setAquifer(d, 'Carter-Tracy', { onCamera });
  const map = { k: 'mbal-aq-k', h: 'mbal-aq-h', phi: 'mbal-aq-phi', theta: 'mbal-aq-theta', radius: 'mbal-aq-radius', red: 'mbal-aq-red', ct: 'mbal-aq-ct', muw: 'mbal-aq-muw' };
  for (const [k, id] of Object.entries(map)) if (p[k] != null) await typeUnit(d, id, String(p[k]), onCamera);
  await d.sleep(500);
  const save = d.page.getByRole('button', { name: /^Save/ }).first();
  if (await save.isEnabled().catch(() => false)) await act(d, onCamera).click(save);
  await d.sleep(2500);
}

/** Contacts tab: the geometry fields (testids mbal-contacts-*), then Save. */
export async function setContacts(d, g, { onCamera = false } = {}) {
  await act(d, onCamera).click(tab(d, 'Contacts'));
  await t(d, 'mbal-contacts-initialOwcFt').waitFor({ timeout: 60000 });
  await d.sleep(800);
  for (const [k, v] of Object.entries(g)) if (v != null) await typeUnit(d, `mbal-contacts-${k}`, String(v), onCamera);
  await d.sleep(400);
  const save = t(d, 'mbal-contacts-save');
  if (await save.isEnabled().catch(() => false)) await act(d, onCamera).click(save);
  await d.sleep(1500);
}

/** The Ekene gas-cap scenario (seed/mbal_companions.mjs): case, PVT, aquifer and contacts. */
export const GASCAP_FILE = path.join(ASSETS, 'ekene-gascap-scenario-history.csv');
export const GASCAP = {
  c: { pi: '3200', temp: '180', swi: '0.25', pb: '3200' },
  pvt: { api: '32', sg: '0.75', salinity: '35000', cf: '4e-6', cw: '3e-6', m: '0.45' },
  ct: { k: 150, h: 60, phi: 0.22, theta: 180, radius: 2400, red: 6, ct: '7e-6', muw: 0.45 },
  contacts: { initialOwcFt: 5060, initialGocFt: 4950, areaOwcAcres: 180, areaGocAcres: 200, porosity: 0.22, sorWater: 0.25, sorGas: 0.15 },
};
export const OBORO_FILE = path.join(ASSETS, 'oboro-gas-scenario-history.csv');
export const OBORO = { c: { pi: '4350', temp: '205', swi: '0.22', pb: null }, pvt: { api: null, sg: '0.65', salinity: '35000', cf: '4e-6', cw: '3e-6' } };

/** Run tab, Regression, Run MBAL; resolves when the result card is current. */
export async function runMbal(d, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(tab(d, 'Run'));
  await d.sleep(1200);
  const seg = d.page.getByRole('radio', { name: 'Regression' }).or(d.page.getByRole('button', { name: 'Regression', exact: true })).first();
  if (await seg.count()) await seg.click();
  await d.sleep(500);
  await a.click(d.page.getByRole('button', { name: /Run MBAL/ }));
  await d.page.getByText('Running the material balance engine').first().waitFor({ timeout: 3000 }).catch(() => {});
  await d.page.getByText('Running the material balance engine').first().waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
  await d.waitText('mbal-result-title', /^Latest result/, { timeout: 120000 });
  await d.sleep(1500);
}
export const resultText = async (d) => ((await t(d, 'mbal-result-card').innerText()) || '').replace(/\s+/g, ' ');
export const statCard = (d, label) => t(d, 'mbal-result-card').locator('div', { has: d.page.locator(`p:text-is("${label}")`) }).last();

/** Plots tab: a plot card by model id (regression, campbell, pressure, drive, influx). */
export const plotCard = (d, id) => t(d, `mbal-plot-${id}`);
export async function showPlot(d, id) {
  const c = plotCard(d, id);
  await c.waitFor({ timeout: 30000 });
  await c.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await d.sleep(1200);
  return c;
}

/** Off camera: a whole case, data in, PVT set, extra setup (aquifer, contacts) and run. */
export async function seedCase(d, shared, name, { file = TANK, pvt = {}, run = true, fluid = null, c = EKENE, field = 'Ekene', reservoir = 'Ekene Sand', before = null } = {}) {
  await openStudio(d, shared);
  await createCase(d, name, { fluid, c, field, reservoir });
  await confirmCase(d);
  await dropFile(d, file);
  await saveData(d);
  await setPvt(d, pvt);
  if (before) await before(d);
  if (run) await runMbal(d);
}
