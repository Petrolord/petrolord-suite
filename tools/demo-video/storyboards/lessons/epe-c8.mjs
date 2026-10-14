// Petroleum Economics with Petrolord, Lesson C8: the charts and the
// reports. Annual cash flow, the cash flow profile, the waterfall by year,
// the year-by-year table and the CSV, Excel and PDF exports.
import {
  login, expectText, openRun, showTab, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson C8: Ekene';

export default {
  id: 'lesson-epe-c8',
  ...epeLessonMeta(8, 'C', 'Charts *and reports*', 'Annual cash flow, the profile, the waterfall, the year table and the exports'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('With Ekene-11')] });
    await openRun(d, shared, CASE, 'With Ekene-11');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'annual', chapter: 'Annual cash flow', chapterSub: 'Revenue, costs and net cash',
      say: 'Annual cash flow draws revenue, capex, opex and the net cash for every year. A click on a legend entry hides or shows that series, so the net cash can be read on its own. Twenty twenty seven is the only year below zero before the end: Ekene eleven.',
      do: async (d) => {
        await showTab(d, 'Annual Cash Flow');
        await d.sleep(2500);
        for (const n of ['Revenue', 'CAPEX', 'OPEX']) {
          const l = d.page.locator('.recharts-legend-item', { hasText: n }).first();
          if (await l.count()) { await d.click(l); await d.sleep(900); }
        }
        await d.sleep(3000);
        for (const n of ['Revenue', 'CAPEX', 'OPEX']) {
          const l = d.page.locator('.recharts-legend-item', { hasText: n }).first();
          if (await l.count()) { await l.click(); await d.sleep(300); }
        }
      } },
    { id: 'profile', chapter: 'The profile', chapterSub: 'Every fiscal line, stacked',
      say: 'The cash flow profile stacks every line the regime charges, royalty, the levies, hydrocarbon tax, income tax, education tax and the development levy, under the revenue, with the cumulative cash on top. The chart title names the framework, and the history years are shaded as sunk.',
      do: async (d) => { await showTab(d, 'Cash Flow Profile'); await d.sleep(6500); } },
    { id: 'waterfall', chapter: 'The waterfall', chapterSub: 'One year, line by line',
      say: 'The waterfall breaks one year into its steps. In twenty twenty seven, the year Ekene eleven is drilled, ten and a half million dollars of revenue meets twelve point four million of capex. Hydrocarbon tax and income tax are still paid, because capex is recovered over five years, and the year ends seven point nine million dollars down.',
      do: async (d) => {
        await showTab(d, 'Waterfall');
        const sel = d.page.locator('select').filter({ has: d.page.locator('option[value="all"]') }).last();
        await d.select(sel, '2027');
        await d.sleep(2500);
        await expectText(d, d.page.getByText(/Cash Flow Waterfall: Year 2027/).first().locator('xpath=ancestor::div[3]'), /\+10\.5M[\s\S]*-12\.4M[\s\S]*-1\.6M-1\.7M[\s\S]*-7\.9M/, 'waterfall 2027');
        await d.sleep(3500);
      } },
    { id: 'table', chapter: 'Year by year', chapterSub: 'The numbers behind the charts',
      say: 'Year by year detail is the table behind every chart: volumes, revenue, each fiscal line, the rates and the framework of each year, and the net cash flow.',
      do: async (d) => { await showTab(d, 'Year-by-Year Detail'); await d.sleep(5000); } },
    { id: 'exports', chapter: 'Exports', chapterSub: 'CSV, Excel and the PDF report',
      say: 'C. S. V. and Excel export the same columns with the K. P. I.s, for your own models. The P. D. F. report is the one to circulate: the run\'s inputs, the K. P. I.s with the I. R. R. reason, every chart whichever tab is open, the annual table and the engine notes.',
      do: async (d) => {
        for (const n of ['CSV', 'Excel', 'PDF report']) {
          const b = d.page.getByRole('button', { name: n, exact: true }).first();
          await b.scrollIntoViewIfNeeded(); await d.moveTo(b); await d.sleep(2200);
        }
      } },
    { id: 'next', chapter: 'Charts and reports', chapterSub: 'Next: sensitivity',
      say: 'Charts to understand the run, tables to check it, reports to share it. Next lesson: which inputs move the answer most.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
