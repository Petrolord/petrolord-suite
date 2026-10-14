// Well Test Analysis Studio, demo 3: from the test to what the well can
// deliver (Ekene kit v4, oilfield units). The Ekene-11 interpretation of demo
// 2 (rate history, regression) sends its productivity index to Nodal
// Analysis Studio; the well model is the kit's Nodal sheet with Ekene-11's
// planned survey; the operating point as tested and with the 2.99 mechanical
// skin removed. `expectText` stops the take if the screen disagrees.
import {
  expectText, setupTest, pick, tab, kpi, fill, t,
} from './wt-common.mjs';

const NAME = 'WT demo: Ekene-11 deliverability';
const SURVEY = '0, 0, 74.74\n984.3, 0, 74.74\n1871.7, 22.54, 74.74\n5370.9, 22.54, 74.74';

// Nodal fields are found by their label text (the inputs are not linked to it)
const nodalInput = (d, re) => d.page.locator('div.space-y-1', { has: d.page.locator('label', { hasText: re }) }).locator('input').first();
async function nodalFill(d, rows) {
  for (const [re, v] of rows) {
    const l = nodalInput(d, re);
    await l.scrollIntoViewIfNeeded(); await l.fill(v); await l.blur(); await d.sleep(120);
  }
}
async function nodalSelect(d, label, option) {
  const trig = d.page.locator('div.space-y-1', { has: d.page.getByText(label, { exact: true }) }).locator('button[role=combobox]').first();
  await trig.scrollIntoViewIfNeeded(); await d.click(trig); await d.sleep(400);
  await d.click(d.page.getByRole('option', { name: option }).first()); await d.sleep(400);
}
const nodalKpi = (d, title) => d.page.locator('div.uppercase', { hasText: new RegExp(`^${title}$`, 'i') }).first().locator('xpath=following-sibling::div[1]');

