// Petroleum Economics with Petrolord, Lesson B6: field life and
// abandonment. The economic limit test, the abandonment bill as a post-tax
// lump sum or a deductible sinking fund, on the Ekene case.
import {
  login, expectText, openRun, rerunWithEdits, runAnalysis, kpi, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson B6: Ekene';
const body = (d) => d.page.locator('body');

export default {
  id: 'lesson-epe-b6',
  ...epeLessonMeta(6, 'B', 'Field life *and abandonment*', 'The economic limit, and a lump sum or a sinking fund for the decommissioning bill'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('Limit on, lump sum')] });
    await openRun(d, shared, CASE, 'Limit on, lump sum');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'limit', chapter: 'The economic limit', chapterSub: 'Stop when the oil stops paying',
      say: 'The forecast runs to twenty forty eight, but a field stops when its revenue no longer covers its operating cost. With the economic limit test on, the engine trims those years: Ekene ends in twenty thirty seven, eleven years early, and the six point eight million dollar abandonment bill falls then.',
      do: async (d) => {
        const b = d.page.getByText(/Economic limit applied: field life ends 2037 \(11 uneconomic years trimmed\)/).first();
        await expectText(d, b, /2037/, 'limit');
        await b.scrollIntoViewIfNeeded();
        await d.highlight(b); await d.sleep(4000);
        await d.highlight(d.page.getByText(/Abandonment \$6\.8M in 2037/).first()); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'off', chapter: 'Without the test', chapterSub: 'Producing at a loss',
      say: 'Turn the test off and the field produces to the end of the forecast, losing money every year from twenty thirty eight, and pays its abandonment in twenty forty eight.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: 'Limit off' });
        const box = d.page.locator('#apply_economic_limit');
        await box.scrollIntoViewIfNeeded();
        await d.click(box); await d.sleep(800);
        await runAnalysis(d, { onCamera: true });
      } },
    { id: 'offres',
      say: 'The N. P. V. rises to two point seven six million dollars. Every one of those eleven extra years loses money; the gain comes from paying the abandonment bill eleven years later. That is the trap the test exists for, so leave it on.',
      do: async (d) => {
        await expectText(d, kpi(d, 'NPV @'), /\$2\.76M/, 'limit off');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'fund', chapter: 'A sinking fund', chapterSub: 'Paying for decommissioning over the years',
      say: 'Abandonment is entered as a post-tax lump sum by default: one cash hit in the last year, not deductible. The Act also allows a decommissioning fund: equal contributions each year from a start year, deductible as they are paid, with the fund paying the bill. We fund it from twenty twenty seven, with the limit back on.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: 'Sinking fund from 2027' });
        const box = d.page.locator('#apply_economic_limit');
        await box.scrollIntoViewIfNeeded();
        if (!(await box.isChecked())) await d.click(box);
        const sel = d.page.locator('#abandonment_funding_mode');
        await d.select(sel, 'sinking_fund');
        await d.sleep(800);
        await d.type(d.page.locator('#abandonment_fund_start_year'), '2027');
        await d.sleep(800);
      } },
    { id: 'escrow', chapter: 'A stated choice', chapterSub: 'The escrow condition',
      say: 'Now the console asks for a choice the Act requires. Under the Nigeria Tax Act a contribution is deductible only if at least thirty percent of the fund sits in an accredited escrow account with a Nigerian bank. The engine will not assume it either way, so we state it: met.',
      do: async (d) => {
        const sel = d.page.locator('#pia_decom_escrow_condition_met');
        await sel.scrollIntoViewIfNeeded();
        await d.highlight(sel.locator('xpath=ancestor::div[contains(@class,"space-y")][1]')); await d.sleep(4500); await d.unhighlight();
        await d.select(sel, 'yes');
        await d.sleep(800);
        await runAnalysis(d, { onCamera: true });
      } },
    { id: 'fundres',
      say: 'With the fund, the field is worth two point three seven million dollars, up from one point nine eight. The bill is the same; the contributions are deductible as they are paid, while the lump sum is not.',
      do: async (d) => {
        await expectText(d, kpi(d, 'NPV @'), /\$2\.37M/, 'fund');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'next', chapter: 'Field life', chapterSub: 'Next: reading the results',
      say: 'When the field stops and how its abandonment is paid both move the value, and both are stated on the result. Next module: reading the results.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
