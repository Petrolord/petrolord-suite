// Basin Modelling with Petrolord, Lesson C8: maturity and the kitchen.
import { login, expectText, openBf, enterExpert, newModel, importColumn, thermal, simulate, resultsTab, deleteModels, seedModel, t, tab, bfLessonMeta, EK1 } from './bf-common.mjs';

const NAME = 'Lesson C8: East kitchen';
export default {
  id: 'lesson-bf-c8',
  ...bfLessonMeta(8, 'C', 'Maturity *and the kitchen*', 'A pseudo-well where the source is buried, and the oil and gas windows'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^Lesson C8:/);
    await seedModel(shared, 'ek1-calibrated', EK1);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'The kitchen', chapterSub: 'Where the source is deep',
      say: 'A kitchen is where the source rock is buried deep enough to generate. East of Ekene the growth fault let the delta pile up thicker, so the Akata there sits far deeper than at the well. With no well, we model a pseudo-well from the regional section: a column file with depths below the seabed.',
      do: async (d) => {
        await newModel(d, NAME, { onCamera: true });
        await importColumn(d, 'ekene-east-kitchen-column.csv', { onCamera: true, apply: false });
        await d.sleep(1000);
      } },
    { id: 'column',
      say: 'Twelve layers to fourteen thousand six hundred and ten feet. The file marks two sources: the Upper Akata, marine, and the Lower Akata, terrigenous and gas-prone. The heat flow is Ekene-1\'s, fifty eight and a half.',
      sub: 'Twelve layers to 14,610 ft. The file marks two sources: the Upper Akata, marine, and the Lower Akata, terrigenous and gas-prone. The heat flow is Ekene-1\'s, 58.5.',
      do: async (d) => {
        await d.highlight(t(d, 'bf-import-preview-tops')); await d.sleep(4000); await d.unhighlight();
        await d.click(t(d, 'bf-import-apply-tops'));
        await d.sleep(800);
        await thermal(d, { surfaceF: 77, hf: 58.5, onCamera: true });
      } },
    { id: 'windows', chapter: 'Maturity windows', chapterSub: '0.55, 1.3 and 2.0 %Ro',
      say: 'Simulate and open Maturity. Vitrinite reflectance through time for each layer, against the windows: oil from zero point five five percent, wet gas from one point three, dry gas from two. The Upper Akata entered the oil window over twenty million years ago and is at one point two five today; the Lower Akata has passed into the gas window, at one point nine one.',
      sub: 'Simulate and open Maturity. Vitrinite reflectance through time for each layer, against the windows: oil from 0.55 %Ro, wet gas from 1.3, dry gas from 2. The Upper Akata entered the oil window over twenty million years ago and is at 1.25 today; the Lower Akata has passed into the gas window, at 1.91.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'maturity', { onCamera: true });
        await d.sleep(6000);
      } },
    { id: 'summary',
      say: 'The summary table gives the same at the present day, layer by layer.',
      do: async (d) => {
        await resultsTab(d, 'summary', { onCamera: true });
        await expectText(d, 'bf-present-table', /Upper Akata source[\s\S]*1\.24\d[\s\S]*Lower Akata source[\s\S]*1\.9\d\d/, 'present');
        await d.highlight(t(d, 'bf-present-table')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'isolines', chapter: 'Isolines', chapterSub: 'On the burial plot',
      say: 'On the burial plot the windows become lines through depth and time: the zero point five five line rises as the basin heats, and the one point three line has reached the lower source. The kitchen is mature, and the next lesson asks how much it generated and expelled, and when.',
      sub: 'On the burial plot the windows become lines through depth and time: the 0.55 line rises as the basin heats, and the 1.3 line has reached the lower source. The kitchen is mature, and the next lesson asks how much it generated and expelled, and when.',
      do: async (d) => { await resultsTab(d, 'burial', { onCamera: true }); await d.sleep(5500); } },
  ],
};
