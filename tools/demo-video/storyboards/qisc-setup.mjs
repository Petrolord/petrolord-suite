// Off-camera setup for the QI showcase cuts.
import {
  login, stubFolderPicker, setUpWorkspace, activate, openSeismolord, onlyVisible, showSlicePlanes, closeWindow,
  deleteVolumes, removePrestack, openQiProject, combo, t, goTo, ex, explorerRow, IMPORT_NAME, FULL, STORE, PROJECT,
} from './qisc-common.mjs';
import { pruneQiProject } from './qisc-prune.mjs';

const VIEW_LAYERS = ['Top Ekene Sand', 'Oboro Unconformity', 'Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];

/** Off camera: the 3D window's layers (they persist in this browser), then close it. */
export async function cubeLayers(d, want = { 'Horizon surfaces': false, 'Well paths & tops': true, 'Axis gizmo': true }) {
  await d.page.getByRole('button', { name: /Windows/ }).click(); await d.sleep(600);
  await d.page.getByText('3D', { exact: true }).last().click(); await d.sleep(1000);
  await d.page.keyboard.press('Escape'); await d.sleep(4000);
  await d.page.locator('button[title="3D layers"]').click(); await d.sleep(800);
  for (const [label, on] of Object.entries(want)) {
    const item = d.page.getByRole('menuitemcheckbox', { name: label });
    if (!(await item.count())) continue;
    const checked = (await item.getAttribute('aria-checked')) === 'true';
    if (checked !== on) { await item.click(); await d.sleep(500); }
  }
  await d.page.keyboard.press('Escape'); await d.sleep(800);
  await closeWindow(d, '3D');
}

/** Seismolord laid out for the take: section only, the framework layers, slice positions, then the Start here panel. */
export async function seismolordLayout(d, shared) {
  await activate(d, shared, FULL);
  await closeWindow(d, '3D'); await closeWindow(d, 'Map'); await closeWindow(d, 'Synthetics');
  await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
  await onlyVisible(d, VIEW_LAYERS);
  await showSlicePlanes(d);
  await cubeLayers(d);
  if (await t(d, 'sl-rgb-clear').count()) await t(d, 'sl-rgb-clear').click();
  await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
  await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
  await combo(d, 'Orientation').selectOption({ label: 'Crossline' }); await goTo(d, 2051, { quiet: true });
  await combo(d, 'Orientation').selectOption({ label: 'Time slice' }); await goTo(d, 1292, { quiet: true });
  await combo(d, 'Orientation').selectOption({ label: 'Inline' }); await goTo(d, 1100, { quiet: true });
  await combo(d, 'Active volume').selectOption({ value: '' }).catch(() => {});
}

export async function startHere(d, shared) {
  await openSeismolord(d, shared);
  if (!(await t(d, 'sl-start-step-import').isVisible())) {
    if (!(await d.page.getByRole('tab', { name: 'Start here' }).isVisible())) await t(d, 'sl-start-toggle').click();
    await d.page.getByRole('tab', { name: 'Start here' }).click();
    await d.sleep(800);
  }
  await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
}

/** Both cuts: a fresh workspace and no import row left by an earlier take. */
export async function commonSetup(d, shared) {
  d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
  await stubFolderPicker(d.page);
  await login(d.page, shared.baseUrl, shared.env);
  await openSeismolord(d, shared);
  await deleteVolumes(d, (n) => n === IMPORT_NAME);
  await setUpWorkspace(d);
}

/** Off camera: delete every registry surface whose explorer name matches. */
async function deleteSurfacesMatching(d, test) {
  for (let round = 0; round < 12; round++) {
    const names = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).map((x) => x.trim());
    const name = names.find(test);
    if (!name) return;
    const row = explorerRow(d, name);
    await row.click({ button: 'right' }); await d.sleep(600);
    const del = d.page.getByText('Delete surface…');
    if (!(await del.count())) { await d.page.keyboard.press('Escape'); return; }
    await del.click();
    for (let i = 0; i < 12; i++) { await d.sleep(1500); if (!(await explorerRow(d, name).count())) break; }
  }
}

/** Extended cut: what its own steps make on camera is removed first, so they run afresh. */
export async function extendedCleanup(d, shared) {
  await activate(d, shared, FULL);
  await deleteVolumes(d, (n) => n.startsWith(`${FULL} [Spectral decomposition`) && /(12|25|40) Hz 120 ms\]$/.test(n));
  await deleteVolumes(d, (n) => n.startsWith(`${STORE} `));               // stacks converted from the gather stores, and their AVO
  await deleteVolumes(d, (n) => n.startsWith('EKENE3D-v4-near.sgy:') || /^EKENE3D-v4-near\.sgy (AI|SI|Vp\/Vs|density), simultaneous/.test(n) || n.startsWith(`${FULL} AI, Model-based`));
  await deleteSurfacesMatching(d, (n) => n.includes('probability of Hydrocarbon sand'));
  await pruneQiProject(shared.env, PROJECT);
  await openQiProject(d, shared);
  await removePrestack(d, (n) => n.startsWith(`${STORE} `));              // conditioned stores and every stack of the showcase gathers
  // prospects from earlier takes
  await t(d, 'qi-tab-prospects').click(); await d.sleep(3000);
  for (let i = 0; i < 6; i++) {
    const del = d.page.locator('[data-testid="qi-pros-table"] button:text-is("Delete")');
    if (!(await del.count())) break;
    await del.first().click(); await d.sleep(1500);
  }
  await t(d, 'qi-tab-setup').click(); await d.sleep(12000);   // the project saves
}

export { VIEW_LAYERS };
