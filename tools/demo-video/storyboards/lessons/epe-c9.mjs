// Petroleum Economics with Petrolord, Lesson C9: sensitivity. The tornado
// runs the case through the engine with each input at a low and a high
// value, sorts the inputs by their effect on NPV, and lists the numbers.
import {
  login, expectText, openRun, showTab, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson C9: Ekene';

export default {
  id: 'lesson-epe-c9',
  ...epeLessonMeta(9, 'C', 'Sensitivity: *the tornado*', 'Each input low and high through the engine, ranked by its effect on NPV'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('With Ekene-11')] });
    await openRun(d, shared, CASE, 'With Ekene-11');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'idea', chapter: 'One input at a time', chapterSub: 'Low, base and high',
      say: 'A tornado asks which inputs matter. Each input is moved to a low and a high value while everything else stays at the base case, and each variant runs through the full fiscal engine. The ranges default to twenty percent either side.',
      do: async (d) => {
        await showTab(d, 'Sensitivity (Tornado)');
        await d.sleep(2500);
        await d.moveTo(d.page.locator('input[type=number]').first()); await d.sleep(2000);
      } },
    { id: 'run', chapter: 'Run it', chapterSub: 'Twelve inputs in seconds',
      say: 'Run Sensitivity Analysis. Twelve inputs, two variants each, in well under a second.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Run Sensitivity Analysis/ }));
        await d.page.getByText(/Tornado: NPV Sensitivity/).waitFor({ timeout: 120000 });
        await d.sleep(2500);
        const h = d.page.getByText(/Tornado: NPV Sensitivity/).first();
        await h.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
        await d.sleep(2500);
      } },
    { id: 'chart', chapter: 'Reading the tornado', chapterSub: 'Widest bar first',
      say: 'Production moves the N. P. V. most: twenty percent less oil takes the field to minus nine hundred and forty four thousand dollars, twenty percent more to four point nine eight million. Oil price comes next: sixty dollars gives minus seven hundred and thirty seven thousand, ninety dollars four point five two million. Both bars cross zero, so either could turn the decision.',
      do: async (d) => {
        await expectText(d, d.page.getByTestId('epe-tornado-sentence'), /Production from -\$944K to \$4\.98M, Oil Price from -\$737K to \$4\.52M/, 'sentence');
        await d.highlight(d.page.getByTestId('epe-tornado-sentence')); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'table', chapter: 'The numbers', chapterSub: 'Inputs and NPVs',
      say: 'The table lists every input with its low and high values. Capex twenty percent either side swings the N. P. V. by two point three four million dollars, the income tax rate by two point oh nine million, opex by one point seven seven million. First oil delay moves every production file a year later, the producing wells too, so on a producing field like Ekene its bar says little, and the table notes it. Gas price and inflation are zero in this case, so they move nothing.',
      do: async (d) => {
        const t = d.page.getByTestId('epe-tornado-table');
        await t.scrollIntoViewIfNeeded();
        await expectText(d, t, /CAPEX[\s\S]*\$2\.34M[\s\S]*CIT Rate[\s\S]*\$2\.09M[\s\S]*OPEX[\s\S]*\$1\.77M/, 'table');
        await d.highlight(t); await d.sleep(7000); await d.unhighlight();
      } },
    { id: 'next', chapter: 'Sensitivity', chapterSub: 'Next: Monte Carlo',
      say: 'A tornado ranks the inputs one at a time. Next lesson: moving them all at once, with Monte Carlo.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
