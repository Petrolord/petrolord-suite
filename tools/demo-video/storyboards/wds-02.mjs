// Well Design Studio, demo 2: who else is down there (Ekene kit v4).
// Ekene-11 (demo 1's plan, kickoff 1,312 ft) on the Ekene Alpha platform
// with its four neighbours: Ekene-8 and Ekene-9 from the well registry, and
// Ekene-10 and Ekene-12 drilled, their definitive surveys imported here.
// The uncertainty on every station, the separation scan (review against
// Ekene-8 and -9 at the kickoff), a shallower kickoff that clears every
// neighbour, and the mud window and casing seats from Ekene-8's
// pore pressure prognosis applied by subsea depth.
import {
  login, expectText, openStudio, buildPad, seedEkene11, selectDesign, solveJ, saveDesign, pickOffsets, runScan,
  t, tab, T1,
} from './wds-common.mjs';

const SITE = 'WDS demo: Ekene Alpha';
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const card = (d, name) => d.page.getByText(new RegExp(`^${name} \\(`)).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');

export default {
  id: 'wds-02',
  app: 'Well Design Studio',
  eyebrow: 'Well Design Studio · 2 of 3',
  title: 'Who else is *down there*',
  subtitle: 'Uncertainty on every station, a separation scan against four neighbours, and the mud window from the pad\'s own prognosis',
  outroTitle: 'Well design *with Petrolord*',
  outroSub: 'Well Design Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await buildPad(d, shared, SITE);
    await seedEkene11(d, SITE, { kop: '1312.3' });
    await openStudio(d, shared);
    await selectDesign(d, SITE, 'Ekene-11', 'Plan 1');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Ekene Alpha', chapterSub: 'Four wells already on the platform',
      say: 'Ekene eleven is planned, but Ekene Alpha already has four wells. Ekene eight and Ekene nine are in the well registry, loaded with their surveys in Well Data Manager. Ekene ten and Ekene twelve were drilled from this platform, and their definitive surveys were imported here, on the Surveys tab.',
      sub: 'Ekene-11 is planned, but Ekene Alpha already has four wells. Ekene-8 and Ekene-9 are in the well registry, loaded with their surveys in Well Data Manager. Ekene-10 and Ekene-12 were drilled from this platform, and their definitive surveys were imported here, on the Surveys tab.',
      do: async (d) => {
        await d.sleep(1500);
        await d.click(view(d, 'Plots'));
        await d.sleep(1200);
        await d.click(t(d, 'toggle-offsets'));
        await d.sleep(4000);
        await d.highlight(t(d, 'plan-view-chart'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'eou', chapter: 'How wrong the line might be', chapterSub: 'Uncertainty on every station',
      say: 'A trajectory is a line, and a plan is a line plus how wrong it might be. Every station carries the industry error model, I. S. C. W. S. A. M. W. D. revision four, and the ellipses show two standard deviations of where the hole could really be. They grow with depth.',
      sub: 'A trajectory is a line, and a plan is a line plus how wrong it might be. Every station carries the industry error model, ISCWSA MWD Rev 4, and the ellipses show two standard deviations of where the hole could really be. They grow with depth.',
      do: async (d) => {
        await d.moveTo(d.page.getByRole('button', { name: /EOU/ }).first());
        await d.sleep(1500);
        await d.highlight(t(d, 'plan-view-chart'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'ac', chapter: 'Anti-collision', chapterSub: 'The separation rule',
      say: 'The anti-collision scan takes the saved plan and the four neighbours. The rule is the industry separation factor: the clearance between the two holes, edge to edge, divided by three and a half combined standard deviations of their uncertainty. Below one point five it asks for a review, and below one it is a no-go.',
      sub: 'The anti-collision scan takes the saved plan and the four neighbours. The rule is the industry separation factor: the clearance between the two holes, edge to edge, divided by 3.5 combined standard deviations of their uncertainty. Below 1.5 it asks for a review, and below 1 it is a no-go.',
      do: async (d) => {
        await d.click(tab(d, 'Anti-Collision'));
        await pickOffsets(d, /^Ekene-(8|9|10|12)\b/, { onCamera: true });
        await d.sleep(800);
        await d.highlight(d.page.getByText(/Separation rule/i).first().locator('xpath=..'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'run', chapter: 'The scan', chapterSub: 'Review at the kickoff',
      say: 'Run it. Ekene ten and Ekene twelve are clear. Against Ekene eight and Ekene nine the separation factor falls to one point zero three at the kickoff: review. Their slot is sixteen feet away, and the two wells run side by side, straight down, for thirteen hundred feet while the ellipses grow.',
      sub: 'Run it. Ekene-10 and Ekene-12 are clear. Against Ekene-8 and Ekene-9 the separation factor falls to 1.03 at the kickoff: review. Their slot is 16 ft away, and the two wells run side by side, straight down, for 1,300 ft while the ellipses grow.',
      do: async (d) => {
        await runScan(d, { onCamera: true });
        await expectText(d, d.page.locator('body'), /REVIEW\s*Ekene-9 \(registry\)\s*min SF 1\.03 at MD 1,?312 ft/i, 'Ekene-9 review');
        await d.highlight(card(d, 'Ekene-8'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'ladder',
      say: 'The ladder shows the separation factor down the whole well. It falls from the surface to the kickoff, and climbs as soon as Ekene eleven turns away.',
      do: async (d) => {
        const ladder = d.page.getByText(/Separation-factor ladder/).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        await ladder.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(ladder);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'kop', chapter: 'Leave early', chapterSub: 'Kick off below the conductor',
      say: 'So leave early. Back in the design, kick off at five hundred feet, just below the thirty inch conductor shoe, at the same build rate. The well now holds nineteen degrees and reaches the target in six thousand five hundred and seventy one feet.',
      sub: 'So leave early. Back in the design, kick off at 500 ft, just below the 30 in conductor shoe, at the same build rate. The well now holds 19.0° and reaches the target in 6,571 ft.',
      do: async (d) => {
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1000);
        await solveJ(d, T1.name, { kop: '500', rate: '2.54', onCamera: true });
        await expectText(d, kpis(d), /Total MD\s*6571[\s\S]*Max Inc\s*19\.0/i, 'kop 500');
        await d.highlight(kpis(d));
        await d.sleep(2500);
        await d.unhighlight();
        await saveDesign(d, { onCamera: true });
      } },
    { id: 'rescan',
      say: 'Save, and scan again. Every neighbour is clear. The closest approach is now to Ekene eight and Ekene nine at the new kickoff, with a separation factor of one point eight five. Save run keeps the scan with the design as the evidence it was checked.',
      sub: 'Save, and scan again. Every neighbour is clear. The closest approach is now to Ekene-8 and Ekene-9 at the new kickoff, with a separation factor of 1.85. Save run keeps the scan with the design as the evidence it was checked.',
      do: async (d) => {
        await d.click(tab(d, 'Anti-Collision'));
        await pickOffsets(d, /^Ekene-(8|9|10|12)\b/);
        await runScan(d, { onCamera: true });
        await expectText(d, d.page.locator('body'), /CLEAR\s*Ekene-9 \(registry\)\s*min SF 1\.85 at MD 500 ft/i, 'clear at 500');
        await d.highlight(card(d, 'Ekene-9'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: /Save run/ }).first());
        await d.sleep(2000);
      } },
    { id: 'ppfg', chapter: 'The mud window', chapterSub: 'From the pad\'s own prognosis',
      say: 'Last, the pressures. Ekene eleven has no logs yet, but Ekene eight, sixteen feet away on the same platform, has a pore pressure prognosis published from Pore Pressure Studio. The mud window takes it by subsea depth and hangs it on Ekene eleven\'s own path.',
      sub: 'Last, the pressures. Ekene-11 has no logs yet, but Ekene-8, 16 ft away on the same platform, has a pore pressure prognosis published from Pore Pressure Studio. The mud window takes it by subsea depth and hangs it on Ekene-11\'s own path.',
      do: async (d) => {
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(800);
        await d.click(view(d, 'Section'));
        await d.sleep(800);
        await d.click(view(d, 'PPFG'));
        await t(d, 'mud-window-panel').waitFor({ timeout: 60000 });
        await d.sleep(2000);
        await d.highlight(t(d, 'wd-ppfg-source'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'seats',
      say: 'The safe window between pore pressure and fracture pressure is shaded, in pounds per gallon. With half a pound of trip margin and half a pound of kick margin, the casing seats are selected from the bottom up on Ekene eleven\'s own trajectory: three shoes, at least one thousand four hundred and thirty two, four thousand four hundred and seventy eight, and five thousand three hundred and fifty eight feet true vertical depth, with thirteen point six three pounds per gallon of mud below the last.',
      sub: 'The safe window between pore pressure and fracture pressure is shaded, in pounds per gallon. With 0.5 ppg of trip margin and 0.5 ppg of kick margin, the casing seats are selected from the bottom up on Ekene-11\'s own trajectory: three shoes, at least 1,432, 4,478 and 5,358 ft true vertical depth, with 13.63 ppg of mud below the last.',
      do: async (d) => {
        await expectText(d, t(d, 'mud-window-seats'), /shoe 1 at least TVD 1432 ft[\s\S]*shoe 2 at least TVD 4478 ft[\s\S]*shoe 3 at least TVD 5358 ft \(MD 5609\), 13\.63 ppg below/, 'casing seats');
        await d.highlight(t(d, 'mud-window-seats'));
        await d.sleep(5000);
        await d.unhighlight();
        await d.highlight(t(d, 'mud-window-panel'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Clear to drill', chapterSub: 'Uncertainty, clearance and pressure on one plan',
      say: 'One plan that knows how wrong it might be, clears every neighbour by the industry rule, and carries the pressures it will meet. Next: what happens to it when the geologists change the map.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
