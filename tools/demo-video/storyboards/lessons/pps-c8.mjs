// Pore Pressure with Petrolord, Lesson C8: the fracture gradient. Eaton's
// Poisson's ratio form, the kit's shoe tests, calibrating to the leak-off
// tests (a FIT is a lower bound), and Matthews and Kelly and Daines
// calibrated to the same tests.
import { expectText, setupStudio, demoOnePrognosis, importKitFile, readout, setParams, dockTo, act, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-c8',
  ...ppsLessonMeta(8, 'C', 'The fracture *gradient*', 'Poisson\'s ratio, the shoe tests, and three methods calibrated to the same leak-offs'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await demoOnePrognosis(d);
    await importKitFile(d, 'ekene-mdt-pressures.csv');
    await t(d, 'pp-fit-calibration').click();
    await t(d, 'pp-status').filter({ hasText: 'Fitted n' }).waitFor({ timeout: 60000 });
    await d.sleep(1500);
  },
  steps: [
    { id: 'eaton', chapter: 'Fracture pressure', chapterSub: 'Eaton\'s form',
      say: 'The fracture pressure is the pore pressure plus a fraction of the effective stress. In Eaton\'s form the fraction comes from Poisson\'s ratio, zero point four by default. At four thousand seven hundred and fifty seven feet, the thirteen and three eighths shoe, that gives fifteen point five seven pounds per gallon.',
      do: async (d) => {
        await dockTo(d, 'pp-param-nu');
        await d.highlight(t(d, 'pp-param-nu')); await d.sleep(2000); await d.unhighlight();
        await readout(d, 4757, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-fg'), /FG 15\.57/, 'fg default');
        await d.highlight(t(d, 'pp-readout-fg')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'tests', chapter: 'Shoe tests', chapterSub: 'LOT and FIT',
      say: 'The kit\'s shoe tests: a formation integrity test at the twenty inch shoe, and leak-off tests at the thirteen and three eighths and the nine and five eighths shoes. A leak-off test pumps until the rock takes fluid; an integrity test stops at a set pressure, so it only says the rock held at least that much.',
      do: async (d) => {
        await dockTo(d, 'pp-cal-import-open');
        await importKitFile(d, 'ekene-lot-fit.csv', { onCamera: true, hold: 3000 });
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'calib', chapter: 'Calibrate to the leak-offs', chapterSub: 'The median over the tests',
      say: 'The diamonds sit below the fracture line, and the notes put the misfit at two point four eight megapascals. Calibrate F. G. to L. O. T. takes the median over the two leak-off tests and leaves the integrity test out: Poisson\'s ratio becomes zero point two nine six, and the misfit at the tests falls to zero point five two.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-note-lot'), /RMS 2\.48 MPa/, 'lot misfit');
        await d.highlight(t(d, 'pp-note-lot')); await d.sleep(2000); await d.unhighlight();
        await d.click(t(d, 'pp-fit-lot'));
        await expectText(d, t(d, 'pp-status'), /Fracture gradient calibrated to 2 tests: nu 0\.296 \(K 0\.421\), RMS 0\.52 MPa at the tests/, 'calibrated');
        await d.highlight(t(d, 'pp-status')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'fit', chapter: 'The integrity test', chapterSub: 'A lower bound, honoured',
      say: 'At the twenty inch shoe, one thousand nine hundred and sixty eight feet, the calibrated line reads eleven point seven two, to the right of the integrity test\'s diamond. A lower bound, honoured.',
      do: async (d) => {
        await readout(d, 1968, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-fg'), /FG 11\.72/, 'fg fit');
        await d.highlight(t(d, 'pp-readout-fg')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'methods', chapter: 'Other methods', chapterSub: 'Matthews and Kelly, Daines',
      say: 'Matthews and Kelly write the same fraction as a matrix stress coefficient, k zero; Daines adds a tectonic term to Eaton. Calibrated to the same two tests, Matthews and Kelly gives k zero of zero point four two one, and Daines a tectonic term of zero: the same line. With a constant coefficient they are one identity; they part ways only when the coefficient changes with depth.',
      do: async (d) => {
        await dockTo(d, 'pp-param-fracmethod');
        await setParams(d, { fracmethod: 'matthews-kelly' }, { onCamera: true });
        await d.click(t(d, 'pp-fit-lot'));
        await expectText(d, t(d, 'pp-status'), /k0 0\.421/, 'mk');
        await d.sleep(1500);
        await setParams(d, { fracmethod: 'daines' }, { onCamera: true });
        await d.click(t(d, 'pp-fit-lot'));
        await expectText(d, t(d, 'pp-status'), /beta 0\.000/, 'daines');
        await d.sleep(1500);
        await setParams(d, { fracmethod: 'eaton' }, { onCamera: true });
        await d.click(t(d, 'pp-fit-lot'));
        await d.sleep(1000);
      } },
  ],
};