export default {
  id: 'wt-03',
  app: 'Well Test Analysis Studio',
  eyebrow: 'Well Test Analysis Studio · 3 of 3',
  title: 'From the test to *what the well can deliver*',
  subtitle: 'Ekene-11\'s productivity index in Nodal Analysis Studio, as tested and with the damage removed',
  outroTitle: 'Well testing *with Petrolord*',
  outroSub: 'Well Test Analysis Studio · Nodal Analysis Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupTest(d, shared, { name: NAME, test: 'e11', basis: /rate history above/ });
    await fill(d, [[/^Well name/, 'Ekene-11'], [/^Field/, 'Ekene']]);
    await tab(d, 'Match');
    await d.page.getByRole('button', { name: /Auto-fit model/ }).click();
    await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
    await d.page.getByRole('button', { name: /^Save$/ }).first().click().catch(() => {});
    await d.sleep(3000);
    await tab(d, 'Report');
  },
  steps: [
    { id: 'intro', chapter: 'Well Test Analysis Studio', chapterSub: 'Ekene-11, read and saved',
      say: 'Demo two read Ekene-11\'s first test on its rate history: two hundred and twenty five millidarcies, and a mechanical skin of two point nine nine from drilling damage. The question a production engineer asks next is what that damage costs in barrels. The test answers it through the productivity index.',
      sub: 'Demo two read Ekene-11\'s first test on its rate history: 225 md, and a mechanical skin of 2.99 from drilling damage. The question a production engineer asks next is what that damage costs in barrels. The test answers it through the productivity index.',
      do: async (d) => {
        await d.sleep(1500);
        await d.highlight(kpi(d, 'Permeability k')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'send', chapter: 'The productivity index', chapterSub: 'Sent with its method',
      say: 'On the Report tab the studio states what it sends. The rate before the shut-in, forty barrels a day, over the drop from p star to the flowing pressure gives a productivity index of zero point eight seven one barrels a day per p. s. i. Take the skin\'s pressure drop out of that drawdown and it would be one point four five.',
      sub: 'On the Report tab the studio states what it sends. The rate before the shut-in, 40 STB/D, over the drop from p* to the flowing pressure gives a productivity index of 0.871 STB/D/psi. Take the skin\'s pressure drop out of that drawdown and it would be 1.45.',
      do: async (d) => {
        const note = t(d, 'wts-send-note');
        await note.scrollIntoViewIfNeeded();
        await expectText(d, note, /J 0\.871 STB\/D\/psi at 40 STB\/D/, 'J');
        await expectText(d, note, /with the skin removed J 1\.45 STB\/D\/psi/, 'J ideal');
        await d.highlight(note); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'nodal', chapter: 'Nodal Analysis Studio', chapterSub: 'The Well Test record',
      say: 'One click opens Nodal Analysis Studio with the Well Test record beside the inflow: the project, the method, the reservoir pressure from the superposition line, the test point, and both indices. Nothing changes until you choose.',
      sub: 'One click opens Nodal Analysis Studio with the Well Test record beside the inflow: the project, the method, the reservoir pressure from the superposition line, the test point, and both indices. Nothing changes until you choose.',
      do: async (d) => {
        await d.click(t(d, 'wts-send-nodal'));
        await t(d, 'nodal-wt-intake').waitFor({ timeout: 120000 });
        await d.sleep(2000);
        await expectText(d, t(d, 'nodal-wt-pr'), /2123\.5 psia \(p\* of the superposition line\)/, 'pr');
        await d.highlight(t(d, 'nodal-wt-intake')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'model', chapter: 'The well', chapterSub: 'Fluid, path and tubing',
      say: 'The rest of the well model comes from the kit\'s Nodal sheet: a thirty two degree A. P. I. oil with four hundred standard cubic feet of gas per barrel and a two thousand p. s. i. bubble point, Ekene-11\'s planned path at twenty two and a half degrees, two and seven eighths inch tubing, and two hundred p. s. i. at the wellhead.',
      sub: 'The rest of the well model comes from the kit\'s Nodal sheet: a 32 API oil with 400 scf/STB of gas and a 2,000 psia bubble point, Ekene-11\'s planned path at 22.5 degrees, 2-7/8 in tubing, and 200 psia at the wellhead.',
      do: async (d) => {
        await nodalFill(d, [[/^Oil gravity/, '32'], [/^Gas specific gravity/, '0.75'], [/^Solution GOR at Pb/, '400'], [/^Water salinity/, '35000'], [/^Bubble point/, '2000']]);
        await d.click(d.page.getByRole('tab', { name: 'Outflow' })); await d.sleep(1200);
        await nodalSelect(d, 'Geometry', /Deviated/);
        const ta = d.page.locator('textarea').first(); await ta.fill(SURVEY); await ta.blur();
        await nodalFill(d, [[/^Wellhead temperature/, '90'], [/^Bottomhole temperature/, '180'], [/^Tubing ID/, '2.441'], [/^Wellhead pressure/, '200']]);
        await nodalSelect(d, 'VLP correlation', /Hagedorn/);
        await nodalFill(d, [[/^Water cut/, '0'], [/^Producing GOR/, '400']]);
        await d.click(d.page.getByRole('tab', { name: 'Inflow' })); await d.sleep(1200);
      } },
    { id: 'tested', chapter: 'As tested', chapterSub: 'With the damage',
      say: 'As tested: the reservoir pressure and J go into the inflow, and the system plot finds the operating point. Ekene-11 would flow seven hundred and thirty six barrels a day at this wellhead pressure.',
      sub: 'As tested: the reservoir pressure and J go into the inflow, and the system plot finds the operating point. Ekene-11 would flow 736 STB/D at this wellhead pressure.',
      do: async (d) => {
        await d.click(t(d, 'nodal-wt-apply-tested')); await d.sleep(1500);
        await d.click(d.page.getByRole('tab', { name: 'System' })); await d.sleep(3500);
        await expectText(d, nodalKpi(d, 'Operating rate'), /^736/, 'q tested');
        await d.highlight(nodalKpi(d, 'Operating rate')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'ideal', chapter: 'Skin removed', chapterSub: 'What a stimulation is worth',
      say: 'Now the index with the skin removed. The same well, the same tubing and the same wellhead pressure: one thousand one hundred and fifty five barrels a day. That difference, four hundred and nineteen barrels a day from a mechanical skin of three, is the case for an acid job or a re-perforation, and it came from one gauge file read properly.',
      sub: 'Now the index with the skin removed. The same well, the same tubing and the same wellhead pressure: 1,155 STB/D. That difference, 419 STB/D from a mechanical skin of 3, is the case for an acid job or a re-perforation, and it came from one gauge file read properly.',
      do: async (d) => {
        await d.click(d.page.getByRole('tab', { name: 'Inflow' })); await d.sleep(1200);
        await d.click(t(d, 'nodal-wt-apply-ideal')); await d.sleep(1500);
        await d.click(d.page.getByRole('tab', { name: 'System' })); await d.sleep(3500);
        await expectText(d, nodalKpi(d, 'Operating rate'), /^1,155/, 'q ideal');
        await d.highlight(nodalKpi(d, 'Operating rate')); await d.sleep(3000); await d.unhighlight();
      } },
  ],
};
