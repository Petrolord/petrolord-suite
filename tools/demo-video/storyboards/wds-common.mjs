// Shared by the Well Design Studio storyboards (Ekene kit v4, oilfield
// units: depths in feet, TVDSS = MD - 82 ft on Ekene). The kit's drilling
// story: Ekene Alpha (EPSG:32632, wellhead 401700 E 521600 N, KB 25 m =
// 82 ft, water 35 m) carries Ekene-8, -9, -10 and -12; Ekene-11 is the well
// being designed, to T1 Oboro Sand (07-well-design/ekene-11-targets.csv).
// Sites the videos make are named "WDS demo ..." or "Lesson ..." and the
// setups delete them; no other video's data is touched.
import { login } from '../lib/session.mjs';
import { expectText } from './seis-common.mjs';

export { login, expectText };
export const WDS = '/dashboard/apps/drilling/well-planning';
export const KIT_DIR = process.env.EKENE_KIT || '/root/wt-kit4/dist-demo/ekene-demo-v4';
export const PAD = { e: '401700', n: '521600', kbM: '25', waterM: '35' };

export const t = (d, id) => d.page.getByTestId(id);
const act = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
});
export const dialog = (d) => d.page.getByRole('dialog').last();
export const tab = (d, name) => d.page.getByRole('tab', { name, exact: true }).first();

