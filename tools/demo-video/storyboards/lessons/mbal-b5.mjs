// Material Balance with Petrolord, Lesson B5: is there an aquifer? (Ekene). The level Campbell plot, what an example aquifer
// would have delivered on this pressure history (Screening), a pot aquifer
// forced into the model (the fit the data cannot determine, flagged), and the
// range the rock compressibility gives: 13.16 / 12.14 / 10.50 MM stb at
// 3, 4 and 6 millionths per psi.
import {
  login, expectText, deleteCases, seedCase, setAquifer, runMbal, showPlot, t, tab, mbalLessonMeta,
} from './mbal-common.mjs';

const CASE = 'Lesson B5: Ekene';
const seg = (d, name) => d.page.getByRole('radio', { name }).or(d.page.getByRole('button', { name, exact: true })).first();
const ooip = (d) => t(d, 'mbal-result-card').getByText(/^\d[\d.,]* (MMSTB|MSTB)$/).first();

export default {
  id: 'lesson-mbal-b5',
  ...mbalLessonMeta(5, 'B', 'Is there *an aquifer?*', 'The Campbell test, aquifer screening, and a fit the data cannot make'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson B5/);
    await seedCase(d, shared, CASE);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The closed tank', chapterSub: 'Testing it',
      say: 'The Ekene case gives twelve point one four million stock tank barrels with no aquifer in the model. That is only right if no water is coming in from outside the tank. So we test it, and then ask how sure the number is.',
      sub: 'The Ekene case gives 12.14 million stock tank barrels with no aquifer in the model. That is only right if no water is coming in from outside the tank. So we test it, and then ask how sure the number is.',
      do: async (d) => {
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB/, 'closed tank');
        await d.highlight(ooip(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'campbell', chapter: 'The first test', chapterSub: 'Campbell',
      say: 'The first test is the Campbell plot. Each survey on its own implies the same oil in place, so the points lie on a level line. Water influx would add energy that grows with time, and the points would climb.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'campbell');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'screen', chapter: 'What an aquifer would do', chapterSub: 'Aquifer screening',
      say: 'Screening shows what an aquifer would have done on this pressure history. With the built-in example of an edge aquifer, Carter-Tracy puts six point two one million reservoir barrels of water into the tank by January twenty twenty-three. Water on that scale holds the pressure up. Ekene\'s pressure fell from three thousand two hundred to two thousand and ninety six psia.',
      sub: 'Screening shows what an aquifer would have done on this pressure history. With the built-in example of an edge aquifer, Carter-Tracy puts 6.21 million reservoir barrels of water into the tank by January 2023. Water on that scale holds the pressure up. Ekene\'s pressure fell from 3,200 to 2,096 psia.',
      do: async (d) => {
        await d.click(tab(d, 'Aquifer'));
        await d.sleep(1200);
        await d.click(seg(d, 'Screening'));
        await d.sleep(1500);
        const ct = d.page.getByRole('button', { name: 'Carter-Tracy', exact: true }).or(d.page.getByRole('tab', { name: 'Carter-Tracy' })).first();
        await d.click(ct);
        await d.sleep(1500);
        const we = d.page.getByText('CUMULATIVE INFLUX WE', { exact: false }).first().locator('xpath=..');
        await expectText(d, we, /6\.213 MMRB/, 'screening influx');
        await d.highlight(we);
        await d.sleep(3000);
        await d.unhighlight();
        const res = d.page.getByText('Influx results').first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        await res.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(res);
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'pot', chapter: 'Forcing an aquifer in', chapterSub: 'A pot aquifer on a closed tank',
      say: 'Now force a pot aquifer into the model and run it. The fit claims a strong water drive: an aquifer of forty point nine million reservoir barrels, and only seventy two point eight three thousand barrels of oil, at an r squared of nought point nine nine nine nine nine eight.',
      sub: 'Now force a pot aquifer into the model and run it. The fit claims a strong water drive: an aquifer of 40.9 million reservoir barrels, and only 72.83 thousand barrels of oil, at an r² of 0.999998.',
      do: async (d) => {
        await d.click(seg(d, 'Model'));
        await d.sleep(800);
        await setAquifer(d, 'Pot aquifer', { onCamera: true });
        await runMbal(d, { onCamera: true });
        const card = t(d, 'mbal-result-card');
        await expectText(d, card, /strong water drive[\s\S]*OOIP\s*72\.83 MSTB[\s\S]*Regression r2\s*0\.999998[\s\S]*Aquifer W\s*40\.9 MMRB/, 'pot aquifer fit');
        await d.highlight(card.locator('div.grid').first());
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'flag',
      say: 'The studio flags it. Above the bubble point, the aquifer and the expansion of the oil, the rock and the water all grow in step with the pressure drop, so this data cannot tell them apart, and the line through the points means nothing. The badge vouches for the engine path. A high r squared does not make the model right.',
      sub: 'The studio flags it. Above the bubble point, the aquifer and the expansion of the oil, the rock and the water all grow in step with the pressure drop, so this data cannot tell them apart, and the line through the points means nothing. The badge vouches for the engine path. A high r² does not make the model right.',
      do: async (d) => {
        const flag = t(d, 'mbal-identifiability');
        await expectText(d, flag, /This fit does not determine the oil in place/, 'identifiability flag');
        await flag.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(flag);
        await d.sleep(5000);
        await d.unhighlight();
      },
      wait: async (d) => {
        await setAquifer(d, 'None');
        await runMbal(d);
      },
      waitLabel: 'Back to a closed tank' },

    { id: 'next', chapter: 'Next', chapterSub: 'History match',
      say: 'A closed tank, tested two ways. Next, the pressure history match, and what its confidence interval does and does not say.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
