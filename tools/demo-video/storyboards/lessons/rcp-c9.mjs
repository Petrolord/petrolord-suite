// Volumetrics with Petrolord, Lesson C9: correlations and fitting from data.
// On the evidenced Ekene ranges: the porosity and water saturation pair at
// -0.8 against no correlation, a correlation set that cannot hold refused,
// and a porosity distribution fitted to the 179 core plugs of Ekene-1, 3
// and 5 (mean 0.185, below the log value of 0.20).
import fs from 'node:fs';
import {
  login, expectText, openRcp, bookedCase, stoiip, t, toProbabilistic, setDist, RANGES, distCard, DIST, rcpLessonMeta,
} from './rcp-common.mjs';

const CORE = fs.readFileSync(process.env.RCP_CORE || '/root/demo-video-work/rcp-assets/ekene-core-porosity.txt', 'utf8').trim();
const next = (d) => d.page.getByRole('button', { name: /^Next/ });
const back = (d) => d.page.getByRole('button', { name: /Back/ });
const corr = (d) => t(d, 'rcp-corr');
async function runFrom2(d) {
  await d.click(next(d));
  await d.sleep(500);
  await d.click('rcp-mc-run');
  await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
  await d.sleep(1500);
}
const pv = async (d) => (await d.page.locator('body').innerText()).match(/P50 \(BEST ESTIMATE\)[\s\S]{0,200}/i)?.[0].replace(/\n/g, ' ');

