// Well Testing with Petrolord, Lesson C8: boundaries. Ekene-5: the infinite
// model misses the late rise, the sealing-fault model matches it; the
// two-line distance against the model's, and the earth model's 533 ft.
import { expectText, expectValue, setupTest, tab, kpi, fill, pick, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-c8',
  ...wtLessonMeta(8, 'C', 'Boundaries: *a sealing fault*', 'An infinite model that misses, a fault model that fits, and two ways to the distance'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson C8: Ekene-5 fault', test: 'e5', tabName: 'Match' });
  },
  steps: [
    { id: 'infinite', chapter: 'An infinite reservoir', chapterSub: 'Fitted anyway',
      say: 'Fit Ekene-5 with the infinite homogeneous model first. The regression does its best: one hundred and eighty five millidarcies and a skin of three point four eight. But look at the late derivative: the data climb and the model stays flat. A model that misses the late time is the wrong model, however good the numbers look.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit (converged|stopped)/).first().waitFor({ timeout: 120000 }); await d.sleep(800);
        await expectText(d, kpi(d, 'Permeability k'), /^185/, 'k inf');
        await expectText(d, kpi(d, 'Skin'), /^3\.48/, 'skin inf');
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.82, dy: 0.62 }); await d.sleep(3000);
      } },
    { id: 'fault', chapter: 'A sealing fault', chapterSub: 'An image well',
      say: 'A sealing fault behaves like a mirror: the reservoir acts as though a second well, producing at the same rate, sat the same distance behind the fault. Its effect arrives late and doubles the derivative. Choose the model with a sealing fault and fit again.',
      do: async (d) => {
        await pick(d, 'Reservoir model', /Homogeneous \+ sealing fault/, { onCamera: true });
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 }); await d.sleep(800);
      } },
    { id: 'fit',
      say: 'Now the model follows the data to the end of the week: two hundred and twenty five millidarcies, skin five point three five, and the fault five hundred and thirty two feet away.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k');
        await expectText(d, kpi(d, 'Distance to boundary'), /^532/, 'L');
        await d.highlight(t(d, 'wts-match-model-params')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'lines', chapter: 'Two straight lines', chapterSub: 'Gray\'s method',
      say: 'The straight-line route on the Specialized tab reads four hundred and thirty one feet, because a week was not long enough for the late line to double. The model uses the whole transition, so it does better on a short test.',
      do: async (d) => {
        await tab(d, 'Specialized', { onCamera: true });
        await fill(d, [[/^Late from/, '72'], [/^Late to/, '168']], { onCamera: true });
        const c = t(d, 'wts-fault-result'); await c.scrollIntoViewIfNeeded();
        await expectText(d, kpi(d, 'Distance to the fault L'), /^431/, 'L lines');
        await d.highlight(c); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'truth', chapter: 'The geology', chapterSub: 'The Ekene Growth Fault',
      say: 'In the Ekene earth model the growth fault throws the Ekene Sand ninety metres against shale, one hundred and sixty two and a half metres, five hundred and thirty three feet, from Ekene-5. A well test cannot say which fault it found; the structure map can, and the two agree. Other boundaries, a channel, a closed tank or a constant-pressure aquifer, each have their model in the same list.',
      do: async (d) => {
        await tab(d, 'Match', { onCamera: true });
        await d.click(d.page.getByLabel('Reservoir model').first()); await d.sleep(3000);
        await d.page.keyboard.press('Escape'); await d.sleep(800);
      } },
  ],
};
