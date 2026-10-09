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

export const SEISMOLORD = '/dashboard/apps/geoscience/seismolord';

/** Seismolord with the full stack active and the Synthetics window open. */
export async function openSynthetics(d, shared) {
  const t = (id) => d.page.getByTestId(id);
  await d.page.goto(`${shared.baseUrl}${SEISMOLORD}`, { waitUntil: 'domcontentloaded' });
  await t('sl-start-toggle').waitFor({ timeout: 120000 }); await d.sleep(4000);
  if (await t('sl-tour-skip').count()) await t('sl-tour-skip').click();
  const opt = d.page.locator('option', { hasText: 'EKENE3D-full.sgy' }).first();
  await opt.waitFor({ state: 'attached', timeout: 60000 });
  await d.page.locator('select', { has: opt }).first().selectOption({ label: 'EKENE3D-full.sgy' });
  await d.sleep(5000);
  // the window layout persists: open Synthetics only when it is not showing
  if (!(await t('synth').isVisible().catch(() => false))) {
    const windows = d.page.getByRole('button', { name: /Windows/ });
    await windows.click(); await d.sleep(600);
    await d.page.getByRole('menuitem', { name: /Synthetics/ }).or(d.page.getByText('Synthetics', { exact: true })).first().click();
    await d.sleep(800);
    if (await d.page.getByRole('menu').isVisible().catch(() => false)) { await d.page.keyboard.press('Escape'); await d.sleep(300); }
    if (await d.page.getByRole('menu').isVisible().catch(() => false)) await windows.click();
  }
  await t('synth').waitFor({ timeout: 30000 });
}

/** Off camera: drop a well's committed tie so the take commits it afresh. */
export async function clearTie(d, well) {
  const t = (id) => d.page.getByTestId(id);
  const wells = await t('synth-well').locator('option').allInnerTexts();
  await t('synth-well').selectOption({ label: wells.find((x) => new RegExp(`^${well}(?!\\d)`).test(x)) });
  await d.sleep(3000);
  await t('synth-run').click(); await d.sleep(6000);
  if (await t('synth-clear-checkshots').count()) { await t('synth-clear-checkshots').click(); await d.sleep(4000); }
}

/** Off camera: remove gather stores and angle stacks made by an earlier take (the raw upload stays). */
export async function clearPrestackProducts(d) {
  const t = (id) => d.page.getByTestId(id);
  d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
  await t('qi-tab-prestack').click(); await d.sleep(5000);
  for (let round = 0; round < 6; round++) {
    const ids = await d.page.locator('[data-testid="qi-pre-stores"] [data-testid^="qi-pre-remove-"], [data-testid="qi-pre-stacks"] [data-testid^="qi-pre-remove-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    if (!ids.length) return;
    for (const id of ids.slice(0, 2)) { await t(id).click(); await d.sleep(1500); }
    await d.sleep(12000);
    await t('qi-tab-setup').click(); await d.sleep(1000); await t('qi-tab-prestack').click(); await d.sleep(4000);
  }
}

export async function openQiProject(d, shared, name = PROJECT) {
  await openQi(d, shared);
  await d.page.getByRole('combobox', { name: 'Project' }).click(); await d.sleep(500);
  await d.page.getByRole('option', { name, exact: true }).click(); await d.sleep(3500);
}

// the kit's 10-qi/ekene-qi-truth.md table (v3.2), one time and RMS velocity per line
export const RMS_VELOCITY = ['47 1500', '331 1975', '926 2458', '1041 2456', '1289 2388', '1311 2397', '1517 2352', '1572 2341', '1625 2347', '1782 2329'].join('\n');
