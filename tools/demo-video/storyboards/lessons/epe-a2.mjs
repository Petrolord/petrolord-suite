// Petroleum Economics with Petrolord, Lesson A2: prices and escalation.
// The flat price and differentials, a yearly price deck, inflation and
// per-stream escalators, and the real or nominal basis, on the Ekene case
// (the kit run at US$75 flat is the reference).
import {
  login, expectText, openRun, rerunWithEdits, addDeck, fillConsole, runAnalysis, kpi, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson A2: Ekene';

export default {
  id: 'lesson-epe-a2',
  ...epeLessonMeta(2, 'A', 'Prices *and escalation*', 'Flat price, differentials, a yearly deck, escalators and the real or nominal basis'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('Flat $75')] });
    await openRun(d, shared, CASE, 'Flat $75');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'ref', chapter: 'The reference run', chapterSub: 'US$75 flat',
      say: 'This is the Ekene case priced the kit\'s way: oil at seventy five dollars a barrel, flat for the whole life, gas at zero. One point nine eight million dollars at ten percent. Every price question starts from a run like this, so we re run it with edits.',
      do: async (d) => {
        await expectText(d, kpi(d, 'NPV @'), /\$1\.98M/, 'reference NPV');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(3500); await d.unhighlight();
        await rerunWithEdits(d, { onCamera: true, runName: 'Deck 65 to 75' });
      } },
    { id: 'pricing', chapter: 'Pricing', chapterSub: 'Marker price and differential',
      say: 'Pricing holds the marker price for each stream, and a differential for each: the premium or discount your crude sells at against the marker. A differential applies to deck prices too. The N. G. N. rate, when set, mirrors every result in naira.',
      do: async (d) => {
        for (const id of ['oil_price_usd_bbl', 'oil_price_differential_usd_bbl', 'fx_ngn_per_usd']) {
          const l = d.page.locator(`#${id}`); await l.scrollIntoViewIfNeeded(); await d.moveTo(l); await d.sleep(2200);
        }
      } },
    { id: 'deck', chapter: 'A yearly price deck', chapterSub: 'Year by year, then flat',
      say: 'A yearly deck overrides the flat price. Here oil recovers from sixty five dollars in twenty twenty six to seventy in twenty twenty seven and seventy five from twenty twenty eight. Prices hold between listed years, and after the last one they follow the stream\'s escalator, zero here.',
      do: async (d) => {
        await addDeck(d, [['2026', '65'], ['2027', '70'], ['2028', '75']], { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'escalation', chapter: 'Escalation', chapterSub: 'Inflation or per stream',
      say: 'Escalation is one inflation rate for oil, gas, condensate and opex, or, under Customize per stream, a rate for each. Capex is entered in money of the day and not escalated by default. The present value basis decides whether the N. P. V. is in real, base year dollars, or nominal. With inflation at zero, as here, the two agree.',
      do: async (d) => {
        const c = d.page.getByText('Customize per stream');
        await c.scrollIntoViewIfNeeded();
        await d.click(c); await d.sleep(2500);
        await d.moveTo(d.page.locator('#capex_escalator_pct')); await d.sleep(1800);
        await d.click(d.page.getByText('Use simple inflation')); await d.sleep(800);
        await d.moveTo(d.page.getByRole('button', { name: 'Real (base-year)' })); await d.sleep(2000);
      } },
    { id: 'run', chapter: 'The effect', chapterSub: 'Two cheaper years',
      say: 'Run. The two cheaper years cost the field three hundred and thirty thousand dollars: the N. P. V. falls from one point nine eight million to one point six five million, because twenty twenty six and twenty twenty seven are the first years of Ekene eleven\'s oil and the field\'s best remaining years.',
      do: async (d) => {
        await runAnalysis(d, { onCamera: true });
        await expectText(d, kpi(d, 'NPV @'), /\$1\.65M/, 'deck NPV');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'table', chapter: 'Where to check', chapterSub: 'The applied price, year by year',
      say: 'Year by year detail shows the price each year actually received: sixty five, seventy, then seventy five dollars, so a deck can always be checked against what the engine applied.',
      do: async (d) => {
        const b = d.page.getByText('Year-by-Year Detail', { exact: true }).first();
        await b.scrollIntoViewIfNeeded(); await d.click(b); await d.sleep(1500);
        const row = d.page.locator('tr', { hasText: 'Oil price applied' }).first();
        await expectText(d, row, /65\.00\s+70\.00\s+75\.00/, 'applied prices');
        await d.highlight(row); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'next', chapter: 'Prices', chapterSub: 'Next: discounting and the valuation date',
      say: 'Flat or a deck, a differential, and escalators per stream. Next lesson: the discount rate and the date the value is struck at.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
