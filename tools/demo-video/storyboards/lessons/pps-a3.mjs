// Pore Pressure with Petrolord, Lesson A3: the normal compaction trend.
// The NCT view on a log axis, gamma ray shale picks in the normally pressured
// section, the fit, and what happens when the trend is picked inside the
// overpressure (the collapse the kit's episode note warns about).
import { expectText, setupStudio, units, readout, act, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

async function picks(d, { from, to, onCamera = true }) {
  const a = act(d, onCamera);
  await a.type(t(d, 'pp-shale-cutoff'), '60');
  await a.type(t(d, 'pp-shale-from'), from);
  await a.type(t(d, 'pp-shale-to'), to);
  await a.type(t(d, 'pp-shale-every'), '100');
  await a.click(t(d, 'pp-auto-pick'));
  await d.sleep(1000);
}

export default {
  id: 'lesson-pps-a3',
  ...ppsLessonMeta(3, 'A', 'The normal *compaction trend*', 'Shale picks above the overpressure, the fit, and the trend picked in the wrong place'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await units(d, { pressure: 'ppg', ref: 'md' });
  },
  steps: [
    { id: 'idea', chapter: 'Compaction', chapterSub: 'Why a slow sonic means pressure',
      say: 'Buried shale squeezes out its water and gets faster. If the water cannot escape, the shale stays slow, and the trapped water carries part of the overburden. That excess is the overpressure. So we need the sonic a shale would have if it had compacted normally: the trend.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-nct'));
        await d.sleep(2500);
        await d.highlight(t(d, 'pp-nct-chart')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'axis', chapter: 'The NCT view', chapterSub: 'Sonic against depth, log axis',
      say: 'The sonic is plotted against depth below the mudline, on a log axis, where an exponential compaction trend is a straight line. Shallow, the log is fast in the sands and slow in the shales; deeper than about four thousand feet the whole log turns slower.',
      do: async (d) => {
        await d.moveTo(t(d, 'pp-nct-logaxis')); await d.sleep(2000);
        await d.moveTo(t(d, 'pp-nct-chart'), { dy: 0.65 }); await d.sleep(3000);
      } },
    { id: 'picks', chapter: 'Shale picks', chapterSub: 'In the normally pressured section',
      say: 'Picks go in shales, in the normally pressured section. Ekene is normal down to about four thousand two hundred feet measured depth, about four thousand and thirty five below the mudline. One pick per hundred feet where the gamma ray reads sixty A. P. I. or more gives thirteen picks.',
      do: async (d) => {
        await picks(d, { from: '328', to: '4035' });
        await expectText(d, t(d, 'pp-fit-nct'), /Fit NCT \(13 picks\)/, 'picks');
        await d.highlight(t(d, 'pp-fit-nct')); await d.sleep(1500); await d.unhighlight();
      } },
    { id: 'fit', chapter: 'The fit', chapterSub: 'dt at the mudline and the decay constant',
      say: 'The fit returns the two numbers of the trend: a mudline transit time of one hundred and fifty six point five zero microseconds per foot, and a decay constant of eight point seven one three times ten to the minus five per foot. The dashed line runs on down the well: the normal sonic at every depth.',
      do: async (d) => {
        await d.click(t(d, 'pp-fit-nct'));
        await expectText(d, t(d, 'pp-nct-current'), /dt_ml 156\.50 us\/ft · c 8\.713e-5 1\/ft/, 'fit');
        await d.highlight(t(d, 'pp-nct-current')); await d.sleep(2500); await d.unhighlight();
        await d.highlight(t(d, 'pp-nct-chart')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'reads', chapter: 'What it gives', chapterSub: 'Eaton at the Ekene Sand',
      say: 'With the trend fitted, Eaton reads the Ekene Sand at twelve point six two pounds per gallon. Hold on to that number.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-prognosis')); await d.sleep(1500);
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.62/, 'good');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'wrong', chapter: 'Picked in the wrong place', chapterSub: 'Inside the overpressure',
      say: 'Now pick the trend inside the overpressure, from four thousand five hundred to six thousand five hundred feet below the mudline. Twenty picks, all in slow, overpressured shale. The fitted line bends over to follow them.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-nct')); await d.sleep(1200);
        await picks(d, { from: '4500', to: '6500' });
        await expectText(d, t(d, 'pp-fit-nct'), /Fit NCT \(20 picks\)/, 'wrong picks');
        await d.click(t(d, 'pp-fit-nct'));
        await d.sleep(1500);
        await d.highlight(t(d, 'pp-nct-chart')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'collapse', chapter: 'The collapse', chapterSub: 'The overpressure disappears',
      say: 'The trend now calls the slow shale normal, so the overpressure disappears: the Ekene Sand reads eight point four three, hydrostatic, and the studio warns that the pore pressure drops below hydrostatic over part of the well. Pick the trend where the section is normal, and only there.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-prognosis')); await d.sleep(1500);
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 8\.43/, 'collapse');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(2000); await d.unhighlight();
        await expectText(d, t(d, 'pp-note-underpressure'), /below hydrostatic/, 'warn');
        await d.highlight(t(d, 'pp-note-underpressure')); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
