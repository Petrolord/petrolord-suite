// Shared by the QI Studio storyboards (Ekene kit v3, oilfield units).
// Data in the demo account: seed/qi.mjs (DTS, checkshots, surveys on Ekene-1,
// 2, 3, 4, 8 and 9) and seed/seismic.mjs (EKENE3D full, near, mid and far).
import { login } from '../lib/session.mjs';
import { expectText } from './petro-common.mjs';

export const QI = '/dashboard/apps/geoscience/qi-studio';
export const RPS = '/dashboard/apps/geoscience/rock-physics-studio';
export const PROJECT = 'Ekene QI';
export const ZONE_LABEL = 'Ekene Sand (5078.7–5183.7 ft)';
export const VOLUMES = ['EKENE3D-full.sgy', 'EKENE3D-near.sgy', 'EKENE3D-mid.sgy', 'EKENE3D-far.sgy'];

export async function openQi(d, shared) {
  await d.page.goto(`${shared.baseUrl}${QI}`, { waitUntil: 'domcontentloaded' });
  await d.waitFor('qi-tab-setup', { timeout: 120000 });
  await d.sleep(2500);
}

/** Off camera: delete a QI project left by an earlier take, so each take starts clean. */
export async function clearQiProject(d, name = PROJECT) {
  const picker = d.page.getByRole('combobox', { name: 'Project' });
  for (let i = 0; i < 3; i++) {
    await picker.click(); await d.sleep(600);
    const item = d.page.getByRole('option', { name, exact: true });
    if (!(await item.count())) { await d.page.keyboard.press('Escape'); return; }
    await item.first().click(); await d.sleep(2500);
    d.page.once('dialog', (dg) => dg.accept());
    await d.page.getByRole('button', { name: 'Delete current project' }).click();
    await d.sleep(2500);
  }
}

/** A well's checkbox in QI Studio's Setup, by its name. */
export const wellBox = (d, name) => d.page.locator(`label:has([data-testid^="qi-well-"]):has(span:text-is("${name}")) input`).first();
export const volumeBox = (d, name) => d.page.locator(`label:has([data-testid^="qi-volume-"]):has-text("${name}") input`).first();

export async function openRpsWell(d, shared, well = 'Ekene-1') {
  await d.page.goto(`${shared.baseUrl}${RPS}`, { waitUntil: 'domcontentloaded' });
  await selectRpsWell(d, well);
}

/** Rock Physics Studio is already open (reached through an in-app link): pick the well. */
export async function selectRpsWell(d, well = 'Ekene-1') {
  const row = d.page.locator(`[data-testid="rp-well-row"][data-well-name="${well}"]`);
  await row.waitFor({ timeout: 120000 });
  await d.sleep(1500);
  await d.click(row);
  await d.waitFor('rp-curve-inventory');
  await d.sleep(2500);
}

export { login, expectText };
