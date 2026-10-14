// Pore Pressure with Petrolord, Lesson B6: a second well. Ekene-9, deviated
// and logged without density, read with the trend fitted on the copy of
// Ekene-1: TVD through its survey, Gardner for the overburden, and the trend
// carried by depth below the mudline. Read only: nothing is saved or
// published on Ekene-9.
import { expectText, setupStudio, pickWell, units, readout, demoOnePrognosis, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-b6',
  ...ppsLessonMeta(6, 'B', 'A second well: *Ekene-9*', 'A deviated well with no density log, read with the trend from Ekene-1'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await demoOnePrognosis(d);
  },
  steps: [
    { id: 'from', chapter: 'The trend travels', chapterSub: 'A basin property',
      say: 'The trend on the copy of Ekene-1 is fitted and the prognosis drawn. Read against true vertical depth, at five thousand feet the overburden is seventeen point seven seven pounds per gallon and the pore pressure twelve point six six. A normal compaction trend belongs to the basin more than to one well, so it can be carried to a neighbour by depth below the mudline. Ekene-9 is a deviated producer from the Ekene Alpha platform, logged without a density tool.',
      do: async (d) => {
        await units(d, { pressure: null, ref: 'tvdrkb', onCamera: true });
        await readout(d, 5000, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 17\.77/, 'obg e1');
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.66/, 'pp e1');
        await d.highlight(t(d, 'pp-readout-obg')); await d.sleep(1500); await d.unhighlight();
        await d.moveTo(t(d, 'pp-well-row').filter({ hasText: 'Ekene-9' }).first()); await d.sleep(1500);
      } },
    { id: 'open', chapter: 'Ekene-9', chapterSub: 'What the studio says',
      say: 'Opening Ekene-9 keeps the trend and the method. The notes say what changed: depths are true vertical, through the deviation survey; there is no density log, so the overburden uses Gardner\'s relation from the sonic all the way down; and the trend was fitted on another well.',
      do: async (d) => {
        await pickWell(d, 'Ekene-9', { onCamera: true });
        await units(d, { pressure: 'ppg', ref: 'tvdrkb' });
        await expectText(d, t(d, 'pp-note-density'), /No density log: the overburden uses Gardner/, 'gardner');
        await d.highlight(t(d, 'pp-notes')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'tvd', chapter: 'True vertical depth', chapterSub: 'Pressure follows TVD',
      say: 'Pressure follows true vertical depth, so the readout is switched to T. V. D. below the rotary table. At five thousand feet, Gardner\'s overburden reads seventeen point five nine pounds per gallon on Ekene-9, against seventeen point seven seven from the density log on Ekene-1.',
      do: async (d) => {
        await readout(d, 5000, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 17\.59/, 'obg e9');
        await d.highlight(t(d, 'pp-readout-obg')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'pp', chapter: 'The pore pressure', chapterSub: 'Same trend, another well',
      say: 'And the pore pressure at the same depth reads twelve point five four, from Ekene-9\'s own sonic against Ekene-1\'s trend. The two wells agree closely. A second well that agrees is the best check a prognosis can have; one that disagrees tells you where to look.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.54/, 'pp e9');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(3000); await d.unhighlight();
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(3000); await d.unhighlight();
      } },
  ],
};
