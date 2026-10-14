// Petroleum Economics Studio, demo 1: from the plan to the investment
// decision (Ekene kit v4, 12-economics). A case for the Ekene field with
// Ekene-11, the kit's production (tagged 2P), capex (the Ekene-11 AFE) and
// opex, the Run Console set as the kit says (USD 75 flat, associated gas
// unsold, valued at 1 January 2026 with history sunk, economic limit,
// abandonment USD 6.8 MM, PIA in 35 m of water), the result, the cash flow,
// and the decision: compared with the same field without Ekene-11 (a case
// the setup makes), the well adds USD 2.44 MM.
// `expectText` steps stop the take if the screen disagrees with the narration
// (LENIENT=1 logs instead, for writing).
import {
  login, expectText, deleteCases, seedCase, openCases, newCase, upload, openConsole, fillConsole, runAnalysis,
  caseId, kpi, showTab, bodyText, FILES, KIT_CONSOLE,
} from './epe-common.mjs';

export const WITH = 'EPE demo: Ekene with Ekene-11';
export const WITHOUT = 'EPE demo: Ekene without Ekene-11';
export const RUN_WITH = 'With Ekene-11, 2P, $75';
export const RUN_WITHOUT = 'Without Ekene-11, 2P, $75';

/** The comparison case, made off camera when it is not there. */
export async function ensureWithout(d, shared) {
  if (await caseId(shared, WITHOUT)) return;
  await seedCase(d, shared, WITHOUT, {
    description: 'The four producers only: no Ekene-11, no capex, field abandonment USD 6.0 MM',
    files: [['prod', FILES.prodNo11, '2P'], ['opex', FILES.opexNo11]],
    runs: [{ name: RUN_WITHOUT, cfg: { ...KIT_CONSOLE, abandonment: '6000000' } }],
  });
}

const preview = (d) => d.page.locator('table').filter({ has: d.page.locator('th') }).last();

