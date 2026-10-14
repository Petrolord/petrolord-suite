// Earth Modelling with Petrolord, Lesson C9: Sw from saturation height.
// The SCAL Studio J function and free-water level, Sw at every node from
// its height, the transition zone, and the volume it gives.
import { login, expectText, openEm, stackEkene, fluids, methods, build, t, vol, emLessonMeta, sectionPair } from './em-common.mjs';

export default {
  id: 'lesson-em-c9',
  ...emLessonMeta(9, 'C', 'Sw from *saturation height*', 'The SCAL Studio J function, the free-water level and the transition zone'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await t(d, 'em-layers-0').fill('5');
    await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Why saturation height', chapterSub: 'Two wells with oil',
      say: 'Water saturation from the logs has only two wells with oil above the contact, and it cannot see how saturation changes with height. Capillary pressure can: near the free water level the rock holds more water than at the crest.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-hcavg-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'pick', chapter: 'The J function', chapterSub: 'From SCAL Studio',
      say: 'Saturation height reads a saved SCAL Studio project: here the Ekene Sand J function, averaged from three core plugs, with its free water level at five thousand and forty six feet. The rock can be the project\'s, or the model\'s porosity at each node.',
      sub: 'Saturation height reads a saved SCAL Studio project: here the Ekene Sand J function, averaged from three core plugs, with its free-water level at 5,046 ft. The rock can be the project\'s, or the model\'s porosity at each node.',
      do: async (d) => {
        await methods(d, { sw: 'shm' }, { onCamera: true });
        await d.sleep(600);
        const sel = t(d, 'em-shm-project');
        await sel.scrollIntoViewIfNeeded();
        const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
        await d.select(sel, v);
        await d.highlight(t(d, 'em-shm'));
        await d.sleep(2500);
        await d.unhighlight();
        await build(d, { onCamera: true });
      } },
    { id: 'map', chapter: 'Sw by height', chapterSub: 'Lower at the crest',
      say: 'Every node now takes the mean water saturation of its oil column for its height above the free water level: lowest at the crest, rising down the flanks.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'sw');
        await d.sleep(1200);
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(3000);
      } },
    { id: 'section', chapter: 'In section', chapterSub: 'The transition zone',
      say: 'In section the layers show the transition zone: water saturation rises with depth towards the contact in every layer.',
      do: async (d) => {
        await d.click('em-view-section');
        await d.sleep(800);
        await sectionPair(d, 'Ekene-1', 'Ekene-4');
        await d.select(t(d, 'em-sec-colour'), 'sw');
        await d.sleep(3500);
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Ten point three six million barrels',
      say: 'Over the oil leg the water saturation averages zero point five three, and the field holds ten point three six million barrels, seven percent below the logs\' eleven point one. Two independent sources, the logs and the core capillary pressure, both put the leg near zero point five.',
      sub: 'Over the oil leg the water saturation averages 0.53, and the field holds 10.36 million barrels, 7% below the logs\' 11.1. Two independent sources, the logs and the core capillary pressure, both put the leg near 0.5.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^10\.358$/, 'SHM STOIIP');
        await expectText(d, t(d, 'em-hcavg-ekene-sand'), /Sw 0\.531/, 'SHM Sw');
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
