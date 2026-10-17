// Geoscience module showcase, scene 2: the wells in Well Data Manager. The
// map with the depth surface of the Ekene Sand behind the wells, then
// Ekene-1's logs on a track template round the Ekene Sand.
import { login, scene, t, park, openApp, expectText } from './geo-common.mjs';

const SURFACE_ID = '39c0a365-9296-4d96-922d-f504828bfff9'; // "Ekene Sand (depth ft)", 201 x 177 at 25 m (Seismolord demos)

export default {
  ...scene('geo-s02'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'well-data-manager', 'wdm-map');
    if (await t(d, 'wdm-view-map').count()) await t(d, 'wdm-view-map').click();
    await t(d, 'wdm-map-surface').selectOption({ index: 0 });
    await d.sleep(1500);
    await park(d);
  },
  steps: [
    { id: 'map', chapter: 'The wells', chapterSub: 'Well Data Manager',
      say: 'Every study starts with the wells. Well Data Manager holds them for the whole suite: the Ekene wells, over the depth map of the top of the sand.',
      do: async (d) => {
        await d.select('wdm-map-surface', SURFACE_ID);
        await d.page.waitForFunction(() => /Ekene Sand/.test(document.querySelector('[data-testid="wdm-map"]')?.dataset.surface || ''), null, { timeout: 30000 });
        await d.sleep(1500);
        await d.moveTo(t(d, 'wdm-map'), { ms: 1600, dx: 0.55, dy: 0.45 });
      } },
    { id: 'logs',
      say: 'Open Ekene one, and the logs are there: gamma ray shaded from sand to shale, resistivity, and density with neutron, crossing over in the sand.',
      sub: 'Open Ekene-1, and the logs are there: gamma ray shaded from sand to shale, resistivity, and density with neutron, crossing over in the sand.',
      do: async (d) => {
        await d.click(d.page.locator('[data-testid="wdm-well-row"][data-well-name="Ekene-1"]'));
        await t(d, 'wdm-detail').waitFor({ timeout: 30000 });
        await d.sleep(800);
        await d.click('wdm-detail-tab-logs');
        await d.sleep(1200);
        await d.select('wdm-log-template', 'lithology-quicklook');
        await d.select('wdm-log-window', 'top:Ekene Sand');
        await d.page.waitForFunction(() => document.querySelector('[data-testid="wdm-log-tracks"]')?.dataset.template === 'lithology-quicklook', null, { timeout: 30000 });
        // the tracks sit under the curve table: bring them up
        await t(d, 'wdm-log-template').evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await d.sleep(1500);
      } },
    { id: 'shared',
      say: 'Load a well once, and every application reads the same curves, tops and coordinates.',
      do: async (d) => {
        await d.moveTo(t(d, 'wdm-log-tracks'), { ms: 1500, dx: 0.5, dy: 0.5 });
        await d.sleep(800);
      } },
  ],
};
