// Geoscience module showcase, scene 6a: quantitative interpretation starts
// from the rock physics. Rock Physics Studio's AVO view at the top of the
// Ekene Sand in Ekene-1: the intercept-gradient crossplot with the class bands.
import { selectRpsWell } from './qi-common.mjs';
import { login, scene, t, park, openApp, expectText, note } from './geo-common.mjs';

export default {
  ...scene('geo-s06a'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'rock-physics-studio', 'rp-well-row');
    await selectRpsWell(d, 'Ekene-1');
    await t(d, 'rp-view-avo').click(); await d.sleep(1500);
    const o = (await t(d, 'rp-avo-top-select').locator('option').allInnerTexts()).find((x) => /^Ekene Sand \(/.test(x));
    await t(d, 'rp-avo-top-select').selectOption({ label: o });
    await d.sleep(2500);
    await park(d);
  },
  steps: [
    { id: 'avo', chapter: 'Quantitative interpretation', chapterSub: 'Rock Physics Studio · AVO',
      say: 'Quantitative interpretation starts from the rock physics. At the top of the Ekene Sand, the oil sand plots in class one: intercept zero point one four, gradient minus zero point five two.',
      sub: 'Quantitative interpretation starts from the rock physics. At the top of the Ekene Sand, the oil sand plots in class I: intercept 0.14, gradient -0.52.',
      do: async (d, shared) => {
        await note(d, shared, 'avo', 'rp-avo-panel');
        await expectText(d, 'rp-avo-panel', /A \(intercept\) 0\.14\d\d[\s\S]*B \(gradient\) -0\.5[12]\d\d[\s\S]*Class I(?![IV])/, 'in situ AVO');
        await d.moveTo(t(d, 'rp-avo-panel'), { ms: 1500, dx: 0.75, dy: 0.6 });
      } },
  ],
};
