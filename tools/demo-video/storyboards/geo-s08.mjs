// Geoscience module showcase, scene 8: the 3D earth model in Earth Modeling
// (3D grid upgrade #1203 #1204 #1207). The six-well Ekene maps, the sand split
// into Upper, Middle and Lower at the well tops under a 50 ft Ogbia Shale cap,
// 25 m by 2.5 ft cells, logs upscaled, porosity by SGS (seed 2026), NTG
// kriged, Sw by inverse distance, OWC 5,036.1 ft, Bo 1.2. Built off camera
// (about 8 s on the worker); nothing is saved.
import { login, scene, park, expectText } from './geo-common.mjs';
import { openEm, gridModel, build, collapseDock, results, grid3d, t } from './geo-em.mjs';

const opt = async (d, id, re, { quiet = false } = {}) => {
  const o = (await t(d, id).locator('option').allInnerTexts()).find((x) => re.test(x));
  if (!o) { console.log(`MISMATCH ${id}: no option ${re} in ${(await t(d, id).locator('option').allInnerTexts()).join(' | ')}`); return; }
  if (quiet) await t(d, id).selectOption({ label: o }); else await d.select(id, { label: o });
};

export default {
  ...scene('geo-s08'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d);
    await build(d);
    await collapseDock(d);
    await park(d);
  },
  steps: [
    { id: 'grid', chapter: 'The 3D earth model', chapterSub: 'Earth Modeling',
      say: 'Earth Modeling builds the static model between the maps: a hundred and ninety five thousand eight hundred and ten cells, twenty five metres across and two and a half feet thick. The lines are the grid skeleton, and the colours are the zones: the grey cap over the upper, middle and lower Ekene Sand.',
      sub: 'Earth Modeling builds the static model between the maps: 195,810 cells, 25 m across and 2.5 ft thick. The lines are the grid skeleton, and the colours are the zones: the grey cap over the upper, middle and lower Ekene Sand.',
      do: async (d, shared) => {
        await expectText(d, 'em-status', /195,810 cells in 61 layers of 2\.5 ft/, 'build status');
        await grid3d(d, { ve: 10 });
        if (shared.dry) for (const id of ['em-3d-mode', 'em-3d-gridprop', 'em-3d-density']) console.log(id, await t(d, id).locator('option').allInnerTexts().catch(() => []));
        await opt(d, 'em-3d-density', /5/);
        await d.sleep(3500);
      } },
    { id: 'phi', chapterSub: 'Simulated porosity',
      say: 'With the cap hidden, slices through the grid show the simulated porosity, honouring the logs at the wells and varying between them the way the logs vary.',
      do: async (d) => {
        await d.click(t(d, 'em-3d-zone-0'));
        await d.sleep(1000);
        await d.select(t(d, 'em-3d-gridprop'), 'phi');
        await d.sleep(1000);
        await d.select(t(d, 'em-3d-mode'), 'slices');
        await d.sleep(4000);
      } },
    { id: 'owc', chapterSub: 'The contact',
      say: 'The contact is the blue plane at five thousand and thirty six feet: oil above it, water below.',
      sub: 'The contact is the blue plane at 5,036 ft: oil above it, water below.',
      do: async (d) => {
        await d.select(t(d, 'em-3d-mode'), 'shell');
        await d.select(t(d, 'em-3d-gridprop'), 'fluid');
        await d.sleep(4000);
      } },
    { id: 'player', chapterSub: 'The property player',
      say: 'The property player links a section, the map of each layer, and 3D, and sweeps down through the layers as the sand dips below the contact.',
      do: async (d) => {
        await d.click('em-view-player');
        await d.sleep(2500);
        await d.click('em-player-rewind');
        await d.click('em-player-play');
        await d.sleep(7000);
        await d.click('em-player-play');
        await d.sleep(600);
      } },
    { id: 'charts', chapterSub: 'Results as charts',
      say: 'The results are charts. The porosity histograms of the logs, the upscaled cells and the model agree, and porosity against permeability carries the scatter of the core plugs.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await expectText(d, t(d, 'em-chart-hist'), /means 0\.187, 0\.185, 0\.183/, 'histogram means');
        await d.highlight('em-chart-hist');
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight('em-chart-phik');
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'volumes',
      say: 'Six point zero six million barrels in the upper sand, four point two four in the middle, and none in the lower, which lies below the contact: ten point three one in all.',
      sub: '6.06 million barrels in the upper sand, 4.24 in the middle, and none in the lower, which lies below the contact: 10.31 in all.',
      do: async (d) => {
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.31 MMstb/, 'volumes by zone');
        await d.highlight('em-chart-volumes');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'tornado',
      say: 'And the tornado ranks what moves it most: thirty feet on the contact swings the volume from four point two seven to sixteen point six two million barrels.',
      sub: 'And the tornado ranks what moves it most: 30 ft on the contact swings the volume from 4.27 to 16.62 million barrels.',
      do: async (d) => {
        await t(d, 'em-chart-tornado').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-tornado'), /Contact: 4\.27 to\s*16\.62/, 'tornado contact');
        await d.highlight('em-chart-tornado');
        await d.sleep(2500);
      } },
  ],
};
