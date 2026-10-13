// Shared by the ReservoirCalc Pro storyboards (Ekene kit v4, oilfield units).
// The booked six-well Ekene Sand maps are in the registry as
// "Ekene Sand top (6-well map)" and "Ekene Sand base (6-well map)"
// (seed/rcp.mjs, on the sea-level datum). The field's booked case: contact
// 1560 m MD = 1535 m = 5,036 ft TVDSS, NTG 0.80, porosity 0.20, Sw 0.35,
// Bo 1.20 rb/stb: STOIIP 12.14 MM stb (kit 12,139,208 stb). With Ekene-7
// added to the maps (seed/rcp_assets.mjs) it is 10.42 MM stb.
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';

export { login, expectText };
export const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';
export const TOP = 'Ekene Sand top (6-well map)';
export const BASE = 'Ekene Sand base (6-well map)';
export const OWC_FT = '-5036.1';
export const BOOKED = { ntg: '0.8', porosity: '0.2', sw: '0.35', bo: '1.2' };

export const t = (d, id) => d.page.getByTestId(id);
export const dialog = (d) => d.page.getByRole('dialog').last();
const maybe = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
});

/** RCP open on a fresh workspace (a new reservoir case is not needed: the page starts unsaved). */
export async function openRcp(d, shared) {
  await d.page.goto(`${shared.baseUrl}${RCP}`, { waitUntil: 'domcontentloaded' });
  await d.page.locator('label[for="im-surfaces"]').waitFor({ timeout: 90000 });
  await d.sleep(2500);
}

/** Import one registry surface (Mapping section of the Import dialog). */
export async function importRegistrySurface(d, name, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await m.click(t(d, 'rcp-import-open'));
  await dialog(d).waitFor();
  await m.click(t(d, `rcp-registry-use-${name}`).first());
  await t(d, 'rcp-import-ready').waitFor({ timeout: 60000 });
  await d.sleep(500);
  await m.click(t(d, 'rcp-import-confirm'));
  await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(600);
}

export const surfaceCard = (d, nm) => d.page.getByText(nm, { exact: true }).first().locator('xpath=ancestor::*[.//button[contains(normalize-space(),"Set Top")]][1]');

/** A labelled NumberField on the Geo tab (Net-to-Gross, Porosity, Water Saturation). */
export const fieldByLabel = (d, label) => d.page.locator(`div.space-y-1:has(> label:text-is("${label}")) input`).first();

export async function setContact(d, value, { onCamera = false } = {}) {
  const owc = d.page.locator('#owc-input');
  if (onCamera) await d.click(owc); else await owc.click();
  await owc.fill('');
  await d.page.keyboard.type(value, { delay: onCamera ? 90 : 20 });
  await d.page.keyboard.press('Enter');
  await d.sleep(600);
  const v = await owc.inputValue();
  if (Math.abs(parseFloat(v) - parseFloat(value)) > 1e-6) throw new Error(`OWC reads ${v}, typed ${value}`);
}

/** The Trap only box (fill the crest's closure at most to its spill). */
export async function setTrapOnly(d, on, { onCamera = false } = {}) {
  const box = t(d, 'rcp-fill-to-spill').locator('input');
  if ((await box.isChecked()) !== on) { if (onCamera) await d.click(box); else await box.click(); }
  await d.sleep(400);
}

/** Off camera unless asked: the booked surfaces as top and base, contact, petrophysics and Bo. */
export async function bookedCase(d, { onCamera = false, petro = true } = {}) {
  const m = maybe(d, onCamera);
  await m.click(d.page.locator('label[for="im-surfaces"]'));
  await m.click(t(d, 'rcp-tab-surfaces'));
  await importRegistrySurface(d, TOP, { onCamera });
  await importRegistrySurface(d, BASE, { onCamera });
  await m.click(surfaceCard(d, TOP).getByRole('button', { name: /Set Top/ }));
  await m.click(surfaceCard(d, BASE).getByRole('button', { name: /Set Base/ }));
  await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
  await d.sleep(1500);
  await m.click(t(d, 'rcp-tab-geometry'));
  await d.sleep(500);
  await setContact(d, OWC_FT, { onCamera });
  await setTrapOnly(d, false, { onCamera });
  if (petro) {
    await m.type(fieldByLabel(d, 'Net-to-Gross'), BOOKED.ntg);
    await m.type(fieldByLabel(d, 'Porosity'), BOOKED.porosity);
    await m.type(fieldByLabel(d, 'Water Saturation'), BOOKED.sw);
  }
}

/** The STOIIP card's text once the deterministic run settles. */
export async function stoiip(d) {
  await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
  await d.sleep(1500);
  return (await t(d, 'rcp-stooip').textContent()).trim();
}

