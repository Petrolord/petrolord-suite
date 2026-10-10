// Shared by the Seismolord storyboards (Ekene kit v3). The demo account holds
// the full stack and the angle stacks (seed/seismic.mjs) and the ten horizons
// Tops to Horizons made from the wells.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from '../lib/session.mjs';
import { expectText } from './petro-common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../dist-demo/ekene-demo-v3');
export const SEISMOLORD = '/dashboard/apps/geoscience/seismolord';
export const FULL = 'EKENE3D-full.sgy';
export const SMALL = 'EKENE3D-small.sgy';

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
