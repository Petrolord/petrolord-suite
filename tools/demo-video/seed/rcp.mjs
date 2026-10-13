// Demo account seeding for the ReservoirCalc Pro videos (run as a probe):
//   node tools/demo-video/probe.mjs tools/demo-video/seed/rcp.mjs
// Imports the kit's booked six-well Ekene Sand maps (02-surfaces, put on the
// sea-level datum by seed/rcp_assets.mjs) through
// Mapping & Surface Studio's own import into the registry, under names no
// other video uses. Re-running replaces nothing: a name already listed is
// skipped. RCP_REPLACE=1 deletes them first (the demo 3 take changes them).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from '../lib/session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS = process.env.RCP_ASSETS || '/root/demo-video-work/rcp-assets';
export const SEVEN = { top: 'EkeneSand-top-7wells-tvdss.zmap', base: 'EkeneSand-base-7wells-tvdss.zmap' };
export const BOOKED = [
  { name: 'Ekene Sand top (6-well map)', file: 'EkeneSand-top-6wells-tvdss.zmap' },
  { name: 'Ekene Sand base (6-well map)', file: 'EkeneSand-base-6wells-tvdss.zmap' },
];
export const MAPPING = '/dashboard/apps/geoscience/mapping-surface-studio';

export async function openMapping(d, shared) {
  await d.page.goto(`${shared.baseUrl}${MAPPING}`, { waitUntil: 'domcontentloaded' });
  await d.page.getByTestId('map-import').waitFor({ timeout: 120000 });
  await d.sleep(3000);
}
export const mapRow = (d, name) => d.page.locator(`[data-testid="map-surface-row"][data-surface-name="${name.replace(/"/g, '\\"')}"]`);

/** Mapping's import dialog: a grid file in metres, EPSG:32632, saved under `name`. */
export async function importGrid(d, file, name, { dir = ASSETS } = {}) {
  const p = d.page;
  await p.getByTestId('map-import').click();
  await p.getByTestId('map-import-file').setInputFiles(path.join(dir, file));
  await p.getByTestId('map-import-preview').waitFor();
  if (await p.getByTestId('map-import-name').count()) await p.getByTestId('map-import-name').fill(name);
  await p.getByTestId('map-import-unit').selectOption('m');
  const crs = p.getByTestId('map-import-crs');
  await crs.getByRole('button').first().click();
  await crs.getByPlaceholder(/Search name, EPSG/).fill('32632');
  await d.sleep(500);
  await crs.getByTestId('crs-search-results').getByRole('button', { name: /32632/ }).first().click();
  await d.sleep(300);
  const chosen = await crs.getByRole('button').first().innerText();
  if (!/32632/.test(chosen)) throw new Error(`CRS not set: ${chosen}`);
  await p.getByTestId('map-import-run').click();
  await p.getByTestId('map-import-run').waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(1500);
}

export async function deleteMapSurface(d, name) {
  for (let n = 0; n < 4; n++) {
    const row = mapRow(d, name);
    if (!(await row.count())) return;
    await row.first().click({ button: 'right' });
    await d.page.getByTestId('map-row-delete').click();
    await d.page.getByTestId('map-delete-go').click();
    for (let i = 0; i < 20; i++) { await d.sleep(1000); if (!(await mapRow(d, name).count())) break; }
    // the registry delete runs after the ten-second Undo window: keep the page open
    await d.sleep(12000);
  }
}

export default {
  viewport: { w: 1440, h: 810 },
  async probe(d, shared, log) {
    await login(d.page, shared.baseUrl, shared.env);
    await openMapping(d, shared);
    log('rows', (await d.page.getByTestId('map-surface-row').evaluateAll((els) => els.map((e) => e.dataset.surfaceName))).join(' | '));
    for (const b of BOOKED) {
      if (process.env.RCP_REPLACE) await deleteMapSurface(d, b.name);
      if (await mapRow(d, b.name).count()) { log(`kept ${b.name}`); continue; }
      await importGrid(d, b.file, b.name);
      log(`imported ${b.name}: ${await mapRow(d, b.name).count()} row`);
    }
    await d.page.screenshot({ path: '/tmp/claude-0/rcpv/shots/seed-rcp.png' });
  },
};