export async function openStudio(d, shared) {
  await d.page.goto(`${shared.baseUrl}${WDS}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByText('SITES', { exact: false }).first().waitFor({ timeout: 90000 });
  await d.page.getByText(/No sites yet|No wellbores yet|Select a design/).first().waitFor({ timeout: 90000 }).catch(() => {});
  await d.sleep(2500);
}

/** A tree row (site, wellbore or design) by its visible name. */
export const treeRow = (d, name) => d.page.locator('div[role=button].group').filter({ has: d.page.locator(`span.truncate:text-is("${name}")`) }).first();

/** Hover a tree row and open its menu, then pick an item. */
export async function treeMenu(d, name, item, { onCamera = false } = {}) {
  const row = treeRow(d, name);
  await row.hover();
  await d.sleep(300);
  const btn = row.locator('button[aria-haspopup=menu]').first();
  await act(d, onCamera).click(btn);
  await d.sleep(400);
  await act(d, onCamera).click(d.page.getByRole('menuitem', { name: item }));
  await d.sleep(600);
}

/** Delete every site whose name matches (off camera). */
export async function deleteSites(d, shared, re) {
  await openStudio(d, shared);
  for (let n = 0; n < 6; n++) {
    const names = await d.page.locator('span.truncate.font-medium').allInnerTexts();
    const hit = names.find((x) => re.test(x));
    if (!hit) return;
    await treeMenu(d, hit, 'Delete site');
    const ok = d.page.getByRole('alertdialog').getByRole('button').filter({ hasText: /Delete/ }).first();
    await ok.click();
    await d.sleep(2500);
  }
}

/** New site dialog: name, CRS EPSG:32632, pad origin. */
export async function createSite(d, name, { onCamera = false, e = PAD.e, n = PAD.n, open = true } = {}) {
  const a = act(d, onCamera);
  if (open) await a.click(d.page.getByTitle('New site'));
  const dlg = dialog(d);
  await dlg.getByText('Site name').waitFor();
  await d.sleep(500);
  await a.type(dlg.locator('input').first(), name);
  const crsBtn = dlg.getByRole('button').filter({ hasText: /CRS|Select|EPSG|coordinate/i }).first();
  await a.click(crsBtn);
  await d.sleep(500);
  await a.type(d.page.getByPlaceholder(/Search name, EPSG/), '32632');
  await d.sleep(700);
  await a.click(d.page.getByTestId('crs-search-results').getByRole('button', { name: /32632/ }).first());
  await d.sleep(500);
  const nums = dlg.locator('input[type=number]');
  await a.type(nums.nth(0), e);
  await a.type(nums.nth(1), n);
}
export async function confirmSite(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(dialog(d).getByRole('button', { name: /Create site|Save changes/ }));
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(1500);
}

/** Pick a Radix select option: the trigger, then the option by its label. */
export async function pick(d, trigger, option, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(trigger);
  await d.sleep(400);
  await a.click(d.page.getByRole('option', typeof option === 'string' ? { name: option, exact: true } : { name: option }).first());
  await d.sleep(400);
}

/** New wellbore from the site menu: slot (or wellhead), depth unit, then
 *  the datum in that unit (KB 82 ft = 25 m, water 114.8 ft = 35 m). */
export async function createWellbore(d, site, name, { onCamera = false, slot = null, e = PAD.e, n = PAD.n, kb = '82', water = '114.8', unit = 'Feet', azRef = null, open = true } = {}) {
  const a = act(d, onCamera);
  if (open) await treeMenu(d, site, 'New wellbore', { onCamera });
  const dlg = dialog(d);
  await dlg.getByText('Wellbore name').waitFor();
  await d.sleep(500);
  await a.type(dlg.locator('input').first(), name);
  const nums = dlg.locator('input[type=number]');
  if (slot) await pick(d, dlg.getByRole('combobox').first(), slot, { onCamera });
  else { await a.type(nums.nth(0), e); await a.type(nums.nth(1), n); }
  const unitTrigger = dlg.getByText('Depth unit', { exact: true }).locator('..').getByRole('combobox');
  if (unit && !(await unitTrigger.innerText()).includes(unit)) await pick(d, unitTrigger, unit, { onCamera });
  const field = async (id, idx) => ((await dlg.getByTestId(id).count()) ? dlg.getByTestId(id) : nums.nth(idx));
  if (kb != null) await a.type(await field('wellbore-kb-elev', 2), kb);
  if (water != null) await a.type(await field('wellbore-water-depth', 4), water);
  if (azRef) await pick(d, dlg.getByText('Azimuth reference', { exact: true }).locator('..').getByRole('combobox'), azRef, { onCamera });
}
export async function confirmWellbore(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(dialog(d).getByRole('button', { name: /Create wellbore|Save changes/ }));
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(1500);
}

/** New design from the wellbore menu. */
export async function createDesign(d, wellbore, name, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  await treeMenu(d, wellbore, 'New design', { onCamera });
  const dlg = dialog(d);
  await a.type(dlg.locator('input').first(), name);
  await a.click(dlg.getByRole('button').filter({ hasText: /Create|Save|OK/ }).last());
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(2500);
}

/** Open a design from the tree (site, wellbore, design names). */
export async function selectDesign(d, site, wellbore, design) {
  await treeRow(d, site).click(); await d.sleep(700);
  if (!(await treeRow(d, wellbore).isVisible().catch(() => false))) { await treeRow(d, site).click(); await d.sleep(700); }
  await treeRow(d, wellbore).click(); await d.sleep(700);
  if (!(await treeRow(d, design).isVisible().catch(() => false))) { await treeRow(d, wellbore).click(); await d.sleep(700); }
  await treeRow(d, design).click();
  for (let i = 0; i < 4; i++) {
    await d.sleep(1200);
    await tab(d, 'Design').click();
    if (await d.page.getByText('TOTAL MD').first().isVisible().catch(() => false)) break;
  }
  await d.page.getByText('TOTAL MD').first().waitFor({ timeout: 60000 });
  await d.sleep(2500);
}

/** Design methods: a whole-well build and hold (J) to a target. */
export async function solveJ(d, target, { kop, rate, onCamera = false, method = 'Build and hold (J)' } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('button', { name: /Design methods/ }));
  const sd = dialog(d);
  await sd.getByText('Method').first().waitFor();
  await d.sleep(500);
  if (method !== 'Build and hold (J)') await pick(d, sd.getByRole('combobox').first(), method, { onCamera });
  await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${target}`), { onCamera });
  if (kop != null) await a.type(sd.getByTestId('solver-kop'), kop);
  if (rate != null) await a.type(sd.getByTestId('solver-buildrate'), rate);
  await d.sleep(400);
  await a.click(sd.getByTestId('solver-apply'));
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(2000);
}

