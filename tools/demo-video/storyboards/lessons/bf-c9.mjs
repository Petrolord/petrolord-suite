// Basin Modelling with Petrolord, Lesson C9: generation and expulsion.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, seedModel, t, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson C9: East kitchen';
export default {
  id: 'lesson-bf-c9',
  ...bfLessonMeta(9, 'C', 'Generation *and expulsion*', 'Transformation ratio, the retention threshold, oil and gas, and the critical moment'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await seedModel(shared, 'kitchen-run', NAME);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'tr', chapter: 'Transformation ratio', chapterSub: 'How much kerogen has converted',
      say: 'As a source heats, its kerogen converts to oil and gas. The transformation ratio is the share converted: on the Expulsion tab, both Akata sources passed half way about fourteen million years ago, and are almost fully converted today.',
      do: async (d) => {
        await resultsTab(d, 'generation', { onCamera: true });
        await d.page.mouse.wheel(0, 600); await d.sleep(4500); await d.page.mouse.wheel(0, -600); await d.sleep(800);
      } },
    { id: 'mass', chapter: 'Generated mass', chapterSub: 'Organic richness times conversion',
      say: 'The generated mass is the organic carbon times the hydrogen index times the conversion, per square metre of source: the solid lines. The upper source, richer, generates more than three and a half tonnes per square metre.',
      do: async (d) => { await d.sleep(5000); } },
    { id: 'expel', chapter: 'Expulsion', chapterSub: 'Once the rock is full',
      say: 'A source keeps what it generates until its pores hold about ten percent hydrocarbon. Past that it expels: the dashed lines. That is why expulsion starts about twelve million years ago, long after generation began.',
      do: async (d) => { await d.sleep(5000); } },
    { id: 'phase', chapter: 'Oil or gas', chapterSub: 'By the maturity at expulsion',
      say: 'What leaves as oil or gas follows the source\'s maturity when it leaves: below one point three percent, oil; above, gas. The upper source stays in the oil window. All of the lower source\'s expulsion is in the gas window: the dotted line sits on the dashed one.',
      do: async (d) => { await d.sleep(6000); } },
    { id: 'critical', chapter: 'The critical moment', chapterSub: 'Peak expulsion',
      say: 'The Timing tab puts generation and expulsion against the rocks on one time line. The critical moment is the peak of expulsion, five million years ago: the time when the traps must already exist to catch the most charge.',
      do: async (d) => {
        await resultsTab(d, 'timing', { onCamera: true });
        await t(d, 'bf-events-chart').scrollIntoViewIfNeeded();
        await expectText(d, 'bf-critical-moment', /Critical moment 5 Ma/, 'cm');
        await d.highlight(t(d, 'bf-critical-moment')); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
