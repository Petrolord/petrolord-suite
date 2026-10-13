// ReservoirCalc Pro, demo 2: how sure are we (Ekene kit v4).
// The booked case (12.14 MM stb on the six-well map) run as a Monte Carlo in
// structural mode: the contacts and a GRV factor are sampled against the
// mapped surfaces. Assumption ranges first, then the same rock with the
// evidence attached (MDT contact, checkshot-tied depth, signed-off cutoffs,
// core porosity, Archie m, PVT Bo). Ranges as in the NAPE 2026 study;
// 50,000 realisations, seed 20261109, no correlations.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, toProbabilistic, setDist, runSettings, RANGES, distCard, DIST,
} from './rcp-common.mjs';

const body = (d) => d.page.locator('body');
const next = (d) => d.page.getByRole('button', { name: /^Next/ });
const back = (d) => d.page.getByRole('button', { name: /Back/ });
const panelScroll = (d) => d.page.locator('[data-testid="rcp-mc-dists"]').locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');

async function runMc(d) {
  await d.click(next(d));
  await d.sleep(800);
  await d.highlight(t(d, 'rcp-mc-seed'));
  await d.sleep(1200);
  await d.unhighlight();
  await d.click(next(d));
  await d.sleep(600);
  await d.click('rcp-mc-run');
  await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
  await d.sleep(1500);
}
async function openAnalysis(d) {
  await d.click(d.page.getByRole('button', { name: /View Full Analysis/ }));
  await dialog(d).getByText('Detailed', { exact: true }).waitFor({ timeout: 30000 });
  await d.sleep(600);
  await d.click(dialog(d).getByText('Detailed', { exact: true }));
  // the Detailed view renders as it scrolls: wheel down to the tornado
  const head = dialog(d).locator('text=/Sensitivity Tornado \\(P50/').first();
  await d.moveTo({ x: 1000, y: 600 });
  for (let i = 0; i < 16 && !(await head.isVisible().catch(() => false)); i++) { await d.page.mouse.wheel(0, 350); await d.sleep(250); }
  await head.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await d.sleep(1500);
}

