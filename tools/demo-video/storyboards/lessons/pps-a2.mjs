// Pore Pressure with Petrolord, Lesson A2: overburden and hydrostatic.
// The seawater column and the density log integrated down the well, the
// pore fluid column, and why a hydrostatic EMW against the rotary table
// reads below the pore fluid density offshore.
import { expectText, setupStudio, pickWell, units, readout, dockTo, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-a2',
  ...ppsLessonMeta(2, 'A', 'Overburden *and hydrostatic*', 'The weight of the rock and the weight of the water, and how they read as mud weights'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await units(d, { pressure: 'ppg', ref: 'md' });
  },
  steps: [
    { id: 'obg', chapter: 'Overburden', chapterSub: 'Seawater, then the density log',
      say: 'The overburden is the weight of everything above a point. Offshore it starts with the seawater, at the density in the dock, eight point five five four pounds per gallon. Below the mudline the density log is integrated down the well, sample by sample.',
      do: async (d) => {
        await dockTo(d, 'pp-param-rhosw');
        await expectText(d, t(d, 'pp-param-rhosw'), /.*/, 'rhosw');
        await d.highlight(t(d, 'pp-param-rhosw')); await d.sleep(2500); await d.unhighlight();
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'gradient', chapter: 'It steepens with depth', chapterSub: 'Compacted rock is denser',
      say: 'As a mud weight it climbs: sixteen point five two pounds per gallon at one thousand nine hundred and sixty eight feet, where the twenty inch casing sits, seventeen point eight two at the Ekene Sand, and eighteen point five four at total depth. Rock compacts with depth, so each foot weighs more than the one above.',
      do: async (d) => {
        await readout(d, 1968, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 16\.52/, 'obg 1968');
        await d.sleep(1200);
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 17\.82/, 'obg 5118');
        await d.sleep(1200);
        await readout(d, 7382, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 18\.54/, 'obg td');
        await d.highlight(t(d, 'pp-readout-obg')); await d.sleep(1500); await d.unhighlight();
      } },
    { id: 'ph', chapter: 'Hydrostatic', chapterSub: 'The pore fluid column',
      say: 'Hydrostatic is the pressure of a column of pore water from the sea surface: the pore fluid density in the dock, eight point five nine six pounds per gallon, a brine of about one point zero three grams per cc.',
      do: async (d) => {
        await dockTo(d, 'pp-param-rhofl');
        await d.highlight(t(d, 'pp-param-rhofl')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'emw', chapter: 'Why it reads lower', chapterSub: 'Against the rotary table',
      say: 'Yet at the Ekene Sand hydrostatic reads eight point four five, below the brine\'s own eight point five nine six. The mud weight is quoted against the rotary table, and the top eighty two feet of that column are air. Offshore, a hydrostatic mud weight always reads a little light, and less so with depth.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-ph'), /Ph 8\.45/, 'ph');
        await d.highlight(t(d, 'pp-readout-ph')); await d.sleep(3000); await d.unhighlight();
        await d.moveTo(t(d, 'pp-readout-unit')); await d.sleep(2000);
      } },
    { id: 'between', chapter: 'Between the two', chapterSub: 'Where the pore pressure lives',
      say: 'Every pore pressure sits between these two lines: rarely below hydrostatic outside a depleted reservoir, and never above the overburden, or the rock would lift. Next lesson: the normal compaction trend that tells us where between them.',
      do: async (d) => {
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
