// Well Testing with Petrolord, Lesson C7: matching a model. Ekene-1: the
// homogeneous model with storage and skin, by hand and by regression, the
// confidence intervals, and what turns a regression back into a hand match.
import { expectText, expectValue, setupTest, tab, kpi, fill, railRow, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-c7',
  ...wtLessonMeta(7, 'C', 'Matching a model, *by hand and by regression*', 'Storage, skin and permeability fitted to the pressure and its derivative'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson C7: Ekene-1 match', test: 'e1', tabName: 'Match' });
  },
  steps: [
    { id: 'model', chapter: 'The model', chapterSub: 'Homogeneous, storage and skin',
      say: 'A model is the pressure the reservoir would give if it were the shape the model says. The simplest is a homogeneous reservoir, infinite in every direction, with constant wellbore storage and a skin. Its curves are drawn over the data in green and purple; the default parameters are only a starting point.',
      do: async (d) => { await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.5, dy: 0.5 }); await d.sleep(4000); } },
    { id: 'hand', chapter: 'By hand', chapterSub: 'Each parameter moves one part',
      say: 'Each parameter moves its own part of the curve. Permeability moves the derivative plateau up and down; type two hundred and twenty five and it sits on the data. Storage slides the early unit slope along the time axis. Skin raises the pressure curve and the hump between them.',
      do: async (d) => {
        await fill(d, [[/^Permeability \(md\)/, '225']], { onCamera: true }); await d.sleep(1500);
        await fill(d, [[/^Wellbore storage \(bbl/, '0.0004']], { onCamera: true }); await d.sleep(1500);
        await fill(d, [[/^Skin factor/, '3']], { onCamera: true }); await d.sleep(2000);
      } },
    { id: 'fit', chapter: 'Regression', chapterSub: 'Pressure and derivative together',
      say: 'The regression finishes the job. It fits the pressure change and its derivative together, in log space, starting from the hand match: two hundred and twenty five millidarcies, a skin of five point zero zero and a storage of zero point zero zero zero three five one barrels per p. s. i. The kit built this test with a skin of five.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k');
        await expectText(d, kpi(d, 'Skin'), /^5\.00/, 'skin');
        await expectText(d, kpi(d, 'Storage C'), /^0\.000351/, 'C');
        await d.highlight(kpi(d, 'Skin')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'ci', chapter: 'How sure', chapterSub: 'Ninety five per cent intervals',
      say: 'Below the plots the regression reports a ninety five per cent confidence interval on each parameter. Narrow intervals say the data pin the value down; a wide one says the test cannot tell, often storage in a test that starts late.',
      do: async (d) => {
        const card = d.page.getByText(/Regression result/i).first();
        await card.scrollIntoViewIfNeeded(); await d.highlight(card.locator('xpath=..')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'manual', chapter: 'Hand or regression', chapterSub: 'Said in the report',
      say: 'Move any parameter after the fit and the match becomes a hand match again: the right-hand summary and the report say so, and the confidence intervals are withdrawn, because they described the fitted values only.',
      do: async (d) => {
        await expectText(d, railRow(d, 'Match method'), /Regression \(converged\)/, 'regression');
        await d.highlight(railRow(d, 'Match method')); await d.sleep(1500); await d.unhighlight();
        await fill(d, [[/^Skin factor/, '5.2']], { onCamera: true }); await d.sleep(800);
        await expectText(d, railRow(d, 'Match method'), /Manual match/, 'manual');
        await d.highlight(railRow(d, 'Match method')); await d.sleep(2500); await d.unhighlight();
      } },
  ],
};
