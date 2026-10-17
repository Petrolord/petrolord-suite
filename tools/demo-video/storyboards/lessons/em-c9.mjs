// Earth Modelling with Petrolord, Lesson C9: Sw from saturation height (3D
// grid upgrade, 2026-10-17). The SCAL Studio J function and its free-water
// level give every cell the water saturation for its height; the transition
// zone in the player's section; the volume against the logs.
import { login, expectText, openEm, stackEkene, fluids, methods, build, results, t, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-c9',
  ...emLessonMeta(9, 'C', 'Sw from *saturation height*', 'The SCAL Studio J function, the free-water level and the transition zone in every cell'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await methods(d, { phi: 'sgs', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Why capillary pressure', chapterSub: 'Saturation changes with height',
      say: 'Water saturation from the logs has only two wells with oil above the contact, and it cannot see how saturation changes with height. Capillary pressure can: near the free water level the rock holds more water than at the crest. The logs give ten point nine million barrels.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.90 MMstb/, 'logs volume');
        await d.highlight('em-chart-volumes');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'project', chapter: 'The J function', chapterSub: 'From SCAL Studio',
      say: 'Saturation height reads a saved SCAL Studio project: the Ekene Sand J function, averaged from three core plugs, with its free water level at five thousand and forty six feet. The rock can be the project\'s, or the model\'s porosity in each cell.',
      do: async (d) => {
        await methods(d, { sw: 'shm' }, { onCamera: true });
        await d.sleep(600);
        const sel = t(d, 'em-shm-project');
        await sel.scrollIntoViewIfNeeded();
        const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
        await d.select(sel, v);
        await d.highlight('em-shm');
        await d.sleep(3000);
        await d.unhighlight();
        await build(d, { onCamera: true });
      } },
    { id: 'cells', chapter: 'Every cell', chapterSub: 'Its height above the free-water level',
      say: 'Every cell now takes the water saturation of its height above the free water level: lowest at the crest, rising down the flanks. In 3D, coloured by water saturation, the crest is the low blue and the flanks turn red.',
      do: async (d) => {
        await d.click('em-view-3d');
        await d.sleep(1500);
        await d.click('em-3d-ve-10');
        await d.select(t(d, 'em-3d-gridprop'), 'sw');
        await d.sleep(4500);
      } },
    { id: 'section', chapter: 'The transition zone', chapterSub: 'In the player\'s section',
      say: 'In the player\'s section the transition zone shows in every layer: water saturation rises with depth towards the contact, dashed across the sand.',
      do: async (d) => {
        await d.click('em-view-player');
        await d.sleep(1500);
        await d.select(t(d, 'em-player-prop'), 'sw');
        await d.sleep(4500);
      } },
    { id: 'volume', chapter: 'Two sources agree', chapterSub: 'The logs and the core',
      say: 'Over the oil leg the field holds ten point zero one million barrels. Two independent sources, the logs and the core capillary pressure, both put the volume near this number, well below the booked crest saturation.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.01 MMstb/, 'SHM volume');
        await d.highlight('em-chart-volumes');
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
