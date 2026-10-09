// Shared by the Petrophysics Studio storyboards (Ekene-1, oilfield units).
import { login } from '../lib/session.mjs';
import { baseParams } from './lessons/common.mjs';

export const APP = '/dashboard/apps/geoscience/petrophysics-studio';
export const ZONE = 'Ekene Sand';
const WELL_TOP_FT = 197; const WELL_BASE_FT = 7381.5;

export async function openWell(d, shared) {
  await d.page.goto(`${shared.baseUrl}${APP}`, { waitUntil: 'domcontentloaded' });
  await d.page.locator('[data-well-name="Ekene-1"]').first().click({ timeout: 120000 });
  await d.waitFor('petro-curve-inventory');
  await d.sleep(2000);
}

export async function clearZones(d) {
  for (let i = 0; i < 20; i++) {
    const del = d.page.locator('[data-testid^="petro-zone-delete-"]').first();
    if (!(await del.count())) return;
    await del.click();
    await d.sleep(500);
  }
}

export async function ensureZones(d) {
  if (await d.page.getByTestId(`petro-zone-net-${ZONE}`).count()) return;
  await d.page.getByTestId('petro-zone-mode-tops').click();
  await d.page.getByTestId('petro-zone-fill-between-tops').click();
  await d.waitFor(`petro-zone-net-${ZONE}`);
}

// The state video 1 ends in: linear Vsh 18/125, Pickett m and Rw on the
// water leg (shaly samples left out), Indonesia with Rsh 2.2. Off camera.
// Parameters persist between takes and lessons, so it starts from defaults.
export async function video1State(d) {
  const t = (id) => d.page.getByTestId(id);
  await baseParams(d);
  await t('petro-param-grClean').fill('18'); await t('petro-param-grClay').fill('125');
  await t('petro-param-vshMethod').selectOption('linear'); await t('petro-params-apply').click(); await d.sleep(800);
  await t('petro-view-crossplot').click(); await t('petro-plot-pickett').click();
  await t('petro-pickett-top').fill('5118.1'); await t('petro-pickett-base').fill('5183.7');
  await t('petro-pickett-fit').click(); await t('petro-pickett-apply').click(); await d.sleep(800);
  await t('petro-param-swMethod').selectOption('indonesia'); await t('petro-param-rsh').fill('2.2');
  await t('petro-params-apply').click(); await d.sleep(1000);
  await t('petro-view-tracks').click(); await d.sleep(800);
}

// wheel-zoom the tracks about a depth (ft) by n notches (0.8x each); the
// canvas spans the whole well when unzoomed, so the depth's y is a
// proportion of it, and zooming about the cursor keeps the depth under it
export async function zoomTracks(d, depthFt, n) {
  // TrackViewer: a 50 px header and 2 px above the plot, 4 px below it
  const b = await d.page.getByTestId('petro-tracks-canvas').boundingBox();
  const y = b.y + 52 + ((depthFt - WELL_TOP_FT) / (WELL_BASE_FT - WELL_TOP_FT)) * (b.height - 56);
  const x = b.x + b.width * 0.45;
  await d.moveTo({ x, y }, { ms: 700 });
  for (let i = 0; i < n; i++) { await d.page.mouse.wheel(0, -120); await d.sleep(220); }
  return { x, y, b };
}

export const zoneCard = (d) => d.page.locator('[data-testid="petro-zone-card"]').filter({ has: d.page.getByTestId(`petro-zone-net-${ZONE}`) });

// stop the take if the screen ever disagrees with the narration
export async function expectText(d, target, re, what) {
  try { await d.waitText(target, re, { timeout: 20000 }); } catch (e) {
    throw new Error(`Narration mismatch at "${what}": expected ${re}, screen shows "${await d.text(target).catch(() => '?')}"`);
  }
}

export async function startOnDashboard(d, shared) {
  await d.page.goto(`${shared.baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await d.sleep(1500);
}

export { login };
