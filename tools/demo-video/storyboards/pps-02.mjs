// Pore Pressure Studio, demo 2: calibrate, design, hand over (Ekene kit v4).
// Demo 1's prognosis on the working copy of Ekene-1, then the kit's shoe
// tests and mud weights through the import door (05-pressure): the fracture
// gradient calibrated to the leak-off tests, the mud weights checked against
// the pore pressure (the 9.8 ppg attempt that took an influx at 1,418 m),
// the casing seats, Publish, and Well Design Studio's mud window on a planned
// well beside Ekene-1 reading the published prognosis by subsea depth.
import {
  expectText, setupStudio, pickWell, demoOnePrognosis, importKitFile, buildWestSite, openWestWindow, openStudio,
  dockTo, readout, t, WELL, WEST,
} from './pps-common.mjs';

export default {
  id: 'pps-02',
  app: 'Pore Pressure Studio',
  eyebrow: 'Pore Pressure Studio · 2 of 3',
  title: 'Calibrate, design, *hand over*',
  subtitle: 'Leak-off tests, the mud weights that held and the one that did not, casing seats, and the mud window in Well Design Studio',
  outroTitle: 'Pore pressure *with Petrolord*',
  outroSub: 'Pore Pressure Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupStudio(d, shared);
    await buildWestSite(d, shared);
    await openStudio(d, shared);
    await pickWell(d, WELL);
    await demoOnePrognosis(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Where we left it', chapterSub: 'A prognosis from the logs alone',
      say: 'This is the prognosis from the logs: Eaton in the shales of the working copy of Ekene-1, drawn as an interpreted line. Nothing measured has touched it yet. Ekene-1 was drilled, so the kit carries what the drillers measured: shoe tests, the mud weights they used, and pressure tests in the reservoir.',
      do: async (d) => {
        await d.sleep(1500);
        await d.highlight(t(d, 'pp-prognosis-chart'));
        await d.sleep(3500);
        await d.unhighlight();
        await expectText(d, t(d, 'pp-note-calibration'), /Not calibrated/, 'not calibrated');
      } },
    { id: 'lot', chapter: 'Shoe tests', chapterSub: 'Leak-off and formation integrity',
      say: 'The shoe tests come in through the import door as the kit ships them. The studio reads the columns, the units and the depth reference from the header, and the test type from its own column: two leak-off tests and one formation integrity test.',
      do: async (d) => {
        await dockTo(d, 'pp-cal-import-open');
        await importKitFile(d, 'ekene-lot-fit.csv', { onCamera: true, hold: 3500 });
        await expectText(d, t(d, 'pp-status'), /Imported 3 calibration points from ekene-lot-fit\.csv/, 'lot import');
      } },
    { id: 'lotfit',
      say: 'The diamonds sit below the blue fracture line: Poisson\'s ratio of zero point four was too high for these rocks. Calibrating to the two leak-off tests sets it to zero point two five eight, and the fracture pressure comes down onto them. A formation integrity test is only a lower bound, so it is left out of the fit.',
      sub: 'The diamonds sit below the blue fracture line: Poisson\'s ratio of 0.4 was too high for these rocks. Calibrating to the two leak-off tests sets it to 0.258, and the fracture pressure comes down onto them. A formation integrity test is only a lower bound, so it is left out of the fit.',
      do: async (d) => {
        await d.highlight(t(d, 'pp-prognosis-chart'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(t(d, 'pp-fit-lot'));
        await d.sleep(1500);
        await expectText(d, t(d, 'pp-status'), /Fracture gradient calibrated to 2 tests: nu 0\.258/, 'nu');
        await d.highlight(t(d, 'pp-status'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'mw', chapter: 'The mud weights', chapterSub: 'What held, and what did not',
      say: 'Then the mud weights. Five held. One did not: the first attempt through the top of the ramp, at nine point eight pounds per gallon, took an influx at four thousand six hundred and fifty two feet. The file says so, and the studio draws it as a red triangle.',
      sub: 'Then the mud weights. Five held. One did not: the first attempt through the top of the ramp, at 9.8 ppg, took an influx at 4,652 ft. The file says so, and the studio draws it as a red triangle.',
      do: async (d) => {
        await importKitFile(d, 'ekene-mud-weights.csv', { onCamera: true, hold: 2500 });
        await d.highlight(t(d, 'pp-prognosis-chart'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'evidence',
      say: 'The line under the seats checks the prognosis against them. At the influx it puts the pore pressure at eleven point five six pounds per gallon, above the nine point eight that failed, so the prognosis explains the kick. It also says where it may read high: near the top of the ramp the held mud weights sit below it. That is the honest place to be careful.',
      sub: 'The line under the seats checks the prognosis against them. At the influx it puts the pore pressure at 11.56 ppg, above the 9.8 that failed, so the prognosis explains the kick. It also says where it may read high: near the top of the ramp the held mud weights sit below it. That is the honest place to be careful.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-mw-evidence'), /9\.80 ppg took an influx at 4652 ft MD where the prognosis puts the pore pressure at 11\.56 ppg: consistent/, 'kick explained');
        await d.highlight(t(d, 'pp-mw-evidence'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'seats', chapter: 'Casing seats', chapterSub: 'On the calibrated fracture line',
      say: 'With the fracture line calibrated, the casing seats are worked out again from the bottom up, and on this uncalibrated pore pressure they come to five shoes: at least three thousand and seventy one, four thousand one hundred and twenty, four thousand seven hundred and twenty three, five thousand two hundred and seventy nine, and six thousand seven hundred and twenty one feet.',
      sub: 'With the fracture line calibrated, the casing seats are worked out again from the bottom up, and on this uncalibrated pore pressure they come to five shoes: at least 3,071, 4,120, 4,723, 5,279 and 6,721 ft.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-casing-seats'), /shoe at least 3071 ft MD[\s\S]*shoe at least 4120 ft MD[\s\S]*shoe at least 4723 ft MD[\s\S]*shoe at least 5279 ft MD[\s\S]*shoe at least 6721 ft MD, then 14\.75 ppg below/, 'seats');
        await d.highlight(t(d, 'pp-casing-seats'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Publish', chapterSub: 'To the well registry',
      say: 'Publish writes the pore pressure, fracture pressure and overburden to the well in the registry, with the method, the parameters and the inputs in their provenance. The chip beside it now says the published prognosis matches the one open here. Save keeps the project.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-publish-state'), /Not published/, 'not published');
        await d.click(t(d, 'pp-publish'));
        await expectText(d, t(d, 'pp-publish-state'), /Published, matches/, 'published');
        await d.highlight(t(d, 'pp-publish-state'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(t(d, 'pp-save-project'));
        await expectText(d, t(d, 'pp-status'), /Project saved/, 'saved');
      } },
    { id: 'wds', chapter: 'Well Design Studio', chapterSub: 'A planned well beside Ekene-1',
      say: 'In Well Design Studio, Ekene West-1 is planned from a location beside Ekene-1, a build and hold to seven thousand feet subsea. It has no logs of its own. Its mud window finds the prognosis just published on the copy of Ekene-1 and applies it by subsea depth.',
      sub: 'In Well Design Studio, Ekene West-1 is planned from a location beside Ekene-1, a build and hold to 7,000 ft subsea. It has no logs of its own. Its mud window finds the prognosis just published on the copy of Ekene-1 and applies it by subsea depth.',
      do: async (d, shared) => {
        await openWestWindow(d, shared, { onCamera: true });
        await expectText(d, t(d, 'wd-ppfg-source'), /PPS demo: Ekene-1 \(offset, 0 ft away, by TVDSS\)/, 'source');
        await d.highlight(t(d, 'wd-ppfg-source'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'wdsseats',
      say: 'The casing seats follow on Ekene West-1\'s own trajectory: five shoes again, from one thousand five hundred and ninety five feet true vertical depth down to six thousand six hundred and fifty. To make the hand over count, the design is reviewed against this prognosis. The design now remembers which prognosis it was checked against, and what the seats were.',
      sub: 'The casing seats follow on Ekene West-1\'s own trajectory: five shoes again, from 1,595 ft true vertical depth down to 6,650 ft. To make the hand over count, the design is reviewed against this prognosis. The design now remembers which prognosis it was checked against, and what the seats were.',
      do: async (d) => {
        await expectText(d, t(d, 'mud-window-seats'), /shoe 1 at least TVD 1595 ft[\s\S]*shoe 5 at least TVD 6650 ft/, 'wds seats');
        await d.highlight(t(d, 'mud-window-seats'));
        await d.sleep(3500);
        await d.unhighlight();
        await d.click(t(d, 'wd-ppfg-record'));
        await expectText(d, t(d, 'wd-ppfg-reviewed'), /reviewed against the prognosis on PPS demo: Ekene-1/, 'reviewed');
        await d.highlight(t(d, 'wd-ppfg-reviewed'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'One prognosis, two apps', chapterSub: 'Next: when it changes',
      say: 'One prognosis, calibrated where the data allows, published once and read by the well plan. The reservoir pressure tests are still to come. Next: what happens downstream when they change the prognosis.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
