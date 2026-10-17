// Earth Modelling with Petrolord, Lesson D11: volume uncertainty (3D grid
// upgrade, 2026-10-17). The STOIIP tornado; the Monte Carlo distribution with
// one draw per trial for every zone; the probability curve with P90, P50, P10;
// what each spread adds.
import { login, expectText, openEm, gridModel, build, results, t, emLessonMeta } from './em-common.mjs';

async function run(d) {
  await d.click('em-dist-run');
  await d.page.waitForFunction(() => /trials, seed/.test(document.querySelector('[data-testid="em-status"]')?.textContent || ''), null, { timeout: 300000 });
  await d.sleep(800);
}

export default {
  id: 'lesson-em-d11',
  ...emLessonMeta(11, 'D', 'Volume *uncertainty*', 'The tornado, the Monte Carlo distribution on the grid, and the probability curve'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d);
    await build(d);
    await results(d, 'charts');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'base', chapter: 'The base case', chapterSub: 'One realisation',
      say: 'The grid holds ten point three one million barrels in the Upper and Middle sand. How sure is that number?',
      do: async (d) => {
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.31 MMstb/, 'base');
        await d.highlight('em-chart-volumes');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'tornado', chapter: 'The tornado', chapterSub: 'One input at a time',
      say: 'The tornado moves one input at a time and keeps the rest: the contact thirty feet up and down, and porosity, net to gross, water saturation and the rock volume by ten percent. The contact matters most: thirty feet up leaves four point two seven million barrels and thirty feet down gives sixteen point six two, because with water saturation from the logs the deeper sand is counted as oil. The rock volume, porosity, net to gross and water saturation each move it by about a million barrels either way.',
      do: async (d) => {
        await t(d, 'em-chart-tornado').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-tornado'), /Contact: 4\.27 to\s*16\.62[\s\S]*GRV: 9\.27 to\s*11\.34/, 'tornado');
        await d.highlight('em-chart-tornado');
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'setup', chapter: 'The distribution', chapterSub: 'The spreads to sample',
      say: 'The distribution samples them together. The contact within thirty feet either way, Bo within five percent, and porosity within five percent, because a simulated porosity has no kriging variance; the kriged net to gross moves by its own. One draw per trial moves all the zones together, as they share the contact. Two hundred trials, seed one.',
      do: async (d) => {
        await t(d, 'em-dist').scrollIntoViewIfNeeded();
        await d.highlight('em-dist');
        await d.sleep(5000);
        await d.unhighlight();
        await run(d);
      } },
    { id: 'curve', chapter: 'The probability curve', chapterSub: 'P90, P50 and P10',
      say: 'The curve reads the chance the field holds at least each volume. P ninety is the low case: seven point two five million barrels. P fifty ten point five, and P ten, the high case, thirteen point six six. The base case, ten point three one, sits close to P fifty.',
      do: async (d) => {
        await t(d, 'em-chart-probability').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-probability'), /P90 7\.25, P50 10\.50, P10 13\.66 MMstb/, 'curve');
        await d.highlight('em-chart-probability');
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'contactonly', chapter: 'The contact alone', chapterSub: 'What it adds',
      say: 'With only the contact moving, P ninety to P ten is seven point four five to thirteen point nine three million barrels: the contact is almost all of the spread, because the oil column is only sixty seven feet.',
      do: async (d) => {
        await t(d, 'em-dist-bo').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-dist-bo'), '0');
        await d.type(t(d, 'em-dist-phi'), '0');
        await d.click(t(d, 'em-dist-props'));
        await run(d);
        await t(d, 'em-chart-probability').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-probability'), /P90 7\.45, P50 10\.86, P10 13\.93 MMstb/, 'contact only');
        await d.highlight('em-chart-probability');
        await d.sleep(4500);
        await d.unhighlight();
      } },
  ],
};
