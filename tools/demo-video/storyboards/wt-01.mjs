// Well Test Analysis Studio, demo 1: from a gauge file to permeability, skin
// and the fault (Ekene kit v4, oilfield units). Ekene-5's week-long buildup
// of May 2024 (seed/wt_assets.mjs): the gauge file holds the last day of
// flow, so the shut-in is read off the record; the derivative shows storage,
// radial flow and a rise; the straight lines give k, skin and a first fault
// distance; the sealing-fault model recovers the generating truth (k 225 md,
// storage 0.0025 bbl/psi, the Ekene Growth Fault 533 ft away) and the skin
// splits into partial penetration and damage. `expectText` stops the take
// if the screen disagrees with the narration (LENIENT=1 logs instead).
import {
  expectText, expectValue, setupTest, importGauge, pick, tab, kpi, railRow, scrollMain, fill, t, FILES,
} from './wt-common.mjs';

const NAME = 'WT demo: Ekene-5 buildup';

export default {
  id: 'wt-01',
  app: 'Well Test Analysis Studio',
  eyebrow: 'Well Test Analysis Studio · 1 of 3',
  title: 'From a gauge file to *permeability, skin and a fault*',
  subtitle: 'A week-long buildup on Ekene-5: the derivative, the straight lines and a model that recovers the truth',
  outroTitle: 'Well testing *with Petrolord*',
  outroSub: 'Well Test Analysis Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupTest(d, shared, { name: NAME, test: 'e5', gauge: false });
    await fill(d, [[/^Shut-in time on the gauge clock/, '']]);
    await scrollMain(d, 0, { ms: 0 });
    await d.page.locator('aside').first().evaluate((el) => { const s = el.querySelector('.overflow-y-auto') || el; s.scrollTop = 0; }).catch(() => {});
  },
  steps: [
    { id: 'intro', chapter: 'Well Test Analysis Studio', chapterSub: 'Ekene-5, shut in for a week',
      say: 'A pressure buildup is the cheapest long look a reservoir engineer gets at the rock around a well. This is Ekene-5, shut in for a week in May twenty twenty four. The rock and fluid properties are already typed in from the Ekene kit.',
      sub: 'A pressure buildup is the cheapest long look a reservoir engineer gets at the rock around a well. This is Ekene-5, shut in for a week in May 2024. The rock and fluid properties are already typed in from the Ekene kit.',
      do: async (d) => {
        await d.sleep(1500);
        await d.moveTo(d.page.getByLabel(/^Net thickness h/).first()); await d.sleep(1500);
        await d.moveTo(d.page.getByLabel(/^Rate q/).first()); await d.sleep(1500);
      } },
    { id: 'import', chapter: 'The gauge file', chapterSub: 'Columns and units from the headers',
      say: 'The gauge file goes in as it came off the gauge. One hundred and seventy readings; the time and pressure columns are found from their headers, in hours and absolute p. s. i.',
      sub: 'The gauge file goes in as it came off the gauge. 170 readings; the time and pressure columns are found from their headers, in hours and absolute psi.',
      do: async (d) => {
        await importGauge(d, FILES.e5, { onCamera: true });
        await expectText(d, t(d, 'wts-import-mapping'), /170 readings loaded/, 'readings');
        await d.highlight(t(d, 'wts-import-mapping')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'shutin', chapter: 'The shut-in', chapterSub: 'Read off the gauge record',
      say: 'The file starts a day before the shut-in, while the well was still flowing. Rather than hunt for the moment by eye, the studio finds it: twenty four hours on the gauge clock, where the pressure jumps two point five three p. s. i. in the next ten seconds. The reading at that instant is the flowing pressure at shut-in, two thousand and forty point zero p. s. i., and the skin depends on it.',
      sub: 'The file starts a day before the shut-in, while the well was still flowing. Rather than hunt for the moment by eye, the studio finds it: 24 hr on the gauge clock, where the pressure jumps 2.53 psi in the next 10 s. The reading at that instant is the flowing pressure at shut-in, 2,040.0 psi, and the skin depends on it.',
      do: async (d) => {
        const b = t(d, 'wts-find-start');
        await b.scrollIntoViewIfNeeded(); await d.click(b); await d.sleep(1200);
        await expectText(d, d.page.getByText(/Shut-in found at/).first(), /Shut-in found at 24 hr on the gauge clock: the pressure rises 2\.53 psi in the next 10 s/, 'found');
        await expectText(d, t(d, 'wts-pwf-readout'), /2040\.0 psi, gauge reading at the shut-in/, 'pwf');
        await d.highlight(t(d, 'wts-pwf-readout')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'overview', chapter: 'The test', chapterSub: 'Flow, then a week of buildup',
      say: 'The buildup rises sixty two p. s. i. over the week, most of it in the first hour.',
      sub: 'The buildup rises 62 psi over the week, most of it in the first hour.',
      do: async (d) => {
        await scrollMain(d, 0); await d.sleep(3000);
      } },
    { id: 'loglog', chapter: 'The derivative', chapterSub: 'Storage, radial flow, then a rise',
      say: 'The Diagnostics tab is where a well test is read. Blue is the pressure change, red its Bourdet derivative. Early on both climb together on a unit slope: the wellbore filling up. The hump is the skin. Then the derivative goes flat: radial flow, and its level gives a k h of four thousand five hundred and thirty millidarcy feet. After about six hours it rises again, towards the dashed line at twice the plateau. Something in the rock has stopped the pressure spreading in one direction.',
      sub: 'The Diagnostics tab is where a well test is read. Blue is the pressure change, red its Bourdet derivative. Early on both climb together on a unit slope: the wellbore filling up. The hump is the skin. Then the derivative goes flat: radial flow, and its level gives a kh of 4,530 md·ft. After about 6 hr it rises again, towards the dashed line at twice the plateau. Something in the rock has stopped the pressure spreading in one direction.',
      do: async (d) => {
        await tab(d, 'Diagnostics', { onCamera: true });
        await expectText(d, kpi(d, 'Radial plateau kh'), /4,530/, 'kh');
        await d.highlight(kpi(d, 'Radial plateau kh')); await d.sleep(2500); await d.unhighlight();
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.82, dy: 0.45 }); await d.sleep(3000);
      } },
    { id: 'regimes',
      say: 'The regimes are listed under the plot. The rise is named for what it is: by forty six hours the derivative stands at one point six times the plateau, and it is still climbing. The radius of investigation at the end of radial flow, five hundred and fifty six feet, is a first guess at how far away the obstacle is.',
      sub: 'The regimes are listed under the plot. The rise is named for what it is: by 46 hr the derivative stands at 1.6 times the plateau, and it is still climbing. The radius of investigation at the end of radial flow, 556 ft, is a first guess at how far away the obstacle is.',
      do: async (d) => {
        const rise = d.page.getByText(/Derivative rising after radial flow/).first();
        await expectText(d, rise, /to 1\.6 times the plateau/, 'rise');
        await rise.scrollIntoViewIfNeeded(); await d.highlight(rise); await d.sleep(2500); await d.unhighlight();
        await expectText(d, t(d, 'wts-ri-note'), /556 ft at the end of radial flow/, 'ri');
        await d.highlight(t(d, 'wts-ri-note')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'horner', chapter: 'The straight lines', chapterSub: 'Horner on the radial flow',
      say: 'On the Specialized tab the Horner line sits on the radial flow the derivative found. Permeability two hundred and seventeen millidarcies, skin four point nine one. The blue points are the ones fitted, and the line runs on to p star.',
      sub: 'On the Specialized tab the Horner line sits on the radial flow the derivative found. Permeability 217 md, skin 4.91. The blue points are the ones fitted, and the line runs on to p*.',
      do: async (d) => {
        await tab(d, 'Specialized', { onCamera: true });
        await expectText(d, kpi(d, 'Permeability k'), /^217/, 'k');
        await expectText(d, kpi(d, 'Skin'), /^4\.91/, 'skin');
        await d.highlight(kpi(d, 'Permeability k')); await d.sleep(2000); await d.unhighlight();
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.5, dy: 0.45 }); await d.sleep(2000);
      } },
    { id: 'second', chapter: 'The second line', chapterSub: 'Where the fault shows',
      say: 'A second line on the last four days of the test is steeper by a factor of one point seven five. A sealing fault doubles the slope, and where the two lines meet gives a distance: four hundred and thirty one feet. The late line has not quite doubled yet, so this straight-line distance reads short.',
      sub: 'A second line on the last four days of the test is steeper by a factor of 1.75. A sealing fault doubles the slope, and where the two lines meet gives a distance: 431 ft. The late line has not quite doubled yet, so this straight-line distance reads short.',
      do: async (d) => {
        await fill(d, [[/^Late from/, '72'], [/^Late to/, '168']], { onCamera: true });
        await d.sleep(800);
        const card = t(d, 'wts-fault-result');
        await card.scrollIntoViewIfNeeded(); await d.sleep(600);
        await expectText(d, kpi(d, 'm2 / m1'), /^1\.75/, 'ratio');
        await expectText(d, kpi(d, 'Distance to the fault L'), /^431/, 'L');
        await d.highlight(card); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'match', chapter: 'The model', chapterSub: 'Homogeneous with a sealing fault',
      say: 'The model match uses the whole curve. On the Match tab, choose the homogeneous reservoir with a sealing fault and run the regression on pressure and derivative together.',
      sub: 'The model match uses the whole curve. On the Match tab, choose the homogeneous reservoir with a sealing fault and run the regression on pressure and derivative together.',
      do: async (d) => {
        await tab(d, 'Match', { onCamera: true });
        await pick(d, 'Reservoir model', /Homogeneous \+ sealing fault/, { onCamera: true });
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
        await d.sleep(1000);
      } },
    { id: 'fit',
      say: 'Converged. Permeability two hundred and twenty five millidarcies, skin five point three five, wellbore storage zero point zero zero two five barrels per p. s. i., and the fault five hundred and thirty two feet away. That is the answer the test was built from: the rock\'s two hundred and fifty millidarcies times the oil end point of zero point nine, and the Ekene Growth Fault, which the structure map puts one hundred and sixty two and a half metres, five hundred and thirty three feet, from Ekene-5.',
      sub: 'Converged. Permeability 225 md, skin 5.35, wellbore storage 0.0025 bbl/psi, and the fault 532 ft away. That is the answer the test was built from: the rock\'s 250 md times the oil end point of 0.9, and the Ekene Growth Fault, which the structure map puts 162.5 m (533 ft) from Ekene-5.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k');
        await expectText(d, kpi(d, 'Skin'), /^5\.35/, 'skin');
        const L = d.page.getByLabel(/^Distance to boundary/).first();
        await expectValue(d, L, /^532\./, 'L');
        await expectValue(d, d.page.getByLabel(/^Wellbore storage \(bbl/).first(), /^0\.0025/, 'C');
        await d.highlight(kpi(d, 'Permeability k')); await d.sleep(1800); await d.unhighlight();
        await d.highlight(L); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'skin', chapter: 'The skin', chapterSub: 'Geometry, then damage',
      say: 'Only the top four metres of the oil column are perforated, so part of that skin is geometry. With the perforated interval on the Data tab, the studio splits it: two point one six from partial penetration, Papatzacos, and a mechanical skin of one point nine nine. The damage is real but small.',
      sub: 'Only the top 4 m of the oil column are perforated, so part of that skin is geometry. With the perforated interval on the Data tab, the studio splits it: 2.16 from partial penetration (Papatzacos), and a mechanical skin of 1.99. The damage is real but small.',
      do: async (d) => {
        await expectText(d, railRow(d, 'Partial-penetration skin'), /2\.16/, 'spp');
        await expectText(d, railRow(d, 'Mechanical skin'), /1\.99/, 'mech');
        await d.highlight(railRow(d, 'Partial-penetration skin')); await d.sleep(2000); await d.unhighlight();
        await d.highlight(railRow(d, 'Mechanical skin')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'report', chapter: 'The report', chapterSub: 'Every input with its source',
      say: 'The report holds every input with its source, the skin split, the method and its limits, and the plots, and exports as a P. D. F. One gauge file, and the known answer recovered.',
      sub: 'The report holds every input with its source, the skin split, the method and its limits, and the plots, and exports as a PDF. One gauge file, and the known answer recovered.',
      do: async (d) => {
        await tab(d, 'Report', { onCamera: true });
        await d.sleep(1500);
        await scrollMain(d, 700, { ms: 1800 }); await d.sleep(1200);
        await scrollMain(d, 1600, { ms: 1800 }); await d.sleep(1200);
        await scrollMain(d, 0, { ms: 1200 });
        await d.moveTo(d.page.getByRole('button', { name: /Export PDF report/i })); await d.sleep(2000);
      } },
  ],
};