// ---- Probabilistic mode ----
/** A distribution card in the Monte Carlo panel, by its label. */
export const distCard = (d, label) => d.page.locator('div.space-y-1\\.5', { has: d.page.locator(`label:text-is("${label}")`) }).first();
export const DIST = {
  phi: 'Porosity (fraction)', sw: 'Water Saturation (fraction)', ntg: 'Net-to-Gross (fraction)',
  owc: 'Oil-Water Contact (OWC, ft)', grv: 'GRV Factor (structural uncertainty)', bo: 'Oil FVF (rb/stb)',
};
/** Triangular min / most likely / max, NAPE 2026 ranges (contact and depth in feet). */
export const RANGES = {
  before: { phi: [0.17, 0.2, 0.23], sw: [0.237, 0.323, 0.403], ntg: [0.65, 0.8, 0.9], owc: [-5115.2, -5036.1, -5029.5], grv: [0.08, 1, 2.21], bo: [1.15, 1.2, 1.3] },
  after: { phi: [0.185, 0.2, 0.215], sw: [0.336, 0.35, 0.364], ntg: [0.77, 0.8, 0.83], owc: [-5037.7, -5036.1, -5034.5], grv: [0.912, 1, 1.09], bo: [1.19, 1.2, 1.21] },
};
export async function setDist(d, key, vals, { onCamera = false } = {}) {
  const ins = distCard(d, DIST[key]).locator('input');
  for (let i = 0; i < 3; i++) {
    const l = ins.nth(i);
    if (onCamera) await d.type(l, String(vals[i]), { delay: 45 });
    else { await l.click(); await l.fill(String(vals[i])); }
    await d.page.keyboard.press('Tab');
  }
}
export async function toProbabilistic(d, { onCamera = false } = {}) {
  const sel = d.page.getByRole('combobox').filter({ hasText: 'Deterministic' }).first();
  if (onCamera) await d.click(sel); else await sel.click();
  const opt = d.page.getByRole('option', { name: 'Probabilistic' });
  if (onCamera) await d.click(opt); else await opt.click();
  await d.sleep(1500);
}
/** Step 2 of the panel: no correlations, 50k realisations, a fixed seed. */
export async function runSettings(d, { seed = '20261109', n = '50k' } = {}) {
  const corr = t(d, 'rcp-corr').getByRole('button', { name: 'Remove' });
  while (await corr.count()) await corr.first().click();
  await d.page.getByRole('button', { name: n, exact: true }).click();
  await t(d, 'rcp-mc-seed').fill(seed);
}
export const mcCards = (d) => d.page.locator('text=/^P50 \\(BEST ESTIMATE\\)/i').locator('xpath=ancestor::*[contains(., "P10 (HIGH ESTIMATE)") or contains(., "P10 (High estimate)")][1]');

// ---- Projects and Mapping (demo 3, lesson D12) ----
export const DEMO_PROJECT = 'RCP demo: Ekene booked case';
const projectsBtn = (d) => d.page.getByRole('button', { name: /^Projects$/ });
export const projectRow = (d, name) => d.page.getByTestId('rcp-project-row').filter({ hasText: name });

/** Off camera: delete every saved project of that name. */
export async function deleteProjects(d, name) {
  await projectsBtn(d).click();
  await d.sleep(2500);
  for (let n = 0; n < 6 && (await projectRow(d, name).count()); n++) {
    await projectRow(d, name).first().click();
    await d.sleep(600);
    await d.page.getByRole('button', { name: /^Delete$/ }).first().click();
    await d.sleep(800);
    const confirm = d.page.getByRole('alertdialog').getByRole('button', { name: /Delete/ });
    if (await confirm.count()) await confirm.first().click();
    await d.sleep(2000);
  }
  await d.page.keyboard.press('Escape');
  await d.sleep(800);
}

/** Save the workspace as a new project of that name. */
export async function saveProject(d, name, { onCamera = false } = {}) {
  if (onCamera) await d.click('rcp-save'); else await t(d, 'rcp-save').click();
  await t(d, 'rcp-save-name').waitFor();
  if (onCamera) await d.type('rcp-save-name', name); else await t(d, 'rcp-save-name').fill(name);
  if (onCamera) await d.click('rcp-save-confirm'); else await t(d, 'rcp-save-confirm').click();
  await t(d, 'rcp-save-name').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(800);
}

/** Open a saved project from the Projects sheet. */
export async function loadProject(d, name, { onCamera = false } = {}) {
  const c = (l) => (onCamera ? d.click(l) : l.click());
  await c(projectsBtn(d));
  await projectRow(d, name).first().waitFor({ timeout: 30000 });
  await d.sleep(800);
  await c(projectRow(d, name).first());
  await d.sleep(600);
  await c(d.page.getByRole('button', { name: /Load Project/ }));
  await d.sleep(2500);
}

export const MAPPING = '/dashboard/apps/geoscience/mapping-surface-studio';
export const mapRow = (d, name) => d.page.locator(`[data-testid="map-surface-row"][data-surface-name="${name.replace(/"/g, '\\"')}"]`);
export async function openMapping(d, shared) {
  await d.page.goto(`${shared.baseUrl}${MAPPING}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByTestId('map-import').waitFor({ timeout: 120000 });
  await d.sleep(3000);
}
/** Mapping: right-click a surface, Replace grid from a file, metres, Replace. */
export async function replaceFromFile(d, name, file, { onCamera = false, dwell = 0 } = {}) {
  const row = mapRow(d, name).first();
  if (onCamera) await d.moveTo(row);
  await row.click({ button: 'right' });
  await d.sleep(500);
  if (onCamera) await d.click('map-row-replace-file'); else await t(d, 'map-row-replace-file').click();
  await t(d, 'map-import-file').setInputFiles(file);
  await t(d, 'map-import-preview').waitFor();
  await t(d, 'map-import-unit').selectOption('m');
  const crs = t(d, 'map-import-crs');
  if (!/32632/.test(await crs.getByRole('button').first().innerText())) {
    await crs.getByRole('button').first().click();
    await crs.getByPlaceholder(/Search name, EPSG/).fill('32632');
    await d.sleep(500);
    await crs.getByTestId('crs-search-results').getByRole('button', { name: /32632/ }).first().click();
    await d.sleep(300);
  }
  if (dwell) await d.sleep(dwell);
  if (onCamera) await d.click('map-import-run'); else await t(d, 'map-import-run').click();
  await t(d, 'map-import-run').waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(1500);
}
export const KIT_DIR = process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4';
