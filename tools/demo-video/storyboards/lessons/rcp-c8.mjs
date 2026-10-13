// Volumetrics with Petrolord, Lesson C8: the Monte Carlo set up.
// Probabilistic mode on the booked case with the evidenced ranges of demo 2:
// distribution shapes, structural mode (contact and GRV factor sampled
// against the mapped surfaces), iterations, the seed and reproducibility,
// and reading P90, P50, P10, the mean and the expectation curve.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, toProbabilistic, setDist, RANGES, distCard, DIST, rcpLessonMeta,
} from './rcp-common.mjs';

const body = (d) => d.page.locator('body');
const next = (d) => d.page.getByRole('button', { name: /^Next/ });
const back = (d) => d.page.getByRole('button', { name: /Back/ });
const iter = (d, n) => d.page.getByRole('button', { name: n, exact: true });
async function run(d) {
  await d.click('rcp-mc-run');
  await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
  await d.sleep(1500);
}
const pvals = async (d) => (await d.page.locator('text=/P50 \\(Best Estimate\\)/i').first().locator('xpath=ancestor::*[contains(., "P10")][2]').innerText()).replace(/\n/g, ' ');

export default {
  id: 'lesson-rcp-c8',
  ...rcpLessonMeta(8, 'C', 'Monte Carlo *volumetrics*', 'Distributions, structural mode, the seed, and reading P90, P50 and P10'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'mode', chapter: 'Probabilistic mode', chapterSub: 'Ranges in place of single numbers',
      say: 'A deterministic case multiplies single numbers. A Monte Carlo run draws every uncertain input from a range, thousands of times, and reports the spread of the result. Switch the mode to probabilistic, and fold the set up away to give the distributions room.',
      do: async (d) => {
        await toProbabilistic(d, { onCamera: true });
        await d.click('rcp-sim-setup-toggle');
        await d.sleep(800);
      } },
    { id: 'shapes', chapter: 'Distributions', chapterSub: 'Shape and range',
      say: 'Each input has a shape and a range. Triangular takes a minimum, a most likely and a maximum; normal and lognormal take a mean and a standard deviation; uniform, a minimum and a maximum. Lognormal suits a property that cannot go below zero and has a long upper tail, like permeability.',
      do: async (d) => {
        const sel = distCard(d, DIST.phi).getByRole('combobox').first();
        await d.click(sel);
        await d.sleep(2500);
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'ranges',
      say: 'Here are the evidenced Ekene ranges: porosity from zero point one eight five to zero point two one five, water saturation from zero point three three six to zero point three six four, net to gross zero point seven seven to zero point eight three.',
      sub: 'Here are the evidenced Ekene ranges: porosity from 0.185 to 0.215, water saturation from 0.336 to 0.364, net-to-gross 0.77 to 0.83.',
      do: async (d) => {
        for (const k of ['phi', 'sw', 'ntg']) await setDist(d, k, RANGES.after[k], { onCamera: true });
      } },
    { id: 'structural', chapter: 'Structural mode', chapterSub: 'The contact and the maps',
      say: 'With surfaces, the rock volume comes from the maps. The run samples the contact, here within a foot and a half of the pick, and a GRV factor for the depth map, from zero point nine one two to one point zero nine, and reads the rock above each sampled contact off the maps, realisation by realisation.',
      sub: 'With surfaces, the rock volume comes from the maps. The run samples the contact, here within a foot and a half of the pick, and a GRV factor for the depth map, from 0.912 to 1.09, and reads the rock above each sampled contact off the maps, realisation by realisation.',
      do: async (d) => {
        const info = d.page.getByText(/^GRV is integrated from the top surface/).first();
        await d.highlight(info);
        await d.sleep(2000);
        await d.unhighlight();
        await setDist(d, 'owc', RANGES.after.owc, { onCamera: true });
        await setDist(d, 'grv', RANGES.after.grv, { onCamera: true });
        await setDist(d, 'bo', RANGES.after.bo);
      } },
    { id: 'settings', chapter: 'Iterations and the seed', chapterSub: 'A run anyone can repeat',
      say: 'Next, the run itself. Ten thousand iterations, and a seed: the same inputs and the same seed give the same realisations, so a reviewer can repeat your numbers exactly. Correlations come in lesson nine; this run has none.',
      do: async (d) => {
        await d.click(next(d));
        await d.sleep(600);
        await d.click(iter(d, '10k'));
        await d.type('rcp-mc-seed', '1');
        const corr = t(d, 'rcp-corr').getByRole('button', { name: 'Remove' });
        while (await corr.count()) await d.click(corr.first());
        await d.click(next(d));
        await d.sleep(600);
      } },
    { id: 'run1',
      say: 'Run it. P ninety, the low case, is eleven point three zero; P fifty, twelve point one four; P ten, the high case, thirteen point zero zero million barrels.',
      sub: 'Run it. P90, the low case, is 11.30; P50, 12.14; P10, the high case, 13.00 million barrels.',
      do: async (d) => {
        await run(d);
        await expectText(d, d.page.locator('body'), /P50 \(BEST ESTIMATE\) STOOIP\s*12\.14[\s\S]{0,60}11\.30[\s\S]{0,60}13\.00/i, 'seed 1');
      } },
    { id: 'repeat',
      sub: 'Run it again with the same seed: the same three numbers, to the last digit. Change the seed to two, and they move a little: 11.32, 12.13, 12.99. That movement is sampling noise, and more iterations shrink it.',
      say: 'Run it again with the same seed: the same three numbers, to the last digit. Change the seed to two, and they move a little: eleven point three two, twelve point one three, twelve point nine nine. That movement is sampling noise, and more iterations shrink it.',
      do: async (d) => {
        await run(d);
        await expectText(d, d.page.locator('body'), /STOOIP\s*12\.14[\s\S]{0,60}11\.30[\s\S]{0,60}13\.00/i, 'seed 1 again');
        await d.click(back(d));
        await d.sleep(500);
        await d.type('rcp-mc-seed', '2');
        await d.click(next(d));
        await d.sleep(500);
        await run(d);
        await expectText(d, d.page.locator('body'), /STOOIP\s*12\.13[\s\S]{0,60}11\.32[\s\S]{0,60}12\.99/i, 'seed 2');
      } },
    { id: 'read', chapter: 'Reading the result', chapterSub: 'P90, P50, P10 and the mean',
      say: 'P ninety is the volume there is a ninety percent chance of exceeding, so it is the low case. The expectation curve draws every one of those chances: read across at ninety, fifty and ten percent.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Analysis/ }));
        await dialog(d).getByText('Detailed', { exact: true }).waitFor({ timeout: 30000 });
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        await d.sleep(1500);
        const ec = dialog(d).locator('text=/Expectation curve \\(probability/ >> visible=true').first();
        await d.moveTo({ x: 1000, y: 600 });
        for (let i = 0; i < 12 && !(await ec.isVisible().catch(() => false)); i++) { await d.page.mouse.wheel(0, 300); await d.sleep(250); }
        await ec.scrollIntoViewIfNeeded();
        await d.highlight(ec.locator('xpath=ancestor::*[contains(@class,"rounded")][1]'));
        await d.sleep(4000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Correlations and fitting from data',
      say: 'Next, inputs that move together, and ranges fitted to measured data.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
