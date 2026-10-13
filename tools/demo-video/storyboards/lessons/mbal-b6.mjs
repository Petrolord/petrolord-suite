// Material Balance with Petrolord, Lesson B6: the pressure history match on
// Ekene. The match of N, the residuals, the 95 percent interval, and the
// same match with a different rock compressibility (just as tight, a
// different answer): the interval measures the data, not the inputs.
import {
  login, expectText, deleteCases, seedCase, setPvt, t, tab, mbalLessonMeta,
} from './mbal-common.mjs';

const seg = (d, name) => d.page.getByRole('radio', { name }).or(d.page.getByRole('button', { name, exact: true })).first();
async function match(d) {
  await d.click(d.page.getByRole('button', { name: /Run history match/ }));
  await d.page.getByText('Running the material balance engine').first().waitFor({ timeout: 3000 }).catch(() => {});
  await d.page.getByText('Running the material balance engine').first().waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
  await d.waitText('mbal-hm-status-line', /Converged/, { timeout: 120000 });
  await d.sleep(1200);
}

export default {
  id: 'lesson-mbal-b6',
  ...mbalLessonMeta(6, 'B', 'The pressure *history match*', 'Simulated pressures, residuals and what a confidence interval measures'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson B6/);
    await seedCase(d, shared, 'Lesson B6: Ekene');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'idea', chapter: 'The other way round', chapterSub: 'Simulate, then compare',
      say: 'The regression solves the oil in place from the measured pressures. The history match works the other way round. It takes a trial oil in place, simulates the pressure the tank would have had under the measured production, and adjusts the trial until the simulated pressures fall on the measured ones.',
      do: async (d) => {
        await d.click(seg(d, 'History match'));
        await d.sleep(1500);
        await d.highlight(d.page.getByText('Pressure history match', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'params',
      say: 'Ticked parameters are fitted, unticked ones held. For a closed oil tank there is one: the oil in place, started from the last regression.',
      do: async (d) => {
        await d.moveTo(d.page.getByText('STOIIP N (MMSTB)').first());
        await d.sleep(3000);
      } },
    { id: 'run', chapter: 'The match', chapterSub: 'Ekene',
      say: 'Run the match. It converges on twelve point one three nine million stock tank barrels, with a root mean square pressure error of a hundredth of a psi, and a ninety five percent interval of twelve point one three nine to twelve point one three nine.',
      sub: 'Run the match. It converges on 12.139 million stock tank barrels, with a root mean square pressure error of a hundredth of a psi, and a 95 percent interval of 12.139 to 12.139.',
      do: async (d) => {
        await match(d);
        await expectText(d, t(d, 'mbal-hm-matched'), /STOIIP N \(MMSTB\)\s*12\.140\s*12\.139\s*12\.139 to 12\.139/, 'matched N');
        const tbl = t(d, 'mbal-hm-matched').locator('xpath=ancestor::table[1]');
        await tbl.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        await d.highlight(tbl);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'plot', chapter: 'Residuals', chapterSub: 'Observed against simulated',
      say: 'The plot puts the simulated pressure through the measured surveys, with the misses as bars on the right axis. On field data the bars show whether the misses are random or follow a trend, which would point at a missing drive.',
      do: async (d) => {
        const plot = d.page.getByText('Dots are the observed pressures', { exact: false }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        await plot.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(plot);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'cf', chapter: 'What the interval measures', chapterSub: 'Change an input, match again',
      say: 'Now change the rock compressibility to six millionths per psi, and match again.',
      do: async (d) => {
        await setPvt(d, { api: null, salinity: null, cw: null, cf: '6e-6' }, { onCamera: true });
        await d.click(tab(d, 'Run'));
        await d.sleep(1000);
        await d.click(seg(d, 'History match'));
        await d.sleep(1200);
        await match(d);
      } },
    { id: 'cf2',
      say: 'Ten point five zero million barrels, matched just as tightly. The interval says how well the data pin the answer for the inputs given. It says nothing about whether the inputs are right. The uncertainty in the rock compressibility has to be carried by the analyst, as a range of runs.',
      sub: 'Ten point five zero million barrels, matched just as tightly. The interval says how well the data pin the answer for the inputs given. It says nothing about whether the inputs are right. The uncertainty in the rock compressibility has to be carried by the analyst, as a range of runs.',
      do: async (d) => {
        await expectText(d, t(d, 'mbal-hm-matched'), /STOIIP N \(MMSTB\)\s*[\d.]+\s*10\.50\d\s*10\.50\d to 10\.50\d/, 'matched N at cf 6e-6');
        const tbl = t(d, 'mbal-hm-matched').locator('xpath=ancestor::table[1]');
        await tbl.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        await d.highlight(tbl);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'A gas cap',
      say: 'Next, Module C: an oil rim under a gas cap, and the gas cap ratio m.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
