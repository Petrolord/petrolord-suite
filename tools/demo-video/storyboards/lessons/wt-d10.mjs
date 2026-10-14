// Well Testing with Petrolord, Lesson D10: a buildup after a rate history.
// Ekene-11: superposition time and its equivalent time, why the last rate
// and an equivalent tp are not enough, and the model through every step.
import { expectText, setupTest, tab, kpi, pick, scrollMain, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-d10',
  ...wtLessonMeta(10, 'D', 'A buildup after *a rate history*', 'Superposition time, equivalent time, and a model through every rate step'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson D10: Ekene-11 history', test: 'e11' });
  },
  steps: [
    { id: 'history', chapter: 'The rate history', chapterSub: 'Five steps',
      say: 'Ekene-11\'s first test flowed at forty barrels a day, shut in for an hour, flowed at a hundred for twelve hours, then at forty for four while samples were taken, before the two-day buildup. The overview draws the rates under the pressure, on the same clock.',
      do: async (d) => {
        const ov = d.page.getByText('Test overview').first();
        await ov.scrollIntoViewIfNeeded(); await d.sleep(4500); await scrollMain(d, 0);
      } },
    { id: 'super', chapter: 'Superposition', chapterSub: 'Every rate change is a well',
      say: 'The equations of a well test are linear, so a rate history is a sum: each change of rate starts its own pressure response, and the buildup is all of them added at once. Horner\'s ratio is the one-rate case of the superposition time, and Agarwal\'s equivalent time the one-rate case of its log-log time. The studio uses the general forms when the buildup is read after the rate history.',
      do: async (d) => {
        await t(d, 'wts-time-basis').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'wts-time-basis-note')); await d.sleep(3500); await d.unhighlight();
        await pick(d, 'Buildup time basis', /rate history above/, { onCamera: true }); await d.sleep(800);
      } },
    { id: 'line', chapter: 'The superposition line', chapterSub: 'k, skin, and p* at X = 0',
      say: 'On the Specialized tab the straight line is now fitted against superposition time, still drawn as a ratio so it reads like Horner. Two hundred and seventeen millidarcies, skin five point two five, and p star at the reservoir pressure.',
      do: async (d) => {
        await tab(d, 'Specialized', { onCamera: true });
        await expectText(d, kpi(d, 'Permeability k'), /^217/, 'k');
        await expectText(d, kpi(d, 'Skin'), /^5\.25/, 'skin');
        await d.highlight(t(d, 'wts-semilog-history-note')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'mdh', chapter: 'MDH after a short flow', chapterSub: 'It bends',
      say: 'The MDH cross-check reads one hundred and ninety nine millidarcies here: two days of buildup against thirty eight hours of flow is far past the tenth of t p where MDH holds, and the card says to use the superposition line.',
      do: async (d) => {
        const c = t(d, 'wts-mdh-buildup'); await c.scrollIntoViewIfNeeded();
        await expectText(d, c, /199/, 'mdh k');
        await d.highlight(c); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'model', chapter: 'The model', chapterSub: 'Through every step',
      say: 'The model and the regression run through every rate step too. The fit returns two hundred and twenty five millidarcies and a skin of five point six one, the values the test was built from, and the history match on the Report tab draws the model through the whole test, flow periods and all.',
      do: async (d) => {
        await tab(d, 'Match', { onCamera: true });
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k fit');
        await expectText(d, kpi(d, 'Skin'), /^5\.61/, 'skin fit');
        await d.highlight(kpi(d, 'Skin')); await d.sleep(2500); await d.unhighlight();
      } },
  ],
};
