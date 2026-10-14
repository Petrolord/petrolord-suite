// Pore Pressure with Petrolord, Lesson C9: mud weights as evidence. The kit's
// mud weights held over intervals, the 9.8 ppg attempt that took an influx at
// 1,418 m (4,652 ft), and the line that checks them against the prognosis.
import { expectText, setupStudio, demoOnePrognosis, importKitFile, dockTo, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-c9',
  ...ppsLessonMeta(9, 'C', 'Mud weights *as evidence*', 'What held, what took an influx, and what that says about the prognosis'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await demoOnePrognosis(d);
    await importKitFile(d, 'ekene-mdt-pressures.csv');
    await t(d, 'pp-fit-calibration').click();
    await t(d, 'pp-status').filter({ hasText: 'Fitted n' }).waitFor({ timeout: 60000 });
    await importKitFile(d, 'ekene-lot-fit.csv');
    await t(d, 'pp-fit-lot').click(); await d.sleep(1500);
  },
  steps: [
    { id: 'why', chapter: 'The drilling record', chapterSub: 'Mud weights are pressure measurements too',
      say: 'Every mud weight a well was drilled with is a quiet pressure measurement. If it held, with no flow, the pore pressure was below it. If it took an influx, the pore pressure was above it. Ekene-1\'s drilling record is in the kit.',
      do: async (d) => { await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(3500); await d.unhighlight(); } },
    { id: 'import', chapter: 'Intervals and outcomes', chapterSub: 'Through the import door',
      say: 'Each row is a mud weight held over an interval, from one depth to another, with an outcome. The door reads the from and to columns as an interval, and the outcome column for anything that went wrong: one row took an influx at one thousand four hundred and eighteen metres.',
      do: async (d) => {
        await dockTo(d, 'pp-cal-import-open');
        await importKitFile(d, 'ekene-mud-weights.csv', { onCamera: true, hold: 4000 });
      } },
    { id: 'chart', chapter: 'On the chart', chapterSub: 'A step line and a red triangle',
      say: 'The held weights draw as a step line, one tread per interval. The failed attempt, nine point eight pounds per gallon, is the red triangle at four thousand six hundred and fifty two feet.',
      do: async (d) => { await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(4500); await d.unhighlight(); } },
    { id: 'kick', chapter: 'The influx', chapterSub: 'Does the prognosis explain it?',
      say: 'The evidence line checks it. At the influx depth the prognosis puts the pore pressure at eleven point zero three, above the nine point eight that failed. The prognosis explains the kick.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-mw-evidence'), /9\.80 ppg took an influx at 4652 ft MD where the prognosis puts the pore pressure at 11\.03 ppg: consistent/, 'kick');
        await d.highlight(t(d, 'pp-mw-evidence')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'held', chapter: 'The weights that held', chapterSub: 'Where the prognosis reads high',
      say: 'It also checks the five that held, and two sit below the prognosis: nine point two held to four thousand two hundred and sixty five feet, where the prognosis already reads ten point one four. The well was drilled there without trouble, so near the top of the ramp this prognosis is conservative. That is where a pore pressure specialist would look again.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-mw-evidence'), /Mud weights that held: 5; 2 sit below the prognosis pore pressure \(9\.20 ppg held to 4265 ft MD where the prognosis reaches 10\.14 ppg/, 'held');
        await d.highlight(t(d, 'pp-mw-evidence')); await d.sleep(5000); await d.unhighlight();
      } },
  ],
};
