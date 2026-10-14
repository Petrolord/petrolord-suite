// Well Test Analysis Studio, demo 2: a clean-up test read on its rate
// history (Ekene kit v4, oilfield units). Ekene-11's initial test of March
// 2027 (seed/wt_assets.mjs): a clean-up with a one-hour shut-in, the main
// flow, four hours choked back for bottomhole samples, then a two-day buildup. Horner on one rate for the equivalent
// producing time reads it wrong; the rate history by superposition recovers
// the generating truth (k 225 md, skin 5.61 of which 3.0 is damage, storage
// 0.006 bbl/psi). `expectText` stops the take if the screen disagrees.
import {
  expectText, expectValue, setupTest, importGauge, pick, tab, kpi, railRow, scrollMain, t, FILES,
} from './wt-common.mjs';

const NAME = 'WT demo: Ekene-11 initial test';

export default {
  id: 'wt-02',
  app: 'Well Test Analysis Studio',
  eyebrow: 'Well Test Analysis Studio · 2 of 3',
  title: 'A clean-up test, *read on its rate history*',
  subtitle: 'Ekene-11\'s first test: why Horner\'s one rate misleads, and what superposition recovers',
  outroTitle: 'Well testing *with Petrolord*',
  outroSub: 'Well Test Analysis Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupTest(d, shared, { name: NAME, test: 'e11', gauge: false, rates: false });
    await d.page.getByLabel(/^Shut-in time on the gauge clock/).first().fill('');
    await scrollMain(d, 0, { ms: 0 });
  },
  steps: [
    { id: 'intro', chapter: 'Well Test Analysis Studio', chapterSub: 'Ekene-11, the first test',
      say: 'Ekene-11 is the new well from the Ekene Alpha platform. Its first test, in March twenty twenty seven, did what first tests do: the well cleaned up, was shut in for an hour to change the choke, flowed for twelve hours, and was then choked back for four hours to take bottomhole samples before the two-day shut-in. The gauge recorded all of it.',
      sub: 'Ekene-11 is the new well from the Ekene Alpha platform. Its first test, in March 2027, did what first tests do: the well cleaned up, was shut in for an hour to change the choke, flowed for 12 hr, and was then choked back for 4 hr to take bottomhole samples before the two-day shut-in. The gauge recorded all of it.',
      do: async (d) => {
        await d.sleep(1200);
        await importGauge(d, FILES.e11, { onCamera: true });
        await expectText(d, t(d, 'wts-import-mapping'), /319 readings loaded/, 'readings');
      } },
    { id: 'shutin', chapter: 'Which shut-in', chapterSub: 'The last one',
      say: 'The pressure rises sharply three times on this record: the clean-up shut-in, the cut to the sampling rate, and the final shut-in. The studio takes the last, the one the buildup follows: twenty one and a half hours on the gauge clock.',
      sub: 'The pressure rises sharply three times on this record: the clean-up shut-in, the cut to the sampling rate, and the final shut-in. The studio takes the last, the one the buildup follows: 21.5 hr on the gauge clock.',
      do: async (d) => {
        const b = t(d, 'wts-find-start');
        await b.scrollIntoViewIfNeeded(); await d.click(b); await d.sleep(1200);
        await expectText(d, d.page.getByText(/Shut-in found at/).first(), /Shut-in found at 21\.5 hr on the gauge clock.*holds 3 sharp rises/, 'found');
        await d.highlight(t(d, 'wts-pwf-readout')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'rates', chapter: 'The rate history', chapterSub: 'Five steps',
      say: 'The rates come from the test report: forty barrels a day, shut in, a hundred for twelve hours, forty while sampling, then the final shut-in. Horner\'s method needs one rate for one producing time, so the usual shortcut is the equivalent producing time: the oil produced over the last rate, thirty eight hours.',
      sub: 'The rates come from the test report: 40 STB/D, shut in, 100 for 12 hr, 40 while sampling, then the final shut-in. Horner\'s method needs one rate for one producing time, so the usual shortcut is the equivalent producing time: the oil produced over the last rate, 38 hr.',
      do: async (d) => {
        const b = t(d, 'wts-import-rates');
        await b.scrollIntoViewIfNeeded(); await d.moveTo(b); await d.sleep(600);
        await t(d, 'wts-rates-file').setInputFiles(FILES.e11rates);
        await d.sleep(1500);
        await expectText(d, t(d, 'wts-time-basis-note'), /equivalent producing time is 38\.0 hr/, 'tpe');
        await t(d, 'wts-time-basis').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'wts-time-basis-note')); await d.sleep(2500); await d.unhighlight();
        await d.click(t(d, 'wts-use-equivalent-tp')); await d.sleep(1000);
      } },
    { id: 'horner', chapter: 'Horner, one rate', chapterSub: 'The shortcut',
      say: 'On that shortcut the Horner line reads a permeability of one hundred and fifty millidarcies and a skin of two point zero zero. It looks like an answer, and it would make the damage look small.',
      sub: 'On that shortcut the Horner line reads a permeability of 150 md and a skin of 2.00. It looks like an answer, and it would make the damage look small.',
      do: async (d) => {
        await tab(d, 'Specialized', { onCamera: true });
        await expectText(d, kpi(d, 'Permeability k'), /^150/, 'k horner');
        await expectText(d, kpi(d, 'Skin'), /^2\.00/, 'skin horner');
        await d.highlight(kpi(d, 'Permeability k')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'basis', chapter: 'The rate history', chapterSub: 'Superposition',
      say: 'Now read the same buildup after the rate history itself. Every rate step is superposed: the straight line is fitted on superposition time, the derivative is plotted on its equivalent time, and the model runs through every step.',
      sub: 'Now read the same buildup after the rate history itself. Every rate step is superposed: the straight line is fitted on superposition time, the derivative is plotted on its equivalent time, and the model runs through every step.',
      do: async (d) => {
        await tab(d, 'Data', { onCamera: true });
        await pick(d, 'Buildup time basis', /rate history above/, { onCamera: true });
        await d.sleep(800);
      } },
    { id: 'superposition',
      say: 'The superposition line: two hundred and seventeen millidarcies, skin five point two five, and p star two thousand one hundred and twenty three point five p. s. i., the reservoir pressure the test started from.',
      sub: 'The superposition line: 217 md, skin 5.25, and p* 2,123.5 psi, the reservoir pressure the test started from.',
      do: async (d) => {
        await tab(d, 'Specialized', { onCamera: true });
        await expectText(d, kpi(d, 'Permeability k'), /^217/, 'k sup');
        await expectText(d, kpi(d, 'Skin'), /^5\.25/, 'skin sup');
        await expectText(d, kpi(d, 'p\\*'), /^2123\.5/, 'pstar');
        await d.highlight(kpi(d, 'p\\*')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'loglog', chapter: 'The derivative', chapterSub: 'On the history\'s equivalent time',
      say: 'On the log-log plot, storage, then a flat derivative: radial flow with no boundary in two days. Ekene-11 is a kilometre and a half from the growth fault.',
      sub: 'On the log-log plot, storage, then a flat derivative: radial flow with no boundary in two days. Ekene-11 is a kilometre and a half from the growth fault.',
      do: async (d) => {
        await tab(d, 'Diagnostics', { onCamera: true });
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.6, dy: 0.6 }); await d.sleep(3000);
      } },
    { id: 'fit', chapter: 'The match', chapterSub: 'Through every rate step',
      say: 'The regression on the whole curve converges on two hundred and twenty five millidarcies, a skin of five point six one, and a storage of zero point zero zero five nine nine barrels per p. s. i. Within rounding, those are the values the test was built from.',
      sub: 'The regression on the whole curve converges on 225 md, a skin of 5.61, and a storage of 0.00599 bbl/psi. Within rounding, those are the values the test was built from.',
      do: async (d) => {
        await tab(d, 'Match', { onCamera: true });
        await d.click(d.page.getByRole('button', { name: /Auto-fit model/ }));
        await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k fit');
        await expectText(d, kpi(d, 'Skin'), /^5\.61/, 'skin fit');
        await expectText(d, kpi(d, 'Storage C'), /^0\.00599/, 'C fit');
        await d.highlight(kpi(d, 'Skin')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'skin', chapter: 'The skin', chapterSub: 'Partial, slanted, damaged',
      say: 'The well crosses the sand at twenty two degrees and is perforated over the top of the oil column. With the perforations in measured and vertical depth, the skin splits: one point four zero from partial penetration, almost nothing from the slant, and a mechanical skin of two point nine nine. That is drilling damage: the well delivers fifty nine point nine per cent of what an undamaged well would. The next demo asks what removing it is worth.',
      sub: 'The well crosses the sand at 22 degrees and is perforated over the top of the oil column. With the perforations in measured and vertical depth, the skin splits: 1.40 from partial penetration, almost nothing from the slant, and a mechanical skin of 2.99. That is drilling damage: the well delivers 59.9% of what an undamaged well would. The next demo asks what removing it is worth.',
      do: async (d) => {
        await expectText(d, railRow(d, 'Partial-penetration skin'), /1\.40/, 'spp');
        await expectText(d, railRow(d, 'Mechanical skin'), /2\.99/, 'mech');
        await expectText(d, railRow(d, 'Flow efficiency'), /59\.9%/, 'fe');
        await d.highlight(railRow(d, 'Partial-penetration skin')); await d.sleep(1800); await d.unhighlight();
        await d.highlight(railRow(d, 'Mechanical skin')); await d.sleep(1800); await d.unhighlight();
        await d.highlight(railRow(d, 'Flow efficiency')); await d.sleep(2500); await d.unhighlight();
      } },
  ],
};
