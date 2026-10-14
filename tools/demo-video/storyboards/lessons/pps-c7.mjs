// Pore Pressure with Petrolord, Lesson C7: pressure tests. The kit's MDT
// pretests through the import door (rows for the open well, psia read as
// absolute and stored as gauge), the misfit against the prognosis from the
// logs, and Fit n on the prognosis as shown.
import { expectText, setupStudio, demoOnePrognosis, importKitFile, readout, dockTo, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-c7',
  ...ppsLessonMeta(7, 'C', 'Pressure *tests*', 'MDT pretests through the import door, the misfit, and fitting Eaton\'s exponent'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await demoOnePrognosis(d);
  },
  steps: [
    { id: 'why', chapter: 'Measured pressure', chapterSub: 'The only direct reading',
      say: 'Everything so far is inferred from the sonic. A formation pressure test is the one direct reading: the tool seals against the borehole wall in a permeable bed and measures the pore pressure. Ekene-1 has eight MDT pretests across the Ekene Sand.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.62/, 'before');
        await d.sleep(2500);
      } },
    { id: 'door', chapter: 'The import door', chapterSub: 'Columns, units and the well',
      say: 'The file holds pretests from two wells. The door reads the columns from the header: measured depth in metres, pressure in p. s. i. a., and the test type, which it reads as R. F. T. or M. D. T. pressure. Rows for well is set to Ekene-1, the well this copy was made from, so the four Ekene-3 rows are skipped and listed with the reason.',
      do: async (d) => {
        await dockTo(d, 'pp-cal-import-open');
        await d.click(t(d, 'pp-cal-import-open'));
        await t(d, 'pp-cal-import-file').setInputFiles((await import('../pps-common.mjs')).PRESSURE('ekene-mdt-pressures.csv'));
        await t(d, 'pp-cal-import-preview').waitFor();
        await d.sleep(800);
        await d.highlight(t(d, 'pp-cal-import')); await d.sleep(3000); await d.unhighlight();
        await d.highlight(t(d, 'pp-cal-well')); await d.sleep(2000); await d.unhighlight();
        await expectText(d, t(d, 'pp-cal-import-preview'), /8 /, 'preview');
        await d.highlight(t(d, 'pp-cal-import-preview')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'add', chapter: 'Gauge pressure', chapterSub: 'Absolute in, gauge stored',
      say: 'The pretests read absolute pressure; the prognosis is gauge, so the atmosphere comes off on the way in. Add, and the eight points land on the chart, to the left of the line.',
      do: async (d) => {
        await d.click(t(d, 'pp-cal-import-add'));
        await expectText(d, t(d, 'pp-status'), /Imported 8 calibration points from ekene-mdt-pressures\.csv; 4 lines not read/, 'added');
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'misfit', chapter: 'The misfit', chapterSub: 'What the logs alone got wrong',
      say: 'The notes give the misfit: eight points, a root mean square of one point one nine megapascals. They add a caution worth reading: below the deepest pretest, the prognosis is extrapolated.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-note-calibration'), /Calibration: 8 points, PP misfit RMS 1\.19 MPa[\s\S]*extrapolated beyond the deepest point/, 'misfit');
        await d.highlight(t(d, 'pp-note-calibration')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'fit', chapter: 'Fit n', chapterSub: 'On the prognosis as shown',
      say: 'Fit n searches Eaton\'s exponent on the prognosis exactly as it is drawn, through the shale samples and the interpreted line, because the pretests sit in a sand where the shown pressure is carried from the shales. It returns two point four zero three, and the misfit drops to zero point zero one megapascals.',
      do: async (d) => {
        await d.click(t(d, 'pp-fit-calibration'));
        await expectText(d, t(d, 'pp-status'), /Fitted n 2\.403 on the shown prognosis to 8 measured pressures: misfit RMS 1\.19 MPa before, 0\.01 MPa after/, 'fit');
        await d.highlight(t(d, 'pp-status')); await d.sleep(3000); await d.unhighlight();
        await dockTo(d, 'pp-param-eatonn');
        await d.highlight(t(d, 'pp-param-eatonn')); await d.sleep(1500); await d.unhighlight();
      } },
    { id: 'after', chapter: 'Calibrated', chapterSub: 'The Ekene Sand at its measured pressure',
      say: 'The Ekene Sand now reads eleven point nine seven pounds per gallon, through the pretests. One exponent for the whole well: the calibration is only as wide as the tests, which is why the notes keep saying where the prognosis runs past them.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 11\.97/, 'after');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