export async function saveDesign(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(d.page.getByRole('button', { name: 'Save', exact: true }).first());
  await d.page.getByText(/Design saved|saved/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await d.sleep(2000);
}
export const kpi = async (d) => (await d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]').innerText()).replace(/\s+/g, ' ');

/** Site dialog slot rows: [{name, dx, dy}] (off camera or on). */
export async function addSlots(d, slots, { onCamera = false } = {}) {
  const a = act(d, onCamera);
  const dlg = dialog(d);
  for (const s of slots) {
    await a.click(dlg.getByRole('button', { name: /Slot/ }).last());
    await d.sleep(300);
    const nameInputs = dlg.getByPlaceholder('Name');
    const i = (await nameInputs.count()) - 1;
    await a.type(nameInputs.nth(i), s.name);
    await a.type(dlg.getByPlaceholder('dE').nth(i), String(s.dx));
    await a.type(dlg.getByPlaceholder('dN').nth(i), String(s.dy));
  }
}

/** Surveys tab: a new run from a file (csv or xlsx), columns mapped by header. */
export async function importSurveyFile(d, file, name, { onCamera = false, sheet = null, unit = 'Metres', map = null } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByTestId('new-survey'));
  const dlg = dialog(d);
  await dlg.getByTestId('survey-name').waitFor();
  await d.sleep(500);
  await a.type(dlg.getByTestId('survey-name'), name);
  const combos = dlg.getByRole('combobox');
  // tool?, source, azimuths, md unit
  const srcTrigger = dlg.getByText('Source', { exact: true }).locator('..').getByRole('combobox');
  await pick(d, srcTrigger, /file/i, { onCamera });
  const unitTrigger = dlg.getByText('MD unit', { exact: true }).locator('..').getByRole('combobox');
  await pick(d, unitTrigger, unit, { onCamera });
  await dlg.getByTestId('survey-file').setInputFiles(file);
  await d.sleep(1500);
  if (sheet) await pick(d, dlg.getByTestId('survey-sheet'), sheet, { onCamera });
  if (map) for (const [f, col] of Object.entries(map)) await pick(d, dlg.getByTestId(`survey-map-${f}`), col, { onCamera });
  await d.sleep(800);
  return dlg;
}

/** The Ekene Alpha slots, 2.5 m apart: row A east-west through the pad
 *  origin, row B 5 m south. The registry's Ekene-8 and Ekene-9 sit on S3,
 *  the origin (their published wellhead). */
export const SLOTS = [
  { name: 'S1', dx: -5, dy: 0 }, { name: 'S2', dx: -2.5, dy: 0 }, { name: 'S3', dx: 0, dy: 0 },
  { name: 'S4', dx: 2.5, dy: 0 }, { name: 'S5', dx: 5, dy: 0 },
  { name: 'S6', dx: -5, dy: -5 }, { name: 'S7', dx: 0, dy: -5 }, { name: 'S8', dx: 5, dy: -5 },
];
export const NEIGHBOURS = [
  { name: 'Ekene-10', slot: 'S1', file: 'Ekene-10-definitive-survey.xlsx', sheet: /^Definitive Survey/ },
  { name: 'Ekene-12', slot: 'S2', file: 'surveys/Ekene-12-survey.csv' },
];
export const T1 = { name: 'T1 Oboro Sand', e: '402250', n: '521750', tvdssM: 1885.36 };

/** Off camera: the pad with its slots and the two drilled neighbours that
 *  live only in this app (actual surveys imported from the kit). */
