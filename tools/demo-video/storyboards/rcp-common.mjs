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
  await m.click(t(d, `rcp-registry-use-${name}`));
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
