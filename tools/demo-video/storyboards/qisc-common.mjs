// Shared by the QI Studio showcase demos (owner ask 2026-10-16): one
// continuous story on the Ekene field (kit v4), from a raw SEG-Y to a ranked
// prospect, with the seismic on screen most of the time.
//   qi-showcase      the main cut, 5:00 or shorter
//   qi-showcase-x    the extended showcase, about 9 minutes
// Data in the demo account (prefix "QI showcase" on what these demos make):
//   EKENE3D-v4-full.sgy with the framework horizons and the six wells (the
//     Seismolord demos), EKENE3D-v4-near/mid/far.sgy (seed/seismic.mjs --kit v4),
//   the gathers with multiples and noise (seed/qi_showcase_assets.mjs, uploaded
//     with seed/seismic.mjs --volumes gathers --gathers-file ...),
//   the QI project "QI showcase: Ekene" (Ekene-1, 2, 3, 4 and 9; the four v4
//     volumes; the Ekene Sand), the committed ties of Ekene-1 to 4 (QI demos).
// The on-camera import uses a hard link of the kit's full stack named
// "QI showcase EKENE3D-v4.sgy", kept on this computer (local workspace) in a
// fresh browser profile; the folder picker is stubbed to an OPFS folder, so
// no native dialog opens (it is set up off camera).
import { login } from '../lib/session.mjs';
import {
  expectText, openSeismolord, setVisible, showSlicePlanes, closeWindow, fullscreenBtn, explorerRow,
} from './seis-common.mjs';
import { openQi } from './qi-common.mjs';

export { login, expectText, openSeismolord, setVisible, showSlicePlanes, closeWindow, fullscreenBtn, explorerRow };

export const PROJECT = 'QI showcase: Ekene';
export const FULL = 'EKENE3D-v4-full.sgy';
export const STACKS = ['EKENE3D-v4-near.sgy', 'EKENE3D-v4-mid.sgy', 'EKENE3D-v4-far.sgy'];
export const IMPORT_NAME = 'QI showcase EKENE3D-v4.sgy';
export const IMPORT_FILE = '/root/demo-video-work/qisc-assets/QI showcase EKENE3D-v4.sgy';
export const GATHERS_UPLOAD = 'EKENE3D-v4-gathers-nmo-multiples.sgy';
export const STORE = `${GATHERS_UPLOAD} gathers`;
export const DEMULT = `${STORE} demultipled (area)`;
export const DENOISED = `${DEMULT} f-x denoised (area)`;
export const MULT_MODEL = `${STORE} multiple model`;
// the Radon area: 16 x 16 CDPs round Ekene-1 (inline 1027, crossline 2051)
export const AREA = { il0: 1020, il1: 1035, xl0: 2044, xl1: 2059 };
export const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];
// kit v4 04-seismic/gathers/ekene-rms-velocity.csv, one time and velocity per line
export const RMS_V4 = ['46.7 1500', '330.6 1975', '925.5 2458', '1040.5 2456', '1288.8 2388', '1311.0 2397', '1516.5 2352', '1571.7 2341', '1624.8 2347', '1782.3 2329', '2466.9 2239'].join('\n');
export const RGB_FREQS = [12, 25, 40];

export const t = (d, id) => d.page.getByTestId(id);
export const combo = (d, name) => d.page.getByRole('combobox', { name });
export const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
export const mapSel = (d, i) => d.page.locator('[data-testid="window-map"] select').nth(i);

/** Select the option containing `name` (the director shows the cursor and ripple). */
export async function pick(d, id, name, { exact = false, last = false } = {}) {
  const opts = await t(d, id).locator('option').allInnerTexts();
  const hit = (o) => (exact ? o === name : o.includes(name));
  // runs of the same name pile up in a project's records: `last` takes the newest
  const v = last ? opts.findLast(hit) : opts.find(hit);
  if (!v) throw new Error(`${id}: no option ${name} in ${opts.join(' | ')}`);
  await d.select(id, { label: v });
}

/** Off camera: set an option by text. */
export async function pickQuiet(d, id, name, { exact = false } = {}) {
  const opts = await t(d, id).locator('option').allInnerTexts();
  const v = opts.find((o) => (exact ? o === name : o.includes(name)));
  if (!v) throw new Error(`${id}: no option ${name} in ${opts.join(' | ')}`);
  await t(d, id).selectOption({ label: v });
}

/** Wait until a runs list has one more "Ready: open in Seismolord" than before. */
export async function moreReady(d, id, before, ms = 1800000) {
  const t0 = Date.now();
  for (;;) {
    const n = await d.page.locator(`[data-testid="${id}"] >> text=Ready: open in Seismolord`).count();
    if (n > before) return;
    if (Date.now() - t0 > ms) throw new Error(`${id}: no new ready run in ${Math.round(ms / 60000)} min`);
    await d.sleep(3000);
  }
}
export const readyCount = (d, id) => d.page.locator(`[data-testid="${id}"] >> text=Ready: open in Seismolord`).count();

