// Basin Modelling with Petrolord, Lesson C7: source rocks from Rock-Eval.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, seedModel, t, deleteModels, tab, bfLessonMeta, layerCard } from './bf-common.mjs';

const NAME = 'Lesson C7: Ekene-1';
export default {
  id: 'lesson-bf-c7',
  ...bfLessonMeta(7, 'C', 'Source rocks *from Rock-Eval*', 'TOC, hydrogen index and kinetics, and what the Akata did at Ekene-1'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await seedModel(shared, 'ek1-calibrated', NAME);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await tab(d, 'properties');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'rockeval', chapter: 'Rock-Eval', chapterSub: 'Twelve cuttings from Ekene-1',
      say: 'Rock-Eval pyrolysis on cuttings measures how much organic carbon a shale holds and how much hydrocarbon its kerogen can still give. At Ekene-1 the Agbada shales hold about one percent organic carbon with a hydrogen index near a hundred and twenty: lean, terrestrial, gas-prone at best. The Akata at the bottom holds one point six percent with a hydrogen index of two hundred and fifty: a fair marine source.',
      sub: 'Rock-Eval pyrolysis on cuttings measures how much organic carbon a shale holds and how much hydrocarbon its kerogen can still give. At Ekene-1 the Agbada shales hold about 1 % organic carbon with a hydrogen index near 120: lean, terrestrial, gas-prone at best. The Akata at the bottom holds 1.6 % with a hydrogen index of 250: a fair marine source.',
      do: async (d) => {
        await d.slide({ eyebrow: 'ekene-1-rock-eval.csv', title: 'Rock-Eval on Ekene-1 cuttings',
          body: '<ul><li><b>Agbada shales</b>, 3,937 to 6,496 ft: TOC 0.8 to 1.2 wt %, HI 110 to 150, Tmax 418 to 429 °C. Lean, terrestrial (Type III).</li><li><b>Akata Formation</b>, 6,857 to 7,349 ft: TOC 1.5 to 1.7 wt %, HI 240 to 255, Tmax 432 to 434 °C. A fair marine source (Type II).</li></ul>' });
        await d.sleep(12000);
        await d.hideSlide();
      } },
    { id: 'source', chapter: 'Marking the source', chapterSub: 'TOC, HI and kinetics',
      say: 'In the Akata Formation\'s details, tick source rock and type the averages: a total organic carbon of one point six and a hydrogen index of two hundred and fifty. A Tmax of four hundred and thirty three degrees means the kerogen has barely started to convert, so these are close to the original values.',
      sub: 'In the Akata Formation\'s details, tick source rock and type the averages: a total organic carbon of 1.6 and a hydrogen index of 250. A Tmax of 433 °C means the kerogen has barely started to convert, so these are close to the original values.',
      do: async (d) => {
        const card = layerCard(d, 'Akata Formation');
        await card.scrollIntoViewIfNeeded();
        await d.click(card.getByTestId('bf-layer-details-toggle'));
        await t(d, 'bf-layer-source').waitFor();
        await d.click(t(d, 'bf-layer-source'));
        await d.type(t(d, 'bf-layer-toc'), '1.6');
        await d.type(t(d, 'bf-layer-hi'), '250');
        await d.sleep(800);
      } },
    { id: 'kinetics',
      say: 'The kinetics say how fast the kerogen converts with temperature. For a marine clastic shale, Pepper and Corvi\'s organofacies B: a frequency factor and a spread of activation energies from their published table.',
      do: async (d) => {
        await d.select(t(d, 'bf-layer-kerogen'), 'pc-B');
        await t(d, 'bf-layer-kinetics-note').waitFor();
        await d.highlight(t(d, 'bf-layer-kinetics-note')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'run', chapter: 'What it did here', chapterSub: 'Barely started',
      say: 'Simulate. At Ekene-1 the Akata has converted about a tenth of its kerogen, a hundred and fifty kilograms of hydrocarbon per square metre, and expelled none of it: the rock holds what little it made. Mature enough to start generating, still too cool here to charge a field.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'generation', { onCamera: true });
        await d.sleep(4000);
        await resultsTab(d, 'timing', { onCamera: true });
        await expectText(d, 'bf-charge-send-bar', /Expelled, present day: 0 kg\/m2/, 'none expelled');
        await d.highlight(t(d, 'bf-charge-send-bar')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'next',
      say: 'So the source is the same Akata, and the question is where it was buried deep enough. Next lesson, the kitchen.',
      do: async (d) => { await d.sleep(3500); } },
  ],
};
