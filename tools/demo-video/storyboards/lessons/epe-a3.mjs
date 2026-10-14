// Petroleum Economics with Petrolord, Lesson A3: discounting and the
// valuation date. The discount rate and the NPV against rate chart, and the
// valuation year with history treated as sunk, on the Ekene case. (Mid-year
// discounting is left out: its convention was corrected on 2026-10-14,
// owner option A, engine 3.12.3.)
import {
  login, expectText, openRun, rerunWithEdits, runAnalysis, kpi, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson A3: Ekene';
const npvText = (d) => kpi(d, 'NPV @');

export default {
  id: 'lesson-epe-a3',
  ...epeLessonMeta(3, 'A', 'Discounting and *the valuation date*', 'The rate, the NPV against rate curve, and what sunk history means'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('End of year, 10%')] });
    await openRun(d, shared, CASE, 'End of year, 10%');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'ref', chapter: 'Value today', chapterSub: 'Ten percent, end of year, 1 January 2026',
      say: 'An N. P. V. is a sum of each year\'s cash, each divided by one plus the discount rate to the power of its distance from the valuation date. This Ekene run is discounted at ten percent with end of year cash flows, valued in twenty twenty six: one point nine eight million dollars.',
      do: async (d) => {
        await expectText(d, npvText(d), /NPV @ 10\.0% \(real\)\s*\$1\.98M/, 'reference');
        await d.highlight(npvText(d)); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'curve', chapter: 'NPV against rate', chapterSub: 'The same cash flow at every rate',
      say: 'The N. P. V. against discount rate chart prices the same cash flow from zero to twenty percent, with a dot at the applied rate. Ekene\'s curve rises at first, because a higher rate shrinks the abandonment bill at the end of life more than the earlier cash, and then falls. That hump is the same multiple sign change that leaves the field with no single I. R. R.',
      do: async (d) => {
        const c = d.page.getByText('NPV vs Discount Rate').first();
        await c.scrollIntoViewIfNeeded();
        await c.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        await d.sleep(5500);
      } },
    { id: 'sunk', chapter: 'Sunk history', chapterSub: 'Shown, never valued',
      say: 'Ekene has produced since twenty twenty. With Treat years before valuation as sunk ticked, those years stay in the model, so tax pools and allowances carry forward, but they are left out of the N. P. V. Untick it and the history is compounded forward to the valuation date as if it were still to come.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: 'History valued' });
        const box = d.page.getByLabel('Treat years before valuation as sunk');
        await box.scrollIntoViewIfNeeded();
        await d.highlight(box.locator('xpath=..')); await d.sleep(2500); await d.unhighlight();
        await d.click(box);
        await d.sleep(800);
        await runAnalysis(d, { onCamera: true });
      } },
    { id: 'sunkres',
      say: 'The N. P. V. jumps to sixteen point three million dollars, and none of that extra money is still to be made. For a decision taken today, the past is sunk: tick the box.',
      do: async (d) => {
        await expectText(d, npvText(d), /\$16\.3M/, 'history valued');
        await d.highlight(npvText(d)); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'next', chapter: 'Discounting', chapterSub: 'Next: the Nigerian fiscal regime',
      say: 'A rate, a convention and a valuation year, each stated on the result. Next lesson: the fiscal terms under the Petroleum Industry Act.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