/** Seismolord with a volume active (the ribbon remembers its tab: Home first). */
export async function activate(d, shared, name = FULL, { reopen = true } = {}) {
  if (reopen) await openSeismolord(d, shared);
  await d.page.getByText('Home', { exact: true }).first().click();
  await d.sleep(600);
  await combo(d, 'Active volume').selectOption({ label: name });
  await d.sleep(6000);
}

/** Off camera: only these explorer layers visible (slice planes untouched). */
export async function onlyVisible(d, names) {
  const all = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
  for (const n of all) if (!/^(Inline|Crossline|Time slice)/.test(n) && !names.includes(n)) await setVisible(d, n, false);
  for (const n of names) await setVisible(d, n, true);
}

/** A slow drag on the 3D canvas; the drawn cursor glides along with it. */
export async function drag3d(d, dx, dy, steps = 30) {
  const c = d.page.locator('[data-testid="window-3d"] canvas').first();
  const b = await c.boundingBox();
  const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
  await d.moveTo({ x: cx, y: cy });
  await d.page.mouse.move(cx, cy); await d.page.mouse.down();
  const glide = d.page.evaluate(([a, bb, ms]) => window.__demo.moveTo(a, bb, ms), [cx + dx, cy + dy, steps * 60]);
  for (let i = 1; i <= steps; i++) {
    await d.page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await d.sleep(40);
  }
  await glide;
  await d.page.mouse.up();
}

export async function goTo(d, value, { quiet = false } = {}) {
  if (quiet) { await t(d, 'sl-goto').fill(String(value)); await t(d, 'sl-goto-btn').click(); await d.sleep(2500); return; }
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(2200);
}

export async function openQiProject(d, shared, name = PROJECT) {
  await openQi(d, shared);
  await d.page.getByRole('combobox', { name: 'Project' }).click(); await d.sleep(500);
  await d.page.getByRole('option', { name, exact: true }).click(); await d.sleep(3500);
}

/** In-app move to QI Studio from Seismolord (keeps autosave flushes on leave). */
export async function toQi(d, shared) {
  await openQiProject(d, shared);
}

/** Stub the folder picker before any page loads: the workspace goes to an OPFS folder. */
export async function stubFolderPicker(page) {
  await page.context().addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Petrolord seismic', { create: true }),
    });
  });
}

/** Off camera: a local workspace named for this computer. */
export async function setUpWorkspace(d, label = 'Studio laptop') {
  await d.page.getByText('Home', { exact: true }).first().click(); await d.sleep(600);
  await d.page.getByRole('button', { name: /Local workspace/ }).first().click(); await d.sleep(1500);
  if (await t(d, 'local-ws-label').count()) await t(d, 'local-ws-label').fill(label);
  if (await t(d, 'local-ws-choose-folder').count()) { await t(d, 'local-ws-choose-folder').click(); await d.sleep(3000); }
  await d.page.keyboard.press('Escape'); await d.sleep(800);
}

/** Off camera: delete Seismolord volumes by exact name or prefix (children first: the list is walked from the end). */
export async function deleteVolumes(d, test) {
  for (let round = 0; round < 40; round++) {
    const names = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).map((x) => x.trim());
    const k = names.findLastIndex((n) => test(n));
    if (k < 0) return;
    const name = names[k];
    const row = explorerRow(d, name);
    await row.click({ button: 'right' }); await d.sleep(600);
    const del = d.page.getByText('Delete volume…');
    if (!(await del.count())) { await d.page.keyboard.press('Escape'); return; }
    await del.click();
    for (let i = 0; i < 24; i++) { await d.sleep(2500); if (!(await explorerRow(d, name).count())) break; }
  }
}

/** Off camera: remove worker datasets (gather stores, stacks) whose list row matches, on the Prestack tab. */
export async function removePrestack(d, test) {
  d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
  for (let round = 0; round < 8; round++) {
    await t(d, 'qi-tab-prestack').click(); await d.sleep(4000);
    const rows = d.page.locator('[data-testid="qi-pre-stores"] tr, [data-testid="qi-pre-stacks"] tr');
    const n = await rows.count();
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const name = (await rows.nth(i).innerText()).split('\t')[0].trim();
      if (!test(name)) continue;
      const rm = rows.nth(i).locator('[data-testid^="qi-pre-remove-"]');
      if (await rm.count()) { await rm.click(); hit += 1; await d.sleep(1500); }
      if (hit >= 3) break;   // the worker queue holds four jobs
    }
    if (!hit) return;
    await d.sleep(15000);
    await t(d, 'qi-tab-setup').click(); await d.sleep(1000);
  }
}

/** The gather viewer's position inputs after the line field: from, to, step, time from, time to. */
export async function lineInputs(d) {
  const row = d.page.locator('[data-testid="qi-gathers"] input:visible');
  const all = await row.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const k0 = all.findIndex((x) => x === 'qi-gathers-line');
  return { from: row.nth(k0 + 1), to: row.nth(k0 + 2), step: row.nth(k0 + 3), t0: row.nth(k0 + 4), t1: row.nth(k0 + 5) };
}
