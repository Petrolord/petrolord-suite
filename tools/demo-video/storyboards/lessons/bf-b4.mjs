// Basin Modelling with Petrolord, Lesson B4: heat flow and the surface.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, seedModel, t, tab, bfLessonMeta, layerCard, thermal } from './bf-common.mjs';

const NAME = 'Lesson B4: Ekene-1';
export default {
  id: 'lesson-bf-b4',
  ...bfLessonMeta(4, 'B', 'Heat flow *and the surface*', 'The boundaries of the heat solution, conductivity and the temperature history'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await seedModel(shared, 'ek1-calibrated', NAME, { heat_flow: { type: 'constant', value: 60, history: [] } });
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await tab(d, 'properties');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'bounds', chapter: 'Two boundaries', chapterSub: 'The surface and the base',
      say: 'Temperature in the column is solved between two boundaries. At the top, the surface temperature: for an offshore well, the seabed, seventy seven degrees at Ekene. At the base, the heat flow coming up from below, in milliwatts per square metre. Sixty is a typical passive margin value.',
      sub: 'Temperature in the column is solved between two boundaries. At the top, the surface temperature: for an offshore well, the seabed, 77 °F at Ekene. At the base, the heat flow coming up from below, in milliwatts per square metre. Sixty is a typical passive margin value.',
      do: async (d) => {
        await t(d, 'bf-surface-temp').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'bf-surface-temp')); await d.sleep(3000);
        await d.highlight(t(d, 'bf-heatflow-editor')); await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'history', chapter: 'A heat-flow history', chapterSub: 'When the basin was hotter',
      say: 'Heat flow need not be constant. History takes a table of age and value: a rift basin starts hot and cools. Ekene sits on a passive margin far from its rift, so we keep it constant.',
      do: async (d) => {
        await d.click(t(d, 'bf-heatflow-type-variable'));
        await d.sleep(3000);
        await d.click(t(d, 'bf-heatflow-type-constant'));
        await d.sleep(1500);
      } },
    { id: 'conductivity', chapter: 'Conductivity', chapterSub: 'Sand against shale',
      say: 'Between the boundaries, how fast temperature rises with depth depends on each rock\'s conductivity. Sand conducts heat well, three and a half watts per metre per kelvin; shale half that. So for the same heat flow, the gradient through a shale is about twice as steep. The Ogbia Shale, here.',
      do: async (d) => {
        const card = layerCard(d, 'Ogbia Shale');
        await card.scrollIntoViewIfNeeded();
        await d.click(card.getByTestId('bf-layer-details-toggle'));
        await t(d, 'bf-layer-k-field').waitFor();
        await d.highlight(t(d, 'bf-layer-k-field')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'thermal', chapter: 'The temperature history', chapterSub: 'Each layer through time',
      say: 'Simulate and open Thermal: the temperature of each layer through time. The Akata at the bottom of the well is now at two hundred and twenty one degrees at sixty milliwatts. Every layer has been heating as the delta buried it.',
      sub: 'Simulate and open Thermal: the temperature of each layer through time. The Akata at the bottom of the well is now at 221 °F at sixty milliwatts. Every layer has been heating as the delta buried it.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'temperature', { onCamera: true });
        await d.sleep(4500);
      } },
    { id: 'what', chapter: 'What sets the heat flow', chapterSub: 'The calibration data',
      say: 'Which heat flow is right comes from the well: the measured temperatures and vitrinite decide it. The next two lessons correct the bottom-hole temperatures and fit the heat flow to the data.',
      do: async (d) => { await resultsTab(d, 'summary', { onCamera: true }); await d.sleep(3500); } },
  ],
};
