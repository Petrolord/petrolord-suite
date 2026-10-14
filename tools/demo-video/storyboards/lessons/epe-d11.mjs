// Petroleum Economics with Petrolord, Lesson D11: comparing runs and
// incremental economics. Two cases, with and without Ekene-11, compared
// run against run: what differs, the cumulative cash, and the increment
// valued the way the engine values a run.
import {
  login, expectText, caseId, lessonCase, KIT_RUN, FILES, epeLessonMeta,
} from './epe-common.mjs';

const WITH = 'Lesson D11: Ekene with Ekene-11';
const WITHOUT = 'Lesson D11: Ekene without Ekene-11';
const body = (d) => d.page.locator('body');

export default {
  id: 'lesson-epe-d11',
  ...epeLessonMeta(11, 'D', 'Comparing runs *and the increment*', 'With and without a well, run against run, and the value it adds'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, WITHOUT, { files: [['prod', FILES.prodNo11, '2P'], ['opex', FILES.opexNo11]], runs: [KIT_RUN('Field without Ekene-11', { abandonment: '6000000' })] });
    await lessonCase(d, shared, WITH, { runs: [KIT_RUN('Field with Ekene-11')] });
    const id = await caseId(shared, WITH);
    await d.page.goto(`${shared.baseUrl}/dashboard/apps/economics/epe/cases/${id}/compare`, { waitUntil: 'domcontentloaded' });
    await d.page.getByText('Available Runs').waitFor({ timeout: 60000 });
    await d.sleep(2500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'picker', chapter: 'Choosing runs', chapterSub: 'This case and your others',
      say: 'Compare Runs lists this case\'s runs first and then the runs of your other cases, so a with project run can be set against a without project run kept in its own case. The first run ticked is the base. A decision compares the new well against doing nothing, so the base is the field without Ekene eleven.',
      do: async (d) => {
        await d.moveTo(d.page.getByText(/Lesson D11: Ekene with Ekene-11 \(this case\)/).first()); await d.sleep(2500);
        await d.click(d.page.locator('label', { hasText: /^Field without Ekene-11 \(/ }).first());
        await d.click(d.page.locator('label', { hasText: /^Field with Ekene-11 \(/ }).first());
        await d.click(d.page.getByRole('button', { name: /Compare Selected Runs/ }));
        await d.page.getByText('Comparison Results').waitFor({ timeout: 60000 });
        await d.sleep(2000);
      } },
    { id: 'table', chapter: 'What differs', chapterSub: 'Terms first, then results',
      say: 'The table opens with the terms, regime, prices, rate and basis, so a difference in result can be traced to a difference in input. Then each K. P. I. with its change against the base. Ekene eleven adds thirty five million dollars of revenue, twelve point four million of capex, and nine point three six million of tax.',
      do: async (d) => {
        await expectText(d, body(d), /\+\$35M[\s\S]*\+\$12\.4M[\s\S]*\+\$9\.36M/, 'deltas');
        await d.highlight(d.page.locator('table').first()); await d.sleep(6500); await d.unhighlight();
      } },
    { id: 'cum', chapter: 'Cumulative cash', chapterSub: 'Two paths',
      say: 'The cumulative cash chart puts the two paths on one axis: the dip of twenty twenty seven, and the four extra years Ekene eleven keeps the field alive.',
      do: async (d) => {
        const c = d.page.getByText('Cumulative net cash flow').first();
        await c.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await d.sleep(5000);
      } },
    { id: 'inc', chapter: 'The increment', chapterSub: 'Valued as the engine values a run',
      say: 'The increment is the second run minus the base, year by year from the valuation year, discounted exactly as the engine discounts a run, so its N. P. V. is the difference of the two N. P. V.s: two point four four million dollars. Its cash flow changes sign more than once, so two rates zero it, minus eleven point nine one and twenty four point nine one percent, and the app says to read the N. P. V. It pays back in four point six eight years.',
      do: async (d) => {
        const h = d.page.getByText(/^Incremental:/).first();
        await h.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await d.sleep(1500);
        await expectText(d, body(d), /Incremental NPV\s*\$2\.44M[\s\S]*-11\.91% and 24\.91%[\s\S]*Incremental payback\s*4\.68 years/, 'increment');
        await d.highlight(d.page.getByTestId('incremental-verdict')); await d.sleep(3500); await d.unhighlight();
        await d.sleep(5000);
      } },
    { id: 'deltas', chapter: 'Year by year', chapterSub: 'The delta table',
      say: 'Below, the delta for each year and its running total, and Download comparison writes the whole page to a C. S. V.',
      do: async (d) => {
        const t = d.page.locator('table').last();
        await t.scrollIntoViewIfNeeded(); await d.sleep(3500);
        await d.moveTo(d.page.getByRole('button', { name: /Download comparison/ })); await d.sleep(2000);
      } },
    { id: 'next', chapter: 'The increment', chapterSub: 'Next: keeping the economics current',
      say: 'With and without, on the same terms, valued the same way. Next lesson: approvals, shared assumptions, and knowing when a run is out of date.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
