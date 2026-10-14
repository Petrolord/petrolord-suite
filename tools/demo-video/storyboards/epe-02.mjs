// Petroleum Economics Studio, demo 2: how sure can we be? The Ekene run
// with Ekene-11 (US$1.98 MM at 10%): the breakeven price, the tornado with
// its table, a Monte Carlo through the full fiscal engine on oil price,
// capex and production, and what the range means for the decision.
import {
  login, expectText, caseId, runId, seedCase, openRun, showTab, setMc, runMc, kpi, FILES, KIT_CONSOLE,
} from './epe-common.mjs';
import { WITH, RUN_WITH } from './epe-01.mjs';

const card = (d, title) => d.page.locator('div', { has: d.page.locator('p', { hasText: new RegExp(`^${title}$`, 'i') }) }).last();

export default {
  id: 'epe-02',
  app: 'Petroleum Economics Studio',
  eyebrow: 'Petroleum Economics Studio · 2 of 3',
  title: 'How sure *can we be?*',
  subtitle: 'The breakeven, a tornado and a Monte Carlo through the full Nigerian fiscal engine',
  outroTitle: 'Petroleum economics *with Petrolord*',
  outroSub: 'Petroleum Economics Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    if (!(await caseId(shared, WITH)) || !(await runId(shared, WITH, RUN_WITH))) {
      await seedCase(d, shared, WITH, {
        description: 'Ekene field, four producers plus Ekene-11 from April 2027',
        files: [['prod', FILES.prod, '2P'], ['capex', FILES.capex], ['opex', FILES.opex]],
        runs: [{ name: RUN_WITH, cfg: KIT_CONSOLE }],
      });
    }
    // a fresh run each take, so the tornado and Monte Carlo panels open empty
    const { db } = await import('./epe-common.mjs');
    const sb = await db(shared);
    const rid = await runId(shared, WITH, RUN_WITH);
    await sb.from('epe_sensitivity_runs').delete().eq('base_run_id', rid);
    const { data: run } = await sb.from('epe_runs').select('run_config_id').eq('id', rid).single();
    await sb.from('epe_mc_runs').delete().eq('run_config_id', run.run_config_id);
    await openRun(d, shared, WITH, RUN_WITH);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'One number', chapterSub: 'And everything it assumes',
      say: 'Ekene with Ekene eleven is worth one point nine eight million dollars at ten percent. That is one forecast, one oil price and one cost estimate. Before anyone signs, the question is how sure we can be.',
      do: async (d) => {
        await expectText(d, kpi(d, 'NPV @'), /\$1\.98M/, 'headline');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'breakeven', chapter: 'Room on price', chapterSub: 'The breakeven',
      say: 'The first answer is the breakeven: the flat oil price at which the field\'s N. P. V. is zero, sixty four dollars ten, about eleven dollars below the seventy five we priced.',
      do: async (d) => {
        const b = kpi(d, 'Breakeven oil price');
        await b.scrollIntoViewIfNeeded();
        await expectText(d, b, /\$64\.1\/bbl/, 'breakeven');
        await d.highlight(b); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'tornado', chapter: 'What matters', chapterSub: 'The tornado',
      say: 'The tornado moves each input twenty percent either way through the full fiscal engine, and ranks them.',
      do: async (d) => {
        await showTab(d, 'Sensitivity (Tornado)');
        await d.click(d.page.getByRole('button', { name: /Run Sensitivity Analysis/ }));
        await d.page.getByText(/Tornado: NPV Sensitivity/).waitFor({ timeout: 120000 });
        await d.sleep(1500);
        await d.page.getByText(/Tornado: NPV Sensitivity/).first().evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        await d.sleep(3000);
      } },
    { id: 'drivers',
      say: 'Production and oil price dominate, and both cross zero: twenty percent less oil takes the field to minus nine hundred and forty four thousand dollars, sixty dollar oil to minus seven hundred and thirty seven thousand. Capex is third. The table under the chart lists every input with its values.',
      do: async (d) => {
        const s = d.page.getByTestId('epe-tornado-sentence');
        await expectText(d, s, /Production from -\$944K to \$4\.98M, Oil Price from -\$737K to \$4\.52M/, 'drivers');
        await d.highlight(s); await d.sleep(5500); await d.unhighlight();
        const t = d.page.getByTestId('epe-tornado-table');
        await t.scrollIntoViewIfNeeded(); await d.highlight(t); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'mc', chapter: 'All at once', chapterSub: 'Monte Carlo through the fiscal engine',
      say: 'A tornado moves one input at a time. Monte Carlo moves them together: oil from fifty two fifty to ninety seven fifty, capex from eighty to one hundred and thirty percent, production from eighty five to one hundred and ten percent. A thousand runs of the full engine, with a fixed seed so the result can be reproduced.',
      do: async (d) => {
        await showTab(d, 'Risk (Monte Carlo)');
        await setMc(d, { 'Oil price ($/bbl)': ['52.5', '75', '97.5'], 'CAPEX multiplier': ['0.8', '1', '1.3'], 'Production multiplier': ['0.85', '1', '1.1'] }, { onCamera: true });
        await runMc(d, { onCamera: true });
      } },
    { id: 'range', chapter: 'The range', chapterSub: 'P90, P50, P10',
      say: 'The answer is now a range. In the low case, the P ninety, the field loses one point oh five million dollars. The middle, P fifty, is one point five seven million, and the high case, P ten, four point one million. Seventy eight point seven percent of the thousand outcomes are above zero.',
      do: async (d) => {
        const r = d.page.getByText(/^NPV P90/i).first();
        await r.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await d.sleep(1500);
        await expectText(d, d.page.getByText(/^NPV P90/i).first().locator('xpath=ancestor::div[2]'), /NPV P90 \(low\)\s*-\$1\.05M\s*NPV P50\s*\$1\.57M\s*NPV P10 \(high\)\s*\$4\.1M[\s\S]*78\.7%/, 'mc');
        for (const t of ['NPV P90 \\(low\\)', 'NPV P50', 'NPV P10 \\(high\\)', 'P\\(NPV > 0\\)']) { await d.highlight(card(d, t)); await d.sleep(1800); }
        await d.unhighlight();
      } },
    { id: 'fan',
      say: 'The fan shows the cumulative cash between the low and high cases year by year, and the driver chart confirms the tornado: oil price first.',
      do: async (d) => {
        for (const t of [/Cumulative cash flow fan/, /NPV sensitivity tornado/]) {
          const l = d.page.getByText(t).first(); await l.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await d.sleep(4000);
        }
      } },
    { id: 'decision', chapter: 'The decision', chapterSub: 'Drill, and watch two numbers',
      say: 'So about four chances in five that Ekene with Ekene eleven is worth more than zero, for a field that is under water without it. Drill it, and watch the two numbers the tornado named: Ekene eleven\'s rate once it flows, and the oil price. Next: what happens when one of them changes.',
      do: async (d) => { await d.sleep(4000); } },
  ],
};
