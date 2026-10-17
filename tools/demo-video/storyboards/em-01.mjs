// Earth Modeling, demo 1: from maps and logs to a 3D grid (Ekene kit v4,
// 3D grid upgrade 2026-10-17). The booked six-well Ekene Sand top and base,
// the sand split at the well tops into Upper, Middle and Lower under a 50 ft
// cap, a 25 m by 2.5 ft grid, the logs upscaled into its cells, porosity by
// sequential Gaussian simulation, the grid in 3D with its skeleton and the
// contact, the property player and the charts. Numbers from the dry run
// (LENIENT=1 prints mismatches instead of stopping).
import {
  login, expectText, openEm, stackEkene, zonesAndCap, fluids, methods, build, deleteModels, results, grid3d,
  t, TOP, DEMO_MODEL,
} from './em-common.mjs';

export default {
  id: 'em-01',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 1 of 3',
  title: 'From maps and logs to a *3D grid*',
  subtitle: 'The Ekene Sand in three zones, the logs upscaled into 2.5 ft cells, simulated porosity and the volume',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^EM demo: /);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Earth Modeling', chapterSub: 'A 3D static model of the Ekene field',
      say: 'Earth Modeling builds the static model of a field: a 3D grid between the mapped surfaces, the rock properties in every cell, and the volume. On the left are the surfaces published for the Ekene field, and the wells.',
      do: async (d) => {
        await d.sleep(1500);
        await d.moveTo(t(d, `em-add-${TOP}`));
        await d.sleep(2500);
      } },
    { id: 'stack', chapter: 'The framework', chapterSub: 'Top and base of the Ekene Sand',
      say: 'We stack the top and the base of the Ekene Sand, mapped from the six development wells. Each surface ties to the well top of the same name.',
      do: async (d) => {
        await stackEkene(d, { onCamera: true });
        await expectText(d, t(d, 'em-top-0'), /Ekene Sand/, 'tie top');
        await d.sleep(1500);
      } },
    { id: 'zones', chapter: 'Zones from the well tops', chapterSub: 'Upper, Middle and Lower, under a cap',
      say: 'The wells pick two shale breaks inside the sand, Ekene Sand Middle and Ekene Sand Lower. Ticking them splits the sand into Upper, Middle and Lower zones that follow the two maps. Above it we add a fifty foot cap of the Ogbia Shale, the seal.',
      sub: 'The wells pick two shale breaks inside the sand, Ekene Sand Middle and Ekene Sand Lower. Ticking them splits the sand into Upper, Middle and Lower zones that follow the two maps. Above it we add a 50 ft cap of the Ogbia Shale, the seal.',
      do: async (d) => {
        await zonesAndCap(d, { onCamera: true });
        await expectText(d, t(d, 'em-split-names-0'), /Ekene Sand Upper, Middle and Lower/, 'split names');
        await d.highlight(t(d, 'em-split-0'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'grid', chapter: 'The 3D grid', chapterSub: '25 m cells, 2.5 ft layers',
      say: 'A new model is a fine 3D grid: cells twenty five metres across and two and a half feet thick, in proportional layers that thin and thicken with each zone. The model edge is traced at the limit of the mapped data, so it has no steps.',
      sub: 'A new model is a fine 3D grid: cells 25 m across and 2.5 ft thick, in proportional layers that thin and thicken with each zone. The model edge is traced at the limit of the mapped data, so it has no steps.',
      do: async (d) => {
        await t(d, 'em-grid-settings').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-grid-settings').locator('xpath=..'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'logs', chapter: 'Rock properties from the logs', chapterSub: 'Upscaled into the cells',
      say: 'The rock properties come from the logs Petrophysics Studio published on Ekene one to four, upscaled into the cells along each well. Porosity is simulated with sequential Gaussian simulation, net to gross is kriged, and water saturation uses inverse distance.',
      do: async (d) => {
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await d.sleep(600);
        await methods(d, { phi: 'sgs', ntg: 'okrige', sw: 'idw' }, { onCamera: true });
        await t(d, 'em-sgs').scrollIntoViewIfNeeded();
        await d.highlight('em-sgs');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'contact', chapter: 'The contact', chapterSub: 'Oil down to 5,036 ft TVDSS',
      say: 'The oil water contact is at five thousand and thirty six feet true vertical depth sub sea, and Bo is one point two. Then build.',
      sub: 'The oil-water contact is at 5,036 ft TVDSS, and Bo is 1.2. Then build.',
      do: async (d) => {
        await fluids(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'built',
      say: 'The build runs on a worker and the status line reports the grid: a hundred and ninety five thousand eight hundred and ten cells in sixty one layers of two and a half feet, in four zones. It also warns that the oil reaches the edge of the mapped area: the six well maps stop at the outer wells, so the volume is a minimum.',
      sub: 'The build runs on a worker and the status line reports the grid: 195,810 cells in 61 layers of 2.5 ft, in four zones. It also warns that the oil reaches the edge of the mapped area: the six-well maps stop at the outer wells, so the volume is a minimum.',
      do: async (d) => {
        await expectText(d, 'em-status', /195,810 cells in 61 layers of 2\.5 ft \(proportional\), 4 zones[\s\S]*reaches the model edge/, 'build status');
        await d.highlight('em-status');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: '3d', chapter: 'In 3D', chapterSub: 'The grid and its skeleton',
      say: 'In 3D the model is a grid of cells. The lines are the grid skeleton, every fifth cell, and the colours are the zones: the grey cap over the Upper, Middle and Lower sand.',
      do: async (d) => {
        await grid3d(d, { ve: 10 });
        await d.sleep(4000);
      } },
    { id: 'phi', chapter: 'Simulated porosity', chapterSub: 'Slices through the grid',
      say: 'We hide the cap and colour the cells by porosity. Slices cut the grid along a column, a row and a layer. The simulation honours the wells and varies between them the way the logs vary.',
      do: async (d) => {
        await d.click(t(d, 'em-3d-zone-0'));
        await d.sleep(1200);
        await d.select(t(d, 'em-3d-gridprop'), 'phi');
        await d.sleep(1500);
        await d.select(t(d, 'em-3d-mode'), 'slices');
        await d.sleep(4500);
      } },
    { id: 'owc', chapter: 'The contact in 3D', chapterSub: 'A plane through the grid',
      say: 'The contact is the blue plane where it cuts the sand. Coloured by fluid, the cells above it are oil and the cells below are water.',
      do: async (d) => {
        await d.select(t(d, 'em-3d-mode'), 'shell');
        await d.select(t(d, 'em-3d-gridprop'), 'fluid');
        await d.sleep(4500);
      } },
    { id: 'player', chapter: 'The property player', chapterSub: 'Section, layer and 3D linked',
      say: 'The player links three views: a section, the map of one layer, and 3D. Play sweeps down through the layers, and the contact line moves across each layer map as the sand dips below it.',
      do: async (d) => {
        await d.click('em-view-player');
        await d.sleep(2500);
        await d.click('em-player-rewind');
        await d.click('em-player-play');
        await d.sleep(7000);
        await d.click('em-player-play');
        await d.sleep(800);
      } },
    { id: 'charts', chapter: 'Results as charts', chapterSub: 'Logs, cells and the model',
      say: 'The results open on charts. The histograms compare the porosity logs, the upscaled cells and the model, and they agree. Porosity against permeability is coloured by the rock physics facies, with the scatter the core plugs show, and the volume by zone shows six point zero six million barrels in the Upper sand, four point two four in the Middle, and none in the Lower, which lies below the contact: ten point three one in all.',
      sub: 'The results open on charts. The histograms compare the porosity logs, the upscaled cells and the model, and they agree. Porosity against permeability is coloured by the rock physics facies, with the scatter the core plugs show, and the volume by zone shows 6.06 million barrels in the Upper sand, 4.24 in the Middle, and none in the Lower, which lies below the contact: 10.31 in all.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await expectText(d, t(d, 'em-chart-hist'), /means 0\.187, 0\.185, 0\.183/, 'histogram means');
        await d.highlight('em-chart-hist');
        await d.sleep(3000);
        await d.unhighlight();
        await d.highlight('em-chart-phik');
        await d.sleep(2500);
        await d.unhighlight();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.31 MMstb[\s\S]*0\.006\.064\.240\.00/, 'volumes by zone');
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await d.highlight('em-chart-volumes');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'save', chapter: 'Save', chapterSub: 'The model definition',
      say: 'Saving keeps the definition: the surfaces, ties, zones, grid, methods, seed and contact. The grid is rebuilt from the registry whenever it opens, and the same seed gives the same model.',
      do: async (d) => {
        await t(d, 'em-model-name').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-model-name'), DEMO_MODEL);
        await t(d, 'em-save-model').scrollIntoViewIfNeeded();
        await d.click('em-save-model');
        await d.sleep(2500);
      } },
  ],
};
