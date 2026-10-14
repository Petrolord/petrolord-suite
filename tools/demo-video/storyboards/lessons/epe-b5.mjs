// Petroleum Economics with Petrolord, Lesson B5: one field, three fiscal
// regimes. The Ekene case under the PIA, a generic joint venture (royalty
// and tax) and a generic production sharing contract (cost oil and profit
// oil), compared side by side.
import {
  login, expectText, openRun, rerunWithEdits, fillConsole, runAnalysis, kpi, caseId, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson B5: Ekene';

export default {
  id: 'lesson-epe-b5',
  ...epeLessonMeta(5, 'B', 'One field, *three fiscal regimes*', 'PIA, a joint venture and a production sharing contract side by side'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('PIA'), KIT_RUN('Joint venture', { regime: 'JV', waterDepthM: null })] });
    await openRun(d, shared, CASE, 'Joint venture');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'jv', chapter: 'A joint venture', chapterSub: 'Royalty and tax',
      say: 'The same Ekene files, priced under a generic joint venture: a ten percent royalty and a fifty percent tax on profit after costs and depreciation. The field is worth two point eight seven million dollars, with government taking eighty four point one percent.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /NPV @ 10\.0% \(real\)\s*\$2\.87M[\s\S]*Government take\s*84\.1%/, 'JV');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(3500);
        await d.highlight(kpi(d, 'Government take')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'psc', chapter: 'A production sharing contract', chapterSub: 'Cost oil and profit oil',
      say: 'Under a production sharing contract the contractor recovers its costs from cost oil, capped here at eighty percent of revenue after royalty, and the rest, profit oil, is split, fifty percent to the contractor, before tax. The console also takes profit oil tranches by cumulative production and an investment tax credit.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: 'Production sharing' });
        await fillConsole(d, { regime: 'PSC' }, { onCamera: true });
        for (const id of ['psc_cost_oil_cap_pct', 'psc_contractor_profit_share_pct', 'psc_tax_rate_pct', 'psc_profit_split_mode']) {
          const l = d.page.locator(`#${id}`); if (await l.count()) { await d.moveTo(l); await d.sleep(1500); }
        }
        await runAnalysis(d, { onCamera: true });
      } },
    { id: 'pscres',
      say: 'Under the contract the field is worth nine hundred and seventeen thousand dollars. Government takes one hundred and seven percent of the undiscounted profit, more than all of it, because undiscounted the contractor ends behind once it pays for the abandonment, and one hundred and thirty thousand dollars of cost is never recovered.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /NPV @ 10\.0% \(real\)\s*\$917K[\s\S]*Government take\s*106\.8%[\s\S]*unrecovered at cessation\s*\$130K/, 'PSC');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'compare', chapter: 'Side by side', chapterSub: 'Compare Runs',
      say: 'Compare Runs lines the three up, with the regime on the first row and the change against the first run under each figure. The joint venture is worth eight hundred and ninety one thousand dollars more than the Act, the contract one point oh six million less, and the contract needs five dollars forty more on the oil price to break even.',
      do: async (d, shared) => {
        const id = await caseId(shared, CASE);
        await d.page.goto(`${shared.baseUrl}/dashboard/apps/economics/epe/cases/${id}/compare`, { waitUntil: 'domcontentloaded' });
        await d.page.getByText('Available Runs').waitFor({ timeout: 60000 });
        await d.page.getByText('Production sharing', { exact: false }).first().waitFor({ timeout: 60000 });
        await d.sleep(1200);
        for (const r of ['PIA', 'Joint venture', 'Production sharing']) await d.click(d.page.locator('label', { hasText: new RegExp(`^${r} \\(`) }).first());
        await d.click(d.page.getByRole('button', { name: /Compare Selected Runs/ }));
        await d.page.getByText('Comparison Results').waitFor({ timeout: 60000 });
        await d.sleep(2000);
        await expectText(d, d.page.locator('body'), /\+\$891K vs PIA[\s\S]*-\$1\.06M vs PIA[\s\S]*\+\$5\.4\/bbl vs PIA/, 'compare');
        await d.highlight(d.page.locator('table').first()); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'next', chapter: 'Regimes', chapterSub: 'Next: field life and abandonment',
      say: 'Same oil, same costs, three answers, all stated with their terms. Next lesson: when the field stops, and who pays to take it away.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
