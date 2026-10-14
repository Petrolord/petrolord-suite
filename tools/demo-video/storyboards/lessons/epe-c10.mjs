// Petroleum Economics with Petrolord, Lesson C10: Monte Carlo. Uncertain
// inputs as distributions, every iteration through the full fiscal engine,
// a seed to reproduce it, and the NPV distribution, its convergence, the
// cash flow fan and what drives the spread.
import {
  login, expectText, openRun, showTab, setMc, runMc, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson C10: Ekene';
const card = (d, title) => d.page.locator('div', { has: d.page.locator('p', { hasText: new RegExp(`^${title}$`, 'i') }) }).last();

export default {
  id: 'lesson-epe-c10',
  ...epeLessonMeta(10, 'C', 'Monte Carlo: *the range of outcomes*', 'Distributions through the fiscal engine, P90, P50, P10 and what drives the spread'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('With Ekene-11')] });
    await openRun(d, shared, CASE, 'With Ekene-11');
    await showTab(d, 'Risk (Monte Carlo)', { onCamera: false });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'inputs', chapter: 'Uncertain inputs', chapterSub: 'Distributions in place of single values',
      say: 'Monte Carlo moves every uncertain input at once. Each enabled input is drawn from its distribution: triangular, uniform, normal or lognormal. Prices are absolute; capex, opex and production are multipliers on the uploaded files. We take oil from fifty two fifty to ninety seven fifty with seventy five most likely, capex from eighty to one hundred and thirty percent, and production from eighty five to one hundred and ten percent.',
      do: async (d) => {
        await setMc(d, { 'Oil price ($/bbl)': ['52.5', '75', '97.5'], 'CAPEX multiplier': ['0.8', '1', '1.3'], 'Production multiplier': ['0.85', '1', '1.1'] }, { onCamera: true });
        await d.sleep(1200);
      } },
    { id: 'seed', chapter: 'Iterations and seed', chapterSub: 'Reproducible draws',
      say: 'A thousand iterations, each a full run of the fiscal engine. The seed fixes the draws, so the same seed gives the same answer tomorrow. Correlations between inputs can be added in pairs.',
      do: async (d) => {
        await d.moveTo(d.page.getByRole('button', { name: /Add pair/ })); await d.sleep(2000);
        await d.moveTo(d.page.getByPlaceholder('random')); await d.sleep(1500);
        await runMc(d, { onCamera: true });
      } },
    { id: 'result', chapter: 'The distribution', chapterSub: 'P90, P50 and P10',
      say: 'Each card is a percentile of the thousand N. P. V.s. By petroleum convention P ninety is the low case: minus one point oh five million dollars. P fifty, the middle, one point five seven million; P ten, the high case, four point one million. The mean is one point five five million, below the single run\'s one point nine eight, and seventy eight point seven percent of the outcomes are above zero.',
      do: async (d) => {
        const r = d.page.getByText(/^NPV P90/i).first();
        await r.scrollIntoViewIfNeeded();
        await r.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await d.sleep(1500);
        await expectText(d, d.page.getByText(/^NPV P90/i).first().locator('xpath=ancestor::div[2]'), /NPV P90 \(low\)\s*-\$1\.05M\s*NPV P50\s*\$1\.57M\s*NPV P10 \(high\)\s*\$4\.1M\s*NPV mean\s*\$1\.55M\s*P\(NPV > 0\)\s*78\.7%\s*Deterministic base\s*\$1\.98M/, 'mc cards');
        for (const t of ['NPV P90 \\(low\\)', 'NPV P50', 'NPV P10 \\(high\\)', 'P\\(NPV > 0\\)']) { await d.highlight(card(d, t)); await d.sleep(1800); }
        await d.unhighlight();
      } },
    { id: 'irr', chapter: 'What it leaves out', chapterSub: 'IRR percentiles held back',
      say: 'The I. R. R. cards are held back here: ninety nine point nine percent of the iterations have no single I. R. R., because Ekene\'s cash flow changes sign more than once, so their percentiles would rest on a handful of draws. The app says so, and points back to the N. P. V.',
      do: async (d) => {
        const h = d.page.getByTestId('epe-mc-irr-held');
        await expectText(d, h, /99\.9% of iterations have no single IRR/, 'irr held');
        await d.highlight(h); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'charts', chapter: 'Convergence, fan and drivers', chapterSub: 'Is a thousand enough?',
      say: 'The convergence chart tracks the mean as iterations add up; a flat tail means a thousand was enough. The fan shows the cumulative cash between P90 and P10 year by year. And the driver chart splits the iterations by each input: oil price moves the outcome most, then capex and production.',
      do: async (d) => {
        for (const t of [/Convergence of mean NPV/, /Cumulative cash flow fan/, /NPV sensitivity tornado/]) {
          const l = d.page.getByText(t).first(); await l.scrollIntoViewIfNeeded();
          await l.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })); await d.sleep(3500);
        }
      } },
    { id: 'next', chapter: 'Monte Carlo', chapterSub: 'Next: comparing runs',
      say: 'A range with its odds, reproducible from its seed, and the raw sample downloadable for checking. Next module: comparing runs and making the decision.',
      do: async (d) => { await d.moveTo(d.page.getByRole('button', { name: /Raw sample/ })); await d.sleep(3000); } },
  ],
};