export default {
  id: 'rcp-02',
  app: 'ReservoirCalc Pro',
  eyebrow: 'ReservoirCalc Pro · 2 of 3',
  title: 'How sure *are we?*',
  subtitle: 'Monte Carlo on the mapped structure, P90, P50 and P10, the tornado, and what evidence does to the range',
  outroTitle: 'Volumetrics *with Petrolord*',
  outroSub: 'ReservoirCalc Pro · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await stoiip(d);
    await toProbabilistic(d);
    await t(d, 'rcp-sim-setup-toggle').click();
    for (const [k, v] of Object.entries(RANGES.before)) await setDist(d, k, v);
    await next(d).click(); await d.sleep(400);
    await runSettings(d);
    await back(d).click(); await d.sleep(400);
    await panelScroll(d).evaluate((e) => { e.scrollTop = 0; });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'How sure are we?', chapterSub: 'One number hides the range',
      say: 'The Ekene Sand is booked at twelve point one four million barrels. One number hides how sure we are. In probabilistic mode, ReservoirCalc Pro samples the contact and the structure against the mapped surfaces, and the rock and fluid properties, thousands of times.',
      sub: 'The Ekene Sand is booked at 12.14 million barrels. One number hides how sure we are. In probabilistic mode, ReservoirCalc Pro samples the contact and the structure against the mapped surfaces, and the rock and fluid properties, thousands of times.',
      do: async (d) => {
        const base = d.page.getByText('Linked Deterministic Base Volume:').locator('xpath=..');
        await expectText(d, base, /12\.14 MM STB/, 'base volume');
        await d.highlight(base);
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'assumed', chapter: 'Assumption ranges', chapterSub: 'Before the evidence is attached',
      say: 'These are the ranges before any evidence is attached. Porosity from zero point one seven to zero point two three; net to gross from zero point six five to zero point nine. The contact anywhere from just below the lowest oil seen to the spill point, and a GRV factor from zero point zero eight to two point two one, for a depth map converted with the sonic alone.',
      sub: 'These are the ranges before any evidence is attached. Porosity from 0.17 to 0.23; net-to-gross from 0.65 to 0.9. The contact anywhere from just below the lowest oil seen to the spill point, and a GRV factor from 0.08 to 2.21, for a depth map converted with the sonic alone.',
      do: async (d) => {
        await d.highlight(distCard(d, DIST.phi));
        await d.sleep(1800);
        await d.unhighlight();
        await d.scroll(panelScroll(d), 420, { ms: 1400 });
        await d.highlight(distCard(d, DIST.ntg));
        await d.sleep(1500);
        await d.unhighlight();
        await d.scroll(panelScroll(d), 360, { ms: 1400 });
        await d.highlight(distCard(d, DIST.owc));
        await d.sleep(2000);
        await d.highlight(distCard(d, DIST.grv));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'run1', chapter: 'Fifty thousand realisations', chapterSub: 'A fixed seed, so the run can be repeated',
      say: 'Fifty thousand realisations with a fixed seed, so anyone can repeat the run. The low case, P ninety, is eight point seven three million barrels; the best estimate, P fifty, nineteen point three six; and the high case, P ten, thirty six point five four.',
      sub: 'Fifty thousand realisations with a fixed seed, so anyone can repeat the run. The low case, P90, is 8.73 million barrels; the best estimate, P50, 19.36; and the high case, P10, 36.54.',
      do: async (d) => {
        await runMc(d);
        await expectText(d, body(d), /19\.36[\s\S]{0,120}8\.73[\s\S]{0,120}36\.54/, 'P50, P90 and P10 before evidence');
        await d.sleep(2500);
      } },
    { id: 'tornado1', chapter: 'What drives it', chapterSub: 'The tornado',
      say: 'The tornado says why. The GRV factor carries sixty two percent of the variance and the contact thirty three: together, the structure and the contact carry almost all of it.',
      sub: 'The tornado says why. The GRV factor carries 62% of the variance and the contact 33%: together, the structure and the contact carry almost all of it.',
      do: async (d) => {
        await openAnalysis(d);
        await expectText(d, dialog(d), /GRV Factor\s*62% var[\s\S]*OWC\s*33% var/, 'tornado before evidence');
        await d.sleep(3500);
        await d.page.keyboard.press('Escape');
        await d.sleep(800);
      } },
    { id: 'evidence1', chapter: 'Attach the evidence', chapterSub: 'Contact and depth',
      say: 'Now the evidence. The pressure gradients put the contact within a foot and a half of the log pick, and the checkshot tied depth map holds the GRV factor between zero point nine one two and one point zero nine.',
      sub: 'Now the evidence. The pressure gradients put the contact within a foot and a half of the log pick, and the checkshot-tied depth map holds the GRV factor between 0.912 and 1.09.',
      do: async (d) => {
        await d.click(back(d));
        await d.sleep(400);
        await d.click(back(d));
        await d.sleep(600);
        await setDist(d, 'owc', RANGES.after.owc, { onCamera: true });
        await setDist(d, 'grv', RANGES.after.grv, { onCamera: true });
      } },
    { id: 'evidence2',
      say: 'The cutoffs are signed off, the porosity is checked against core, the water saturation follows the measured cementation exponent, and the formation volume factor comes from the P V T laboratory.',
      sub: 'The cutoffs are signed off, the porosity is checked against core, the water saturation follows the measured cementation exponent, and the formation volume factor comes from the PVT laboratory.',
      do: async (d) => {
        await setDist(d, 'ntg', RANGES.after.ntg, { onCamera: true });
        await setDist(d, 'phi', RANGES.after.phi, { onCamera: true });
        await setDist(d, 'sw', RANGES.after.sw, { onCamera: true });
        await setDist(d, 'bo', RANGES.after.bo, { onCamera: true });
      } },
    { id: 'run2', chapter: 'The same rock, evidenced', chapterSub: 'The range narrows',
      say: 'The same rock, run again with the same seed. P ninety rises from eight point seven three to eleven point three two million barrels, P fifty is twelve point one four, and P ten is thirteen. No new barrels were found: the evidence removed the low tail the assumptions had to carry.',
      sub: 'The same rock, run again with the same seed. P90 rises from 8.73 to 11.32 million barrels, P50 is 12.14, and P10 is 13.00. No new barrels were found: the evidence removed the low tail the assumptions had to carry.',
      do: async (d) => {
        await runMc(d);
        await expectText(d, body(d), /12\.14[\s\S]{0,120}11\.32[\s\S]{0,120}13\.00/, 'P50, P90 and P10 with evidence');
        await d.sleep(3000);
      } },
    { id: 'tornado2',
      say: 'Now the depth surface carries forty seven percent and porosity thirty three: what is left to narrow is where to spend the next well or the next core.',
      sub: 'Now the depth surface carries 47% and porosity 33%: what is left to narrow is where to spend the next well or the next core.',
      do: async (d) => {
        await openAnalysis(d);
        await expectText(d, dialog(d), /GRV Factor\s*47% var[\s\S]*Porosity\s*33% var/, 'tornado with evidence');
        await d.sleep(3500);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'next', chapter: 'Evidence narrows the range', chapterSub: 'And the low case rises',
      say: 'Evidence attached to each input moves the low case up, from the same rock. That is uncertainty with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
