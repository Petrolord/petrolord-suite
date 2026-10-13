// Material Balance with Petrolord, Lesson B4: the straight line. F and Et,
// slope and intercept, r2, and a survey left out of the fit with a reason
// (and put back).
import {
  login, expectText, deleteCases, seedCase, runMbal, showPlot, t, tab, mbalLessonMeta,
} from './mbal-common.mjs';

export default {
  id: 'lesson-mbal-b4',
  ...mbalLessonMeta(4, 'B', 'Havlena-Odeh: *the straight line*', 'F, Et, slope, intercept, r² and leaving a survey out with a reason'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson B4/);
    await seedCase(d, shared, 'Lesson B4: Ekene');
    await d.click(tab(d, 'Plots'));
    await showPlot(d, 'regression');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'f', chapter: 'The balance as a line', chapterSub: 'F against Et',
      say: 'The material balance says that what came out of the tank was made room for by expansion. F is the reservoir volume of what was produced: the oil at its formation volume factor, plus any free gas and water. E t is the expansion of one stock tank barrel of oil and its share of rock and connate water. With no other drive, F equals N times E t: a straight line through the origin, with the oil in place as its slope.',
      do: async (d) => {
        await d.highlight(t(d, 'mbal-plot-regression'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'numbers', chapter: 'Reading the fit', chapterSub: 'Slope, intercept and r²',
      say: 'The fit is ordinary least squares with a free intercept. The slope is twelve point one four million stock tank barrels. The intercept is minus nought point nought nought five two thousand reservoir barrels, a few barrels: close to the origin, as the theory says. An intercept that is large beside F would point at a drive the model leaves out, or at the data. The r squared is one on six points.',
      sub: 'The fit is ordinary least squares with a free intercept. The slope is 12.14 million stock tank barrels. The intercept is −0.005205 thousand reservoir barrels, a few barrels: close to the origin, as the theory says. An intercept that is large beside F would point at a drive the model leaves out, or at the data. The r² is one on six points.',
      do: async (d) => {
        await expectText(d, 'mbal-plot-notes-regression', /N = 12\.14 MMSTB \(slope\)[\s\S]*intercept = -0\.005205 MRB[\s\S]*r2 = 1\.000000, 6 points/, 'fit numbers');
        await d.highlight(t(d, 'mbal-plot-notes-regression'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'exclude', chapter: 'Leaving a survey out', chapterSub: 'Always with a reason',
      say: 'Sometimes a survey should not count: a gauge that had not built up, or a survey off the datum. Leave it out from the data table, or by clicking its point on the plot. A reason is required, and it goes into the report. Here, as an example, the first survey after start-up.',
      do: async (d) => {
        await d.click(tab(d, 'Data'));
        await d.sleep(1200);
        const table = t(d, 'mbal-data-table');
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.click('mbal-exclusion-exclude-1');
        await d.sleep(500);
        await d.type('mbal-exclusion-input-1', 'Example: survey taken before the well had built up');
        await d.click('mbal-exclusion-confirm-1');
        await t(d, 'mbal-exclusion-reason-1').waitFor({ timeout: 30000 });
        await d.sleep(800);
        await d.highlight(t(d, 'mbal-exclusion-1').locator('xpath=ancestor::tr[1]'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'rerun',
      say: 'The stored run is now an earlier run, and the studio says so. Run again: five points in the fit, and the same twelve point one four million, because every Ekene survey sits on the line. On field data, a point left out can move the answer, and the reason is what lets a reviewer judge it.',
      sub: 'The stored run is now an earlier run, and the studio says so. Run again: five points in the fit, and the same 12.14 million, because every Ekene survey sits on the line. On field data, a point left out can move the answer, and the reason is what lets a reviewer judge it.',
      do: async (d) => {
        await d.click(tab(d, 'Run'));
        await d.sleep(1200);
        await d.highlight(t(d, 'mbal-stale-run'));
        await d.sleep(2500);
        await d.unhighlight();
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB[\s\S]*5 points in the fit/, 'five points');
        await d.highlight(t(d, 'mbal-result-card').locator('div.grid').first());
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'restore', chapter: 'Putting it back', chapterSub: 'Restore',
      say: 'Restore puts the survey back, and the next run uses all six again.',
      do: async (d) => {
        await d.click(tab(d, 'Data'));
        await d.sleep(1000);
        const table = t(d, 'mbal-data-table');
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        await d.click('mbal-exclusion-restore-1');
        await t(d, 'mbal-exclusion-exclude-1').waitFor({ timeout: 30000 });
        await d.sleep(800);
      },
      wait: async (d) => { await runMbal(d); },
      waitLabel: 'Run again' },
    { id: 'next', chapter: 'Next', chapterSub: 'Is there an aquifer?',
      say: 'Next, testing the closed tank: is there an aquifer hiding in this data?',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
