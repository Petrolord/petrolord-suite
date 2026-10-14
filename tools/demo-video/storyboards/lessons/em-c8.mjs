// Earth Modelling with Petrolord, Lesson C8: variograms and variance.
// The fitted variogram in the provenance, the variance map, the kriging
// range of the volume, and what a fallback means.
import { login, expectText, openEm, stackEkene, fluids, methods, build, t, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-c8',
  ...emLessonMeta(8, 'C', 'Variograms *and variance*', 'The fitted variogram, the variance map, the volume range and fallbacks'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'variogram', chapter: 'The variogram', chapterSub: 'Fitted from the wells',
      say: 'With fit from the wells ticked, the variogram\'s range and sill come from the wells\' own semivariogram, after a plane is removed. The provenance line gives the model and the fitted numbers.',
      do: async (d) => {
        await t(d, 'em-vg-fit').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-vg-fit').locator('xpath=../..'));
        await d.sleep(3000);
        await d.unhighlight();
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-prov-ekene-sand-phi').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-prov-ekene-sand-phi'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'variance', chapter: 'The variance map', chapterSub: 'Where the model is guessing',
      say: 'Kriging gives a variance at every node: lowest at the wells and growing away from them. The map of it says where the model is guessing.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'phi_var');
        await d.sleep(3500);
      } },
    { id: 'range', chapter: 'The volume range', chapterSub: 'Every node moving together',
      say: 'Under the volume table, the property range moves every kriged property one point two eight standard deviations the same way at once: a quick low and high case, here nine point five three to ten point five nine million barrels around ten point zero six.',
      sub: 'Under the volume table, the property range moves every kriged property 1.28 standard deviations the same way at once: a quick low and high case, here 9.53 to 10.59 million barrels around 10.06.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-range-ekene-sand').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-range-ekene-sand'), /STOIIP P90 9\.532, P50 10\.055, P10 10\.593/, 'range');
        await d.highlight(t(d, 'em-range-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'fallback', chapter: 'Fallbacks', chapterSub: 'Said in amber',
      say: 'Kriging needs four wells in a block and some variation to fit. Where it cannot, it falls back to a plane or a mean, and the build says so in amber. Here only two wells have oil above the contact, which is why water saturation uses inverse distance.',
      do: async (d) => {
        await t(d, 'em-prov-ekene-sand-sw').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-prov-ekene-sand-sw'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