export default {
  id: 'lesson-rcp-c9',
  ...rcpLessonMeta(9, 'C', 'Correlations and *fitting from data*', 'Inputs that move together, and a range fitted to the core'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await stoiip(d);
    await toProbabilistic(d);
    await t(d, 'rcp-sim-setup-toggle').click();
    for (const [k, v] of Object.entries(RANGES.after)) await setDist(d, k, v);
    await next(d).click(); await d.sleep(400);
    await d.page.getByRole('button', { name: '50k', exact: true }).click();
    await t(d, 'rcp-mc-seed').fill('20261109');
    await corr(d).getByRole('button', { name: 'Remove' }).first().click().catch(() => {});
    await next(d).click(); await d.sleep(400);
    await t(d, 'rcp-mc-run').click();
    await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
    await back(d).click(); await d.sleep(400);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Inputs that move together', chapterSub: 'Correlations',
      say: 'The run on the right sampled every input on its own: P ninety eleven point three two, P ten thirteen. But inputs are not always independent. Better sand tends to hold less water, so high porosity comes with low water saturation.',
      sub: 'The run on the right sampled every input on its own: P90 11.32, P10 13.00. But inputs are not always independent. Better sand tends to hold less water, so high porosity comes with low water saturation.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /STOOIP\s*12\.14[\s\S]{0,60}11\.32[\s\S]{0,60}13\.00/i, 'independent run');
        await d.highlight(corr(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'pair',
      say: 'Add a pair: porosity and water saturation, minus zero point eight. It is the correlation of the normal scores, close to the rank correlation. Run again with the same seed.',
      sub: 'Add a pair: porosity and water saturation, -0.8. It is the correlation of the normal scores, close to the rank correlation. Run again with the same seed.',
      do: async (d) => {
        await d.click('rcp-corr-add');
        await d.sleep(500);
        const row = t(d, 'rcp-corr-row-0');
        await d.select(row.locator('select').nth(0), 'porosity');
        await d.select(row.locator('select').nth(1), 'sw');
        await d.type(t(d, 'rcp-corr-rho-0'), '-0.8');
        await d.page.keyboard.press('Tab');
        await runFrom2(d);
        await expectText(d, d.page.locator('body'), /STOOIP\s*12\.13[\s\S]{0,60}11\.27[\s\S]{0,60}13\.06/i, 'correlated run');
      } },
    { id: 'wider',
      sub: 'The range widens: P90 11.27, P10 13.06. With the two moving together, a good draw of one is no longer softened by a poor draw of the other.',
      say: 'The range widens: P ninety eleven point two seven, P ten thirteen point zero six. With the two moving together, a good draw of one is no longer softened by a poor draw of the other.',
      do: async (d) => { await d.sleep(3000); } },
    { id: 'refused', chapter: 'A set that cannot hold', chapterSub: 'Refused, with the reason',
      say: 'Correlations must agree with each other. Add net to gross strongly positive with both porosity and water saturation, and the set is impossible: if porosity and saturation move against each other, one thing cannot move with both. The run is refused, and the panel says why.',
      do: async (d) => {
        await d.click(back(d));
        await d.sleep(500);
        for (const [i, a, b, rho] of [[1, 'ntg', 'porosity', '0.9'], [2, 'ntg', 'sw', '0.9']]) {
          await d.click('rcp-corr-add');
          await d.sleep(400);
          const row = t(d, `rcp-corr-row-${i}`);
          await d.select(row.locator('select').nth(0), a);
          await d.select(row.locator('select').nth(1), b);
          await d.type(t(d, `rcp-corr-rho-${i}`), rho);
          await d.page.keyboard.press('Tab');
        }
        await t(d, 'rcp-corr-problem').waitFor({ timeout: 10000 });
        await expectText(d, 'rcp-corr-problem', /These correlations cannot hold together/, 'refusal');
        await d.highlight('rcp-corr-problem');
        await d.sleep(3500);
        await d.unhighlight();
        for (let i = 0; i < 2; i++) { await d.click(t(d, 'rcp-corr-row-2').getByRole('button', { name: 'Remove' }).or(t(d, 'rcp-corr-row-1').getByRole('button', { name: 'Remove' })).first()); await d.sleep(400); }
      } },
    { id: 'fit', chapter: 'Fitting from data', chapterSub: 'Porosity from the core',
      say: 'Ranges can also come from measurements. Fit a distribution from data takes a list of values: here the helium porosity of one hundred and seventy nine core plugs from Ekene one, three and five. Each shape is fitted and ranked by how far it sits from the data.',
      do: async (d) => {
        await d.click(back(d));
        await d.sleep(600);
        await d.click('rcp-fit-open');
        await d.sleep(400);
        await d.select(t(d, 'rcp-fit-key'), 'porosity');
        await d.click('rcp-fit-text');
        await t(d, 'rcp-fit-text').fill(CORE);
        await d.sleep(800);
        await d.click('rcp-fit-run');
        await t(d, 'rcp-fit-result').waitFor();
        await expectText(d, 'rcp-fit-result', /179 values[\s\S]*lognormal\s*mean 0\.185, sd 0\.02511/i, 'fit result');
        await d.highlight('rcp-fit-result');
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'use',
      sub: 'The best fit is lognormal, mean 0.185, standard deviation 0.025. Notice the core mean is below the log porosity of 0.2 the booking uses: reconciling core and logs is a review of its own. Use it, and run: P90 9.21, P50 11.12, P10 13.45.',
      say: 'The best fit is lognormal, mean zero point one eight five, standard deviation zero point zero two five. Notice the core mean is below the log porosity of zero point two the booking uses: reconciling core and logs is a review of its own. Use it, and run: P ninety nine point two one, P fifty eleven point one two, P ten thirteen point four five.',
      do: async (d) => {
        const best = t(d, 'rcp-fit-result').getByRole('button', { name: 'Use' }).first();
        await d.click(best);
        await d.sleep(800);
        await d.click(next(d));
        await d.sleep(400);
        await runFrom2(d);
        await expectText(d, d.page.locator('body'), /STOOIP\s*11\.12[\s\S]{0,60}9\.21[\s\S]{0,60}13\.45/i, 'core porosity run');
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Sensitivity',
      say: 'Next, which input drives the range: the tornado, the spider plot and the variance shares.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
