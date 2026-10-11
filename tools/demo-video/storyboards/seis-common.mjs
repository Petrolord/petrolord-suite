// Shared by the Seismolord storyboards (Ekene kit v4, the listric growth
// fault). The demo account holds kit v3's volumes, which QI Studio depends on
// and which stay, and kit v4's full stack, EKENE3D-v4-full.sgy
// (seed/seismic.mjs --kit v4 --volumes full). The demos work on v4 only.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from '../lib/session.mjs';
import { expectText } from './petro-common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v4');
export const SEISMOLORD = '/dashboard/apps/geoscience/seismolord';
export const FULL = 'EKENE3D-v4-full.sgy';
export const SMALL = 'EKENE3D-v4-small.sgy';
// v4 survey: inlines 1000-1127, crosslines 1960-2127, 876 samples at 4 ms
export const IL0 = 1000; export const XL0 = 1960; export const NXL = 168;
export const RECORD_MS = 3500;
/** The section's horizontal fraction for a crossline on an inline (centre of the trace). */
export const xlFrac = (xl) => (xl - XL0 + 0.5) / NXL;
/** The section's horizontal fraction for an inline on a crossline. */
export const ilFrac = (il) => (il - IL0 + 0.5) / 128;

/** Seismolord open on the Home tab, the tour skipped. */
export async function openSeismolord(d, shared) {
  const t = (id) => d.page.getByTestId(id);
  await d.page.goto(`${shared.baseUrl}${SEISMOLORD}`, { waitUntil: 'domcontentloaded' });
  await t('sl-start-toggle').waitFor({ timeout: 120000 }); await d.sleep(5000);
  if (await t('sl-tour-skip').count()) await t('sl-tour-skip').click();
}

/** An item in the Seismic Explorer list, by its exact name (the section's
 *  own overlays can carry the same text, so the search stays in the explorer). */
export const explorerItem = (d, name) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))')
  .locator(`text=/^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$/ >> visible=true`).first();

/** Off camera: delete a volume left by an earlier take. */
export async function deleteVolume(d, name) {
  const item = explorerItem(d, name);
  if (!(await item.count())) return;
  await item.click({ button: 'right' }); await d.sleep(600);
  await d.page.getByText('Delete volume…').click();
  for (let i = 0; i < 24; i++) { await d.sleep(2500); if (!(await explorerItem(d, name).count())) return; }
  throw new Error(`${name} was not deleted`);
}

/** Off camera: delete a horizon of the active volume left by an earlier take. */
export async function deleteHorizon(d, name) {
  for (let n = 0; n < 4; n++) {
    const item = explorerItem(d, name);
    if (!(await item.count())) return;
    await item.click({ button: 'right' }); await d.sleep(600);
    await d.page.getByText('Delete horizon…').click();
    for (let i = 0; i < 12; i++) { await d.sleep(1500); if (!(await explorerItem(d, name).count())) break; }
  }
}

/** The section canvas of the Section window. */
export const sectionCanvas = (d) => d.page.locator('[data-testid="window-section"] canvas').first();

/**
 * A point on the section, in page pixels, for a crossline index and a time.
 * The section spans the whole lattice at 100 %: x from the first to the last
 * trace, y from 0 ms to the record length (both checked against the cursor
 * readout when the storyboard was written).
 */
export async function sectionPoint(d, { frac, ms, recordMs }) {
  const b = await sectionCanvas(d).boundingBox();
  return { x: b.x + b.width * frac, y: b.y + b.height * (ms / recordMs) };
}

/** Moves the drawn cursor to a point and clicks there (the section is a canvas). */
export async function clickAt(d, p) {
  await d.moveTo(p);
  await d.sleep(180);
  await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
  await d.page.mouse.click(p.x, p.y);
  await d.sleep(300);
}

export { login, expectText };

/** An explorer row (role=button) by its exact label. */
export const explorerRow = (d, name) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))')
  .locator(`div[role=button]:has(span:text-is("${name.replace(/"/g, '\\"')}"))`).first();

/** Show or hide an explorer item with its eye button; returns true when it clicked. */
export async function setVisible(d, name, visible, { onCamera = false } = {}) {
  const eye = explorerRow(d, name).locator(`button[title="${visible ? 'Show' : 'Hide'}"]`);
  if (!(await eye.count())) return false;
  if (onCamera) await d.click(eye); else await eye.click();
  await d.sleep(onCamera ? 900 : 600);
  return true;
}

/** Off camera: delete every horizon of the active volume whose name matches. */
export async function deleteHorizonsMatching(d, re) {
  const ex = d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
  const names = (await ex.locator('div[role=button] span.truncate').allInnerTexts()).filter((n) => re.test(n));
  for (const n of names) await deleteHorizon(d, n);
}

/** Off camera: delete a fault of the active volume, every copy of that name. */
export async function deleteFault(d, name) {
  for (let n = 0; n < 4; n++) {
    const row = explorerRow(d, name);
    if (!(await row.count())) return;
    await row.click({ button: 'right' }); await d.sleep(600);
    await d.page.getByText('Delete fault…').click();
    for (let i = 0; i < 12; i++) { await d.sleep(1500); if (!(await explorerRow(d, name).count())) break; }
  }
}

/** Off camera: delete every registry surface of that exact name from the explorer. */
export async function deleteSurface(d, name) {
  for (let n = 0; n < 4; n++) {
    const row = explorerRow(d, name);
    if (!(await row.count())) return;
    await row.click({ button: 'right' }); await d.sleep(600);
    await d.page.getByText('Delete surface…').click();
    for (let i = 0; i < 12; i++) { await d.sleep(1500); if (!(await explorerRow(d, name).count())) break; }
  }
}

/** Off camera: delete every volume whose name starts with the prefix. */
export async function deleteVolumesStarting(d, prefix) {
  const ex = d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
  const names = (await ex.locator('div[role=button] span.truncate').allInnerTexts()).filter((n) => n.startsWith(prefix));
  for (const n of names) await deleteVolume(d, n);
}

/** The Fullscreen button of a viewer window ('section' or '3d'); the same
 *  button restores it. */
export const fullscreenBtn = (d, win) => d.page.locator(`[data-testid="window-${win}"] button[title="Fullscreen"]`);

/** Off camera: every slice plane shown (explorer eyes), so the 3D window
 *  draws the inline, the crossline and the time slice. */
export async function showSlicePlanes(d) {
  const ex = d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
  const names = (await ex.locator('div[role=button] span.truncate').allInnerTexts())
    .filter((n) => /^(Inline \d+|Crossline \d+|Time slice \d+ ms)$/.test(n));
  for (const n of names) await setVisible(d, n, true);
}

/** Off camera: close the 3D (or Map) window if it is open. */
export async function closeWindow(d, title) {
  const b = d.page.locator(`button[title="Close ${title}"]`);
  if (await b.count()) { await b.first().click(); await d.sleep(800); }
}
