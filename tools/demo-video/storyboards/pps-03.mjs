// Pore Pressure Studio, demo 3: when the prognosis changes (Ekene kit v4).
// Demo 2's state, rebuilt off camera: the prognosis on the working copy of
// Ekene-1 calibrated to the shoe tests, published and saved, and Ekene West-1
// in Well Design Studio reviewed against it. On camera the kit's MDT pretests
// arrive, n is fitted to them, the studio says the published prognosis is now
// out of date, Publish, and the well plan says what moved and records the new
// prognosis (the NAPE data governance theme: a change to a decision input
// tells you which downstream outputs need refreshing).
import {
  expectText, setupStudio, pickWell, demoOnePrognosis, importKitFile, buildWestSite, openWestWindow, openStudio,
  dockTo, readout, t, WELL,
} from './pps-common.mjs';

export default {
  id: 'pps-03',
  app: 'Pore Pressure Studio',
  eyebrow: 'Pore Pressure Studio · 3 of 3',
  title: 'When the *prognosis changes*',
  subtitle: 'New pressure tests, a recalibrated prognosis, and a well plan that knows it was checked against the old one',
  outroTitle: 'Pore pressure *with Petrolord*',
  outroSub: 'Pore Pressure Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupStudio(d, shared);
    await buildWestSite(d, shared);
    await openStudio(d, shared);
    await pickWell(d, WELL);
    await demoOnePrognosis(d);
    await importKitFile(d, 'ekene-lot-fit.csv');
    await importKitFile(d, 'ekene-mud-weights.csv');
    await t(d, 'pp-fit-lot').click(); await d.sleep(1500);
    await t(d, 'pp-publish').click();
    await t(d, 'pp-publish-state').filter({ hasText: 'Published, matches' }).waitFor({ timeout: 60000 });
    await t(d, 'pp-save-project').click(); await d.sleep(2500);
    await openWestWindow(d, shared);
    await t(d, 'wd-ppfg-record').click();
    await t(d, 'wd-ppfg-reviewed').waitFor({ timeout: 60000 });
    await d.sleep(2000);
    await openStudio(d, shared);
    await t(d, 'pp-prognosis-chart').waitFor({ timeout: 120000 });
    await d.sleep(2500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The prognosis in use', chapterSub: 'Published, and read by the well plan',
      say: 'The project reopens where it was saved: the prognosis calibrated to the shoe tests, published, and the chip says the registry holds exactly this one. Well Design Studio has a plan, Ekene West-1, that was reviewed against it. Now the reservoir pressure tests arrive.',
      do: async (d) => {
        await d.sleep(1500);
        await expectText(d, t(d, 'pp-publish-state'), /Published, matches/, 'published');
        await d.highlight(t(d, 'pp-publish-state'));
        await d.sleep(2500);
        await d.unhighlight();
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.62/, 'before');
      } },
    { id: 'mdt', chapter: 'Pressure tests', chapterSub: 'MDT pretests in the Ekene Sand',
      say: 'The kit\'s MDT file holds pretests from two wells. The import door keeps the rows for Ekene-1, the eight pretests at the Ekene Sand, and lists the four from Ekene-3 as skipped. The psia readings become gauge pressures on the way in.',
      do: async (d) => {
        await dockTo(d, 'pp-cal-import-open');
        await importKitFile(d, 'ekene-mdt-pressures.csv', { onCamera: true, hold: 3500 });
        await expectText(d, t(d, 'pp-status'), /Imported 8 calibration points from ekene-mdt-pressures\.csv; 4 lines not read/, 'mdt import');
      } },
    { id: 'misfit',
      say: 'The pretests sit to the left of the line. At the reservoir the prognosis from the logs reads twelve point six two pounds per gallon, and the measured pressures are lower: the logs alone read high here, by one point one nine megapascals on average.',
      sub: 'The pretests sit to the left of the line. At the reservoir the prognosis from the logs reads 12.62 ppg, and the measured pressures are lower: the logs alone read high here, by 1.19 MPa on average.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-note-calibration'), /Calibration: 8 points, PP misfit RMS 1\.19 MPa/, 'misfit');
        await d.highlight(t(d, 'pp-note-calibration'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'fit', chapter: 'Fit n', chapterSub: 'Eaton\'s exponent to the measured pressures',
      say: 'Fit n searches Eaton\'s exponent on the prognosis exactly as shown, through the shale pressures and the interpreted line. It lands on two point four zero three, and the misfit falls to zero point zero one megapascals. The Ekene Sand now reads eleven point nine seven pounds per gallon, in line with the pretests.',
      sub: 'Fit n searches Eaton\'s exponent on the prognosis exactly as shown, through the shale pressures and the interpreted line. It lands on 2.403, and the misfit falls to 0.01 MPa. The Ekene Sand now reads 11.97 ppg, in line with the pretests.',
      do: async (d) => {
        await d.click(t(d, 'pp-fit-calibration'));
        await expectText(d, t(d, 'pp-status'), /Fitted n 2\.403 on the shown prognosis to 8 measured pressures: misfit RMS [\d.]+ MPa before, 0\.01 MPa after/, 'fit');
        await d.highlight(t(d, 'pp-status'));
        await d.sleep(2500);
        await d.unhighlight();
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 11\.97/, 'after');
      } },
    { id: 'stale', chapter: 'Unpublished changes', chapterSub: 'The readers still have the old one',
      say: 'And the chip has changed. The prognosis open here now differs from the one in the registry by up to zero point seven nine pounds per gallon. Well Design Studio and every other reader still use the published one, until it is published again. Nothing changes downstream behind anyone\'s back.',
      sub: 'And the chip has changed. The prognosis open here now differs from the one in the registry by up to 0.79 ppg. Well Design Studio and every other reader still use the published one, until it is published again. Nothing changes downstream behind anyone\'s back.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-publish-state'), /Unpublished changes \(0\.79 ppg\)/, 'stale chip');
        await d.highlight(t(d, 'pp-publish-state'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.highlight(t(d, 'pp-note-published'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'seats', chapter: 'Fewer strings', chapterSub: 'Seats on the calibrated prognosis',
      say: 'The fracture pressure rests on the pore pressure, so it is calibrated to the leak-off tests again: Poisson\'s ratio zero point two nine five. The casing design follows: two shoes now, at least four thousand one hundred and seven and five thousand two hundred and sixty nine feet, with thirteen point nine seven pounds per gallon of mud to total depth.',
      sub: 'The fracture pressure rests on the pore pressure, so it is calibrated to the leak-off tests again: Poisson\'s ratio 0.295. The casing design follows: two shoes now, at least 4,107 and 5,269 ft, with 13.97 ppg of mud to total depth.',
      do: async (d) => {
        await d.click(t(d, 'pp-fit-lot'));
        await expectText(d, t(d, 'pp-status'), /Fracture gradient calibrated to 2 tests: nu 0\.295/, 'nu again');
        await d.sleep(1500);
        await expectText(d, t(d, 'pp-casing-seats'), /shoe at least 4107 ft MD, then 12\.53 ppg below; shoe at least 5269 ft MD, then 13\.97 ppg below/, 'seats');
        await d.highlight(t(d, 'pp-casing-seats'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'publish',
      say: 'Publish. The registry now holds the calibrated prognosis, and the chip says it matches again. Save keeps the project.',
      do: async (d) => {
        await d.click(t(d, 'pp-publish'));
        await expectText(d, t(d, 'pp-publish-state'), /Published, matches/, 'published again');
        await d.sleep(1500);
        await d.click(t(d, 'pp-save-project'));
        await d.sleep(1500);
      } },
    { id: 'wds', chapter: 'Downstream', chapterSub: 'Ekene West-1 in Well Design Studio',
      say: 'In Well Design Studio, Ekene West-1 opens with a notice: the prognosis on the copy of Ekene-1 changed after this design was reviewed against it. It says when, and what moved on this trajectory: the first two shoes go deeper, to three thousand nine hundred and eighty eight and four thousand nine hundred and twenty feet true vertical depth, shoes three, four and five are no longer needed, and the highest pore pressure drops from fourteen point one two to thirteen point three four pounds per gallon.',
      sub: 'In Well Design Studio, Ekene West-1 opens with a notice: the prognosis on the copy of Ekene-1 changed after this design was reviewed against it. It says when, and what moved on this trajectory: the first two shoes go deeper, to 3,988 and 4,920 ft true vertical depth, shoes 3, 4 and 5 are no longer needed, and the highest pore pressure drops from 14.12 to 13.34 ppg.',
      do: async (d, shared) => {
        await openWestWindow(d, shared, { onCamera: true });
        await expectText(d, t(d, 'wd-ppfg-source-changed'), /What moved: shoe 1 at least TVD 1,595 ft to 3,988 ft; shoe 2 at least TVD 4,034 ft to 4,920 ft; shoes 3, 4 and 5 no longer needed; highest pore pressure 14\.12 to 13\.34 ppg/, 'what moved');
        await d.highlight(t(d, 'wd-ppfg-source-changed'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'refresh',
      say: 'The drilling engineer decides. Refresh from source records the new prognosis as the one this plan is reviewed against, with its new seats. Keep current values would record that the change was seen and set aside.',
      do: async (d) => {
        await d.click(t(d, 'wd-ppfg-source-changed-refresh'));
        await expectText(d, t(d, 'wd-ppfg-reviewed'), /reviewed against the prognosis on PPS demo: Ekene-1/, 'refreshed');
        await d.highlight(t(d, 'wd-ppfg-reviewed'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'close', chapter: 'Governed by design', chapterSub: 'Every change says what it touches',
      say: 'A prognosis is a decision input. When it changes, the studio that owns it says it is not yet published, and the plan that used it says what moved and asks for a decision. That is data governance built into the tools themselves.',
      do: async (d) => { await d.sleep(3500); } },
  ],
};
