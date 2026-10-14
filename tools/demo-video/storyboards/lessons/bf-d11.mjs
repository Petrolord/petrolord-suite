// Basin Modelling with Petrolord, Lesson D11: sensitivity and scenarios.
import { login, expectText, openBf, enterExpert, openModel, simulate, seedModel, t, tab, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson D11: East kitchen';
export default {
  id: 'lesson-bf-d11',
  ...bfLessonMeta(11, 'D', 'Sensitivity *and what to trust*', 'Migration efficiency, conductivity and the source maturity, every value a run'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await seedModel(shared, 'kitchen-run', NAME);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await tab(d, 'sensitivity');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'eff', chapter: 'Migration efficiency', chapterSub: 'The least known number',
      say: 'The migration efficiency is the least constrained number in a charge estimate: published values run from a few percent to over twenty. Vary it for Oboro from two to twenty percent, on the run on screen.',
      do: async (d) => {
        await d.select(t(d, 'bf-sens-param'), 'efficiency');
        const ob = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-sens-trap"] option')].find((o) => o.textContent === 'Oboro')?.value);
        await d.select(t(d, 'bf-sens-trap'), ob);
        const f = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-sens-output"] option')].find((o) => /Charge factor, Oboro/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-sens-output'), f);
        await d.click(t(d, 'bf-sens-run'));
        await t(d, 'bf-sens-table').waitFor();
        await d.sleep(1500);
      } },
    { id: 'eff-read',
      say: 'At two percent, the factor for Oboro falls to zero point three; at six and a half, zero point five; at eleven it reaches the zero point seven of the base case, and above fifteen it is zero point nine. The answer to how likely the charge is depends as much on this one number as on the whole thermal history.',
      sub: 'At 2 %, the factor for Oboro falls to 0.3; at 6.5 %, 0.5; at 11 % it reaches the 0.7 of the base case, and above 15 % it is 0.9. The answer to how likely the charge is depends as much on this one number as on the whole thermal history.',
      do: async (d) => {
        await expectText(d, 'bf-sens-table', /0\.02\s*0\.3\s*0\.065\s*0\.5\s*0\.11\s*0\.7\s*0\.155\s*0\.9\s*0\.2\s*0\.9/, 'eff');
        await d.highlight(t(d, 'bf-sens-table')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'cond', chapter: 'Conductivity', chapterSub: 'The rock between the boundaries',
      say: 'The thermal properties are another assumption. Scale every layer\'s conductivity from seventy to a hundred and thirty percent of the library, five runs, and read the Ro of the upper source today.',
      do: async (d) => {
        await d.select(t(d, 'bf-sens-param'), 'conductivity');
        const ro = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-sens-output"] option')].find((o) => /Ro now, Upper Akata/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-sens-output'), ro);
        await d.click(t(d, 'bf-sens-run'));
        await t(d, 'bf-sens-table').waitFor({ timeout: 180000 });
        await d.page.waitForFunction(() => /Conductivity scale/.test(document.querySelector('[data-testid="bf-sens-table"]')?.textContent || ''), null, { timeout: 180000 });
        await d.sleep(1500);
      } },
    { id: 'cond-read',
      say: 'Seventy percent of the library conductivity heats the source to two point one percent, into the gas window; a hundred and thirty percent leaves it at zero point nine. The same model, the same heat flow: conductivity alone moves the source across the oil window.',
      sub: 'Seventy percent of the library conductivity heats the source to 2.1 %Ro, into the gas window; 130 % leaves it at 0.9. The same model, the same heat flow: conductivity alone moves the source across the oil window.',
      do: async (d) => {
        await expectText(d, 'bf-sens-table', /0\.7\s*2\.1[\s\S]*1\s*1\.25[\s\S]*1\.3\s*0\.90?1?/, 'cond');
        await d.highlight(t(d, 'bf-sens-table')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'trust', chapter: 'What to trust', chapterSub: 'Calibrate where you can',
      say: 'Conductivity and heat flow trade off: a model calibrated at a well absorbs the error in either into the fitted heat flow, which is why the calibration at Ekene-1 matters more than any library value. The efficiency cannot be calibrated in one dimension, so carry its range into the prospect\'s risk.',
      do: async (d) => { await d.sleep(6000); } },
  ],
};
