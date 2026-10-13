// Volumetrics with Petrolord, Lesson C10: sensitivity.
// The evidenced Ekene Monte Carlo (50k, seed 20261109, no correlations,
// P90/P50/P10 11.32/12.14/13.00): the tornado (P50 when each input sits in
// its bottom or top tenth of the run), the variance shares, the spider plot,
// and the realisations behind P90 and P10.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, toProbabilistic, setDist, runSettings, RANGES, rcpLessonMeta,
} from './rcp-common.mjs';

const next = (d) => d.page.getByRole('button', { name: /^Next/ });
async function wheelTo(d, loc) {
  await d.moveTo({ x: 1000, y: 600 });
  for (let i = 0; i < 20 && !(await loc.isVisible().catch(() => false)); i++) { await d.page.mouse.wheel(0, 300); await d.sleep(250); }
  await loc.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await d.sleep(1200);
}

export default {
  id: 'lesson-rcp-c10',
  ...rcpLessonMeta(10, 'C', '*Sensitivity*', 'The tornado, variance shares, the spider plot and the realisations behind P90 and P10'),
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
    await runSettings(d);
    await next(d).click(); await d.sleep(400);
    await t(d, 'rcp-mc-run').click();
    await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
    await d.sleep(1000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'What drives the range', chapterSub: 'Sensitivity from the run itself',
      say: 'The evidenced Ekene run: P ninety eleven point three two, P fifty twelve point one four, P ten thirteen million barrels. Which input matters most? The answer comes from the run\'s own realisations, with no extra runs.',
      sub: 'The evidenced Ekene run: P90 11.32, P50 12.14, P10 13.00 million barrels. Which input matters most? The answer comes from the run\'s own realisations, with no extra runs.',
      do: async (d) => {
        await expectText(d, d.page.locator('body'), /STOOIP\s*12\.14[\s\S]{0,60}11\.32[\s\S]{0,60}13\.00/i, 'run');
        await d.click(d.page.getByRole('button', { name: /View Full Analysis/ }));
        await dialog(d).getByText('Detailed', { exact: true }).waitFor({ timeout: 30000 });
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        await d.sleep(1200);
      } },
    { id: 'tornado', chapter: 'The tornado', chapterSub: 'P50 swing per input',
      say: 'Each bar is one input. Its ends are the P fifty of the realisations where that input sat in its bottom tenth, and in its top tenth. The GRV factor swings it from eleven point four zero to twelve point nine two million barrels; porosity next, from eleven point four nine to twelve point seven nine.',
      sub: 'Each bar is one input. Its ends are the P50 of the realisations where that input sat in its bottom tenth, and in its top tenth. The GRV factor swings it from 11.40 to 12.92 million barrels; porosity next, from 11.49 to 12.79.',
      do: async (d) => {
        const head = dialog(d).locator('text=/Sensitivity Tornado \\(P50/ >> visible=true').first();
        await wheelTo(d, head);
        await expectText(d, dialog(d), /GRV Factor\s*47% var\s*11\.40\s*12\.92\s*Porosity\s*33% var\s*11\.49\s*12\.79/, 'tornado bars');
        await d.sleep(3000);
      } },
    { id: 'variance',
      say: 'Under each name is its share of the variance: forty seven percent for the depth map, thirty three for porosity, nine for net to gross and eight for the contact. To narrow the range, work on the top bars first.',
      do: async (d) => {
        await expectText(d, dialog(d), /GRV Factor\s*47% var[\s\S]*Porosity\s*33% var[\s\S]*NTG\s*9% var[\s\S]*OWC\s*8% var/, 'variance shares');
        await d.sleep(3500);
      } },
    { id: 'spider', chapter: 'The spider plot', chapterSub: 'Volume as each input moves',
      say: 'The spider plot draws the volume as each input moves from low to high with the others at their medians. A steep line is a sensitive input.',
      do: async (d) => {
        const sp = dialog(d).locator('text=/Spider plot/ >> visible=true').first();
        await wheelTo(d, sp);
        await d.sleep(3500);
      } },
    { id: 'realisations', chapter: 'Behind P90 and P10', chapterSub: 'The realisations at the percentiles',
      say: 'Finally, the run keeps the realisations that landed nearest to P ninety, P fifty and P ten, with every input they drew. They answer the reviewer\'s question: what does the low case actually assume?',
      do: async (d) => {
        const rc = dialog(d).locator('text=/^Realization Tracker$/ >> visible=true').first();
        await wheelTo(d, rc);
        await d.sleep(4000);
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Reports and exports',
      say: 'Module D delivers the work: reports and exports, then projects, sharing and the links to the other apps.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