export default {
  id: 'epe-01',
  app: 'Petroleum Economics Studio',
  eyebrow: 'Petroleum Economics Studio · 1 of 3',
  title: 'From the plan to *the decision*',
  subtitle: 'Ekene\'s production, the Ekene-11 AFE and the Nigerian fiscal terms, to an NPV and a yes or no',
  outroTitle: 'Petroleum economics *with Petrolord*',
  outroSub: 'Petroleum Economics Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(shared, new RegExp(`^${WITH}$`));
    await ensureWithout(d, shared);
    await openCases(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Petroleum Economics Studio', chapterSub: 'Is Ekene-11 worth drilling?',
      say: 'Every plan ends with one question: is it worth the money? Ekene holds twelve point one four million stock tank barrels in place, the number ReservoirCalc Pro and Material Balance Studio agree on. Four wells have produced since twenty twenty, and Well Design Studio has planned the next one, Ekene eleven. Petroleum Economics Studio prices the field with and without it.',
      sub: 'Every plan ends with one question: is it worth the money? Ekene holds 12.14 MM stb in place, the number ReservoirCalc Pro and Material Balance Studio agree on. Four wells have produced since 2020, and Well Design Studio has planned the next one, Ekene-11. Petroleum Economics Studio prices the field with and without it.',
      do: async (d) => {
        await d.lowerThird('Ekene · 12.14 MM stb in place', 'ReservoirCalc Pro and Material Balance Studio · Ekene-11 planned in Well Design Studio');
        await d.sleep(9000);
        await d.lowerThird('');
        await d.sleep(600);
      } },
    { id: 'case', chapter: 'The case', chapterSub: 'Production, capex and opex',
      say: 'A case holds the data; runs price it. We create one for Ekene with Ekene eleven.',
      sub: 'A case holds the data; runs price it. We create one for Ekene with Ekene-11.',
      do: async (d) => {
        await newCase(d, WITH, 'Ekene field, four producers plus Ekene-11 from April 2027', { onCamera: true });
      } },
    { id: 'prod',
      say: 'The production file has one column per well and stream: oil, gas and water for the four producers, and Ekene eleven from its first oil in April twenty twenty seven. History runs from twenty twenty, the forecast to twenty forty eight. We tag it two P, the reserves case it describes.',
      sub: 'The production file has one column per well and stream: oil, gas and water for the four producers, and Ekene-11 from its first oil in April 2027. History runs from 2020, the forecast to 2048. We tag it 2P, the reserves case it describes.',
      do: async (d) => {
        await upload(d, 'prod', FILES.prod, { tag: '2P', onCamera: true, beforeConfirm: async (dd) => {
          await dd.highlight(preview(dd)); await dd.sleep(5500); await dd.unhighlight();
        } });
      } },
    { id: 'capex',
      say: 'Capex is Ekene eleven itself: eleven point eight million dollars to drill and complete, the authority for expenditure behind the well design, and six hundred thousand to hook it up on the Ekene Alpha platform, both in twenty twenty seven.',
      sub: 'Capex is Ekene-11 itself: US$ 11.8 MM to drill and complete, the authority for expenditure behind the well design, and US$ 0.6 MM to hook it up on the Ekene Alpha platform, both in 2027.',
      do: async (d) => {
        await upload(d, 'capex', FILES.capex, { onCamera: true, beforeConfirm: async (dd) => {
          await expectText(dd, preview(dd), /11800000[\s\S]*600000/, 'capex preview');
          await dd.highlight(preview(dd)); await dd.sleep(4500); await dd.unhighlight();
        } });
      } },
    { id: 'opex',
      say: 'Opex is six hundred thousand dollars a year for the field, one hundred thousand more while Ekene eleven flows, and four dollars for every barrel of oil and water lifted.',
      sub: 'Opex is US$ 600,000 a year for the field, US$ 100,000 more while Ekene-11 flows, and US$ 4 for every barrel of oil and water lifted.',
      do: async (d) => {
        await upload(d, 'opex', FILES.opex, { onCamera: true, hold: 2500 });
      } },
    { id: 'console', chapter: 'The Run Console', chapterSub: 'Price, discounting and dates',
      say: 'The Run Console sets the terms. We price the two P files, oil at seventy five dollars flat, and gas at zero, because Ekene\'s associated gas is platform fuel. No inflation, so real and nominal agree. Base year and valuation year twenty twenty six, with the years before it treated as sunk: history is shown, never valued.',
      sub: 'The Run Console sets the terms. We price the 2P files, oil at US$ 75/bbl flat, and gas at zero, because Ekene\'s associated gas is platform fuel. No inflation, so real and nominal agree. Base year and valuation year 2026, with the years before it treated as sunk: history is shown, never valued.',
      do: async (d) => {
        await openConsole(d, { onCamera: true });
        await fillConsole(d, KIT_CONSOLE, { onCamera: true, runName: RUN_WITH, only: ['runName', 'scenario', 'gas', 'inflation', 'base', 'valuation', 'sunk'] });
      } },
    { id: 'life',
      say: 'The economic limit test stops the field when its oil no longer pays its opex, and the abandonment bill, six point eight million dollars for the field and Ekene eleven, falls in that last year.',
      sub: 'The economic limit test stops the field when its oil no longer pays its opex, and the abandonment bill, US$ 6.8 MM for the field and Ekene-11, falls in that last year.',
      do: async (d) => {
        await fillConsole(d, KIT_CONSOLE, { onCamera: true, only: ['limit', 'abandonment'] });
        await d.sleep(1000);
      } },
    { id: 'fiscal', chapter: 'Fiscal terms', chapterSub: 'PIA 2021, NTA 2025 from 2026',
      say: 'The fiscal regime is the Petroleum Industry Act: shallow water, a petroleum mining lease, converted, in thirty five metres of water. The engine reads the framework year by year, so every valued year from twenty twenty six is taxed under the Nigeria Tax Act twenty twenty five.',
      sub: 'The fiscal regime is the Petroleum Industry Act: shallow water, a petroleum mining lease, converted, in 35 m (115 ft) of water. The engine reads the framework year by year, so every valued year from 2026 is taxed under the Nigeria Tax Act 2025.',
      do: async (d) => {
        await fillConsole(d, KIT_CONSOLE, { onCamera: true, only: ['regime', 'waterDepthM'] });
        await d.sleep(1500);
      } },
    { id: 'run', chapter: 'The answer', chapterSub: 'NPV, payback and why there is no single IRR',
      say: 'Run. The field with Ekene eleven is worth one point nine eight million dollars at ten percent, and pays back in three point eight four years.',
      sub: 'Run. The field with Ekene-11 is worth US$ 1.98 MM at 10%, and pays back in 3.84 years.',
      do: async (d) => {
        await runAnalysis(d, { onCamera: true });
        await expectText(d, d.page.locator('body'), /NPV @ 10\.0% \(real\)\s*\$1\.98M[\s\S]*Payback\s*3\.84 years/, 'headline');
        await d.highlight(kpi(d, 'NPV @'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'irr',
      say: 'There is no single I. R. R., and the app says why: the cash flow is positive in twenty twenty six, negative in twenty twenty seven when Ekene eleven is paid for, and negative again at the end for the abandonment. Three rates zero its N. P. V., so none of them is the return. Read the N. P. V.',
      sub: 'There is no single IRR, and the app says why: the cash flow is positive in 2026, negative in 2027 when Ekene-11 is paid for, and negative again at the end for the abandonment. Three rates zero its NPV, so none of them is the return. Read the NPV.',
      do: async (d) => {
        const why = d.page.getByTestId('epe-irr-reason');
        await expectText(d, why, /-3\.68%, 36\.70% and 906\.44%/, 'IRR roots');
        await why.scrollIntoViewIfNeeded();
        await d.highlight(why);
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'kpis',
      say: 'The oil price could fall to sixty four dollars a barrel before the field stops paying. And government takes ninety three percent of the undiscounted profit: royalty, hydrocarbon tax, companies income tax, and the levies.',
      sub: 'The oil price could fall to US$ 64.1/bbl before the field stops paying. And government takes 93.2% of the undiscounted profit: royalty, hydrocarbon tax, companies income tax, and the levies.',
      do: async (d) => {
        const be = kpi(d, 'Breakeven oil price');
        await expectText(d, d.page.locator('body'), /Breakeven oil price\s*\$64\.1\/bbl\s*Government take\s*93\.2%/, 'breakeven, take');
        await d.highlight(be); await d.sleep(3500);
        await d.highlight(kpi(d, 'Government take')); await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'profile', chapter: 'The cash flow', chapterSub: 'Year by year',
      say: 'The cash flow profile shows the story. History is shaded and unvalued. Twenty twenty seven dips with the well\'s capex, the field earns it back, and the economic limit ends the field in twenty thirty seven, when the abandonment bill is paid.',
      sub: 'The cash flow profile shows the story. History is shaded and unvalued. 2027 dips with the well\'s capex, the field earns it back, and the economic limit ends the field in 2037, when the abandonment bill is paid.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /field life ends 2037/, 'limit year');
        await showTab(d, 'Cash Flow Profile');
        await d.sleep(6000);
      } },
    { id: 'waterfall',
      say: 'The waterfall takes one year apart. In twenty twenty six, three million dollars of revenue becomes seven hundred and thirty nine thousand of cash after royalty, opex, the levies, hydrocarbon tax and income tax.',
      sub: 'The waterfall takes one year apart. In 2026, US$ 3.0 MM of revenue becomes US$ 739K of cash after royalty, opex, the levies, hydrocarbon tax and income tax.',
      do: async (d) => {
        await showTab(d, 'Waterfall');
        await expectText(d, d.page.locator('body'), /Waterfall: Year 2026[\s\S]*\+3\.0M[\s\S]*\+739K/, 'waterfall 2026');
        await d.sleep(6500);
      } },
    { id: 'compare', chapter: 'The decision', chapterSub: 'With and without Ekene-11',
      say: 'Now the decision. The same field without Ekene eleven, its own case, is worth minus four hundred and fifty nine thousand: its remaining oil does not pay for its decommissioning. Compare Runs puts the two side by side, without first, as the base.',
      sub: 'Now the decision. The same field without Ekene-11, its own case, is worth minus US$ 459K: its remaining oil does not pay for its decommissioning. Compare Runs puts the two side by side, without first, as the base.',
      do: async (d, shared) => {
        const id = await caseId(shared, WITH);
        await d.page.goto(`${shared.baseUrl}/dashboard/apps/economics/epe/cases/${id}/compare`, { waitUntil: 'domcontentloaded' });
        await d.page.getByText('Available Runs').waitFor({ timeout: 60000 });
        await d.page.getByText(RUN_WITHOUT).first().waitFor({ timeout: 60000 });
        await d.sleep(1500);
        await d.click(d.page.getByText(RUN_WITHOUT).first());
        await d.click(d.page.getByText(RUN_WITH).first());
        await d.click(d.page.getByRole('button', { name: /Compare Selected Runs/ }));
        await d.page.getByText('Comparison Results').waitFor({ timeout: 60000 });
        await d.sleep(2000);
        await expectText(d, d.page.locator('body'), /-\$459K/, 'without NPV');
      } },
    { id: 'increment',
      say: 'Ekene eleven adds two point four four million dollars, partly its own oil and partly the years it keeps the field alive. Its own cash flow has two rates, twenty five percent from the well and a negative one made by the decommissioning bill, so again the N. P. V. carries the decision: positive at ten percent. Drill it.',
      sub: 'Ekene-11 adds US$ 2.44 MM, partly its own oil and partly the years it keeps the field alive. Its own cash flow has two rates, 24.91% from the well and a negative one made by the decommissioning bill, so again the NPV carries the decision: positive at 10%. Drill it.',
      do: async (d) => {
        const head = d.page.getByText(/^Incremental:/).first();
        await head.scrollIntoViewIfNeeded();
        await head.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        await d.sleep(1500);
        await expectText(d, d.page.locator('body'), /Incremental NPV\s*\$2\.44M[\s\S]*24\.91%/, 'increment');
        const tile = d.page.locator('div', { has: d.page.locator('p:text-is("Incremental NPV")') }).last();
        await d.highlight(tile); await d.sleep(5000); await d.unhighlight();
        await d.sleep(3000);
      } },
    { id: 'close', chapter: 'Plan to decision', chapterSub: 'One case, one answer',
      say: 'Production, the well\'s cost and the Nigerian fiscal terms, to one number with its reasons. Next: how sure we can be of it.',
      do: async (d) => { await d.sleep(3500); } },
  ],
};

export { bodyText };
