// Earth Modelling with Petrolord, Lesson B6: layers (3D grid upgrade,
// 2026-10-17). The 3D grid's layers: proportional, follow top and follow base;
// 2, 2.5 or 3 ft; the skeleton in 3D and section; the player sweeping down
// through the layers; the volume added cell by cell.
import { login, expectText, openEm, gridModel, build, results, grid3d, t, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-b6',
  ...emLessonMeta(6, 'B', '*Layers* in the grid', 'Proportional, follow top and follow base layers, their thickness, and playing through them'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d, { cap: false });
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'proportional', chapter: 'Proportional layers', chapterSub: 'The same count everywhere',
      say: 'Proportional layers keep the same number of layers everywhere in a zone, each the same fraction of it, so they thin and thicken with the zone. The count comes from the zone\'s mean thickness over two and a half feet: nine layers in the Upper sand, twenty in the Middle and twelve in the Lower.',
      do: async (d) => {
        await t(d, 'em-grid-settings').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-grid-settings'));
        await d.sleep(2500);
        await d.unhighlight();
        await expectText(d, 'em-status', /131,610 cells in 41 layers of 2\.5 ft \(proportional\), 3 zones/, 'proportional status');
        await grid3d(d, { ve: 10, density: 1 });
        await d.sleep(3500);
      } },
    { id: 'section', chapter: 'In section', chapterSub: 'The layers follow the zones',
      say: 'The player\'s section shows it best: every layer runs from one side to the other, thin where the zone is thin.',
      do: async (d) => {
        await d.click('em-view-player');
        await d.sleep(1500);
        await d.select(t(d, 'em-player-prop'), 'zone');
        await d.select(t(d, 'em-player-density'), '1');
        await d.sleep(4000);
      } },
    { id: 'top', chapter: 'Follow top', chapterSub: 'Hung from the zone top',
      say: 'Follow top hangs layers of the same thickness from the top of each zone, and the base cuts them off. It suits a zone eroded at its base. Build again.',
      do: async (d) => {
        await t(d, 'em-grid-style').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-grid-style'), 'top');
        await build(d, { onCamera: true });
        await d.click('em-view-player');
        await d.sleep(1500);
        await d.select(t(d, 'em-player-prop'), 'zone');
        await d.select(t(d, 'em-player-density'), '1');
        await d.sleep(4000);
      } },
    { id: 'base', chapter: 'Follow base', chapterSub: 'Stacked up from the base',
      say: 'Follow base stacks them up from the base, and the top cuts them, as sand onlaps a surface. Here the layers end against the top of each zone.',
      do: async (d) => {
        await t(d, 'em-grid-style').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-grid-style'), 'base');
        await build(d, { onCamera: true });
        await d.click('em-view-player');
        await d.sleep(1500);
        await d.select(t(d, 'em-player-prop'), 'zone');
        await d.select(t(d, 'em-player-density'), '1');
        await d.sleep(4000);
      } },
    { id: 'thick', chapter: 'Layer thickness', chapterSub: '2, 2.5 or 3 ft',
      say: 'The layer thickness can be two, two and a half or three feet. Thinner layers keep more of the detail in the logs and make more cells. Back to proportional at two and a half feet.',
      do: async (d) => {
        await t(d, 'em-grid-layer').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-grid-layer'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.select(t(d, 'em-grid-style'), 'proportional');
        await build(d, { onCamera: true });
      } },
    { id: 'play', chapter: 'Playing through the layers', chapterSub: 'Porosity, layer by layer',
      say: 'The player sweeps down the grid one layer at a time. Watch the porosity map change from layer to layer, and the contact line move across the map as the layers dip below it.',
      do: async (d) => {
        await d.click('em-view-player');
        await d.sleep(1500);
        await d.select(t(d, 'em-player-prop'), 'phi');
        await d.click('em-player-rewind');
        await d.click('em-player-play');
        await d.sleep(9000);
        await d.click('em-player-play');
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Added cell by cell',
      say: 'The volume is added cell by cell, each with its own properties: ten point three eight million barrels. On the old frame the layers add up exactly to the zone, so the grid changes how the properties vary, never the rock.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.38 MMstb/, 'volume');
        await d.highlight('em-chart-volumes');
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
