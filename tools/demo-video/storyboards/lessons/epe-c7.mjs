// Petroleum Economics with Petrolord, Lesson C7: reading the KPIs. NPV and
// its basis, why an IRR can be missing or read backwards, payback and
// discounted payback, the profitability indices, unit costs, breakeven,
// government take, and the value per barrel card.
import {
  login, expectText, openRun, kpi, lessonCase, KIT_RUN, FILES, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson C7: Ekene';
const NO11 = 'Lesson C7: Ekene without Ekene-11';
const hl = async (d, l, ms = 3000) => { await l.scrollIntoViewIfNeeded(); await d.highlight(l); await d.sleep(ms); await d.unhighlight(); };

export default {
  id: 'lesson-epe-c7',
  ...epeLessonMeta(7, 'C', 'Reading *the KPIs*', 'NPV, IRR and its reasons, payback, indices, unit costs, breakeven and take'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, NO11, { files: [['prod', FILES.prodNo11, '2P'], ['opex', FILES.opexNo11]], runs: [KIT_RUN('Without Ekene-11', { abandonment: '6000000' })] });
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('With Ekene-11')] });
    await openRun(d, shared, CASE, 'With Ekene-11');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'npv', chapter: 'NPV', chapterSub: 'The number that decides',
      say: 'The N. P. V. card says how it was struck: at ten percent, in real dollars. One point nine eight million dollars is what the field adds over and above a ten percent return on every dollar put in. Total revenue, capex and tax sit beside it, undiscounted.',
      do: async (d) => {
        await hl(d, kpi(d, 'NPV @'), 4000);
        for (const l of ['Total Revenue', 'Total CAPEX', 'Total Tax']) await hl(d, kpi(d, l), 1500);
      } },
    { id: 'irr', chapter: 'IRR', chapterSub: 'When there is no single rate',
      say: 'The I. R. R. is the rate that makes the N. P. V. zero. Ekene\'s cash flow changes sign three times, so three rates do it, and the app prints them rather than pick one. A missing I. R. R. always comes with its reason: no sign change, a rate beyond a thousand percent, or several roots.',
      do: async (d) => {
        await hl(d, kpi(d, 'IRR'), 2000);
        await hl(d, d.page.getByTestId('epe-irr-reason'), 5000);
      } },
    { id: 'payback', chapter: 'Payback', chapterSub: 'Plain and discounted',
      say: 'Payback is when the cumulative cash first turns positive: three point eight four years. Discounted payback does the same on discounted cash: four point one six years.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /Payback\s*3\.84 years[\s\S]*Discounted payback\s*4\.16 yrs/, 'paybacks');
        await hl(d, kpi(d, 'Payback'), 2500);
        await hl(d, kpi(d, 'Discounted payback'), 2500);
      } },
    { id: 'indices', chapter: 'Indices and unit costs', chapterSub: 'Per dollar and per barrel',
      say: 'The profitability index is one plus the N. P. V. over the present value of capex: one point one eight, so each dollar of capex returns one dollar eighteen in present value. D. P. I. is the N. P. V. over that capex: nought point one eight. Unit technical cost is forty two dollars fourteen a barrel of oil equivalent, of which opex is fifteen fifty four.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /Unit technical cost\s*\$42\.14\/boe\s*OPEX per boe\s*\$15\.54\/boe\s*DPI\s*0\.18\s*Profitability index\s*1\.18/, 'indices');
        for (const l of ['Profitability index', 'DPI', 'Unit technical cost', 'OPEX per boe']) await hl(d, kpi(d, l), 2000);
      } },
    { id: 'take', chapter: 'Breakeven and take', chapterSub: 'How much room, and who gets it',
      say: 'The breakeven oil price is the flat price at which the N. P. V. is zero: sixty four dollars ten. Government take is the state\'s share of the profit, ninety three point two percent undiscounted and eighty seven point nine discounted.',
      do: async (d) => {
        for (const l of ['Breakeven oil price', 'Government take', 'Govt take (disc.)']) await hl(d, kpi(d, l), 2200);
      } },
    { id: 'unit', chapter: 'Value per barrel', chapterSub: 'A sender to prospect valuation',
      say: 'The value per barrel card turns the run into two point seven four dollars of N. P. V. per barrel of oil equivalent, full cycle, and can send it to Risked Reserves Valuation with its price deck, rate and date attached.',
      do: async (d) => {
        const c = d.page.getByText('Value per barrel for a prospect valuation').first().locator('xpath=..');
        await expectText(d, c, /2\.74 USD\/boe/, 'unit value');
        await hl(d, c, 5000);
      } },
    { id: 'backwards', chapter: 'An IRR that reads backwards', chapterSub: 'The field without Ekene-11',
      say: 'One more case. The field without Ekene eleven reports an I. R. R. of thirteen point five three percent, above the ten percent rate, with a negative N. P. V. Its cash comes in first and the abandonment bill goes out last, so the rate is a cost of money, and the app says so: read the N. P. V.',
      do: async (d, shared) => {
        await openRun(d, shared, NO11, 'Without Ekene-11');
        await expectText(d, d.page.locator('body'), /-\$459K[\s\S]*13\.53%/, 'without');
        await hl(d, kpi(d, 'IRR'), 2000);
        await hl(d, d.page.getByTestId('epe-irr-caution'), 6000);
      } },
    { id: 'next', chapter: 'KPIs', chapterSub: 'Next: charts and reports',
      say: 'Every figure comes with its basis and, where it can mislead, its reason. Next lesson: the charts and the reports.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