export async function buildPad(d, shared, site, { neighbours = NEIGHBOURS } = {}) {
  await deleteSites(d, shared, new RegExp(`^${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await createSite(d, site);
  await addSlots(d, SLOTS);
  await confirmSite(d);
  for (const w of neighbours) {
    await createWellbore(d, site, w.name, { slot: w.slot });
    await confirmWellbore(d);
    await treeRow(d, w.name).click(); await d.sleep(1000);
    await tab(d, 'Surveys').click(); await d.sleep(1500);
    const dlg = await importSurveyFile(d, `${KIT_DIR}/01-wells/${w.file}`, `${w.name} definitive survey`, { sheet: w.sheet || null });
    await dlg.getByTestId('survey-save').click();
    await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
    await d.sleep(2000);
    const cb = d.page.getByRole('checkbox').first();
    if ((await cb.getAttribute('data-state')) !== 'checked') { await cb.click(); await d.sleep(2000); }
  }
}

/** Targets tab, From surface: a registry surface sampled at E/N, with a stand-off below the pick (profile depth unit). */
export async function targetFromSurface(d, { surface, x, y, below = null, name = '', onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('button', { name: 'From surface', exact: true }));
  const dlg = dialog(d);
  await dlg.getByTestId('wd-pick-surface').waitFor({ timeout: 60000 });
  await d.sleep(800);
  await pick(d, dlg.getByTestId('wd-pick-surface'), surface, { onCamera });
  await a.type(dlg.getByTestId('wd-pick-x'), x);
  await a.type(dlg.getByTestId('wd-pick-y'), y);
  if (below != null) await a.type(dlg.getByTestId('wd-pick-below'), below);
  if (name) await a.type(dlg.getByTestId('wd-pick-name'), name);
  return dlg;
}
export async function confirmPick(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(dialog(d).getByTestId('wd-pick-create'));
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(2000);
}

/** Targets tab, New target by hand (TVDSS in the profile depth unit). */
export async function newTarget(d, { name, e, n, tvdss, onCamera = false } = {}) {
  const a = act(d, onCamera);
  await a.click(d.page.getByRole('button', { name: 'New target' }));
  const dlg = dialog(d);
  await dlg.getByText('Name', { exact: true }).waitFor();
  await d.sleep(500);
  await a.type(dlg.locator('input').first(), name);
  const nums = dlg.locator('input[type=number]');
  await a.type(nums.nth(0), e);
  await a.type(nums.nth(1), n);
  await a.type((await dlg.getByTestId('wd-target-tvdss').count()) ? dlg.getByTestId('wd-target-tvdss') : nums.nth(2), tvdss);
  return dlg;
}
export async function confirmTarget(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(dialog(d).getByRole('button').filter({ hasText: /Create target|Save/ }).last());
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(2000);
}

/** Anti-Collision tab: tick exactly the offsets whose label matches `want`. */
export async function pickOffsets(d, want = /^Ekene-(8|9|10|12)\b/, { onCamera = false } = {}) {
  const boxes = d.page.getByRole('checkbox');
  await boxes.first().waitFor({ timeout: 60000 });
  await d.sleep(1500);
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i);
    const lab = (await b.locator('xpath=..').innerText()).trim();
    const on = (await b.getAttribute('data-state')) === 'checked';
    if (want.test(lab) !== on) await act(d, onCamera).click(b);
  }
}
export async function runScan(d, { onCamera = false } = {}) {
  await act(d, onCamera).click(t(d, 'run-anticollision'));
  await d.page.getByText(/min SF/).first().waitFor({ timeout: 120000 });
  await d.sleep(2500);
}
/** The summary cards as "name STATUS sf@md" strings. */
export async function scanCards(d) {
  const txt = await d.page.locator('body').innerText();
  return [...txt.matchAll(/(NO-GO|REVIEW|CLEAR)\n(Ekene-\d+[^\n]*)\nmin SF ([-\d.]+) at MD ([\d,]+) ft/g)].map((m) => `${m[2]} ${m[1]} ${m[3]}@${m[4]}`);
}
/** Off camera: the Ekene-11 wellbore on S5, T1 from the Oboro Sand map, a J saved. */
export async function seedEkene11(d, site, { kop = '1312.3', design = 'Plan 1' } = {}) {
  await createWellbore(d, site, 'Ekene-11', { slot: 'S5' });
  await confirmWellbore(d);
  await createDesign(d, 'Ekene-11', design);
  await tab(d, 'Targets').click(); await d.sleep(1500);
  await targetFromSurface(d, { surface: 'WDS demo: Oboro Sand top', x: T1.e, y: T1.n, below: '26.2', name: T1.name });
  await confirmPick(d);
  await tab(d, 'Design').click(); await d.sleep(1500);
  await solveJ(d, T1.name, { kop, rate: '2.54' });
  await saveDesign(d);
}
