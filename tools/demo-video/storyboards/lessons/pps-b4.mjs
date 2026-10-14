// Pore Pressure with Petrolord, Lesson B4: Eaton in the shales. Eaton on
// every sample (the sands put spikes far below hydrostatic, and the studio
// warns), pressures from shale samples with a cutoff near the shale line,
// Eaton's exponent, and the interpreted line.
import { expectText, setupStudio, units, fitNct, readout, setParams, dockTo, act, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-b4',
  ...ppsLessonMeta(4, 'B', 'Eaton *in the shales*', 'Every sample against shale samples, Eaton\'s exponent and the interpreted line'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await units(d, { pressure: 'ppg', ref: 'md' });
    await fitNct(d, { pressureCut: '82' });
    // start from every sample and no line, so the lesson turns them on
    await t(d, 'pp-shale-pressures').uncheck();
    await setParams(d, { 'pp-line-window': '' });
  },
  steps: [
    { id: 'eaton', chapter: 'Eaton', chapterSub: 'The ratio of normal to measured sonic',
      say: 'Eaton\'s relation takes the ratio of the normal sonic to the measured sonic, raised to an exponent, and turns it into a pore pressure between hydrostatic and the overburden. The published exponent for sonic is three. Here it runs on every sample of the log.',
      do: async (d) => {
        await dockTo(d, 'pp-param-eatonn');
        await d.highlight(t(d, 'pp-param-eatonn')); await d.sleep(2500); await d.unhighlight();
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'every', chapter: 'Every sample', chapterSub: 'Sands read as pressure',
      say: 'Every sample includes the sands. A sand is fast for reasons that have nothing to do with compaction, so Eaton reads it as a pressure far below hydrostatic: at the Ekene Sand, minus six point four six pounds per gallon, which cannot be. The studio says so in amber.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP -6\.46/, 'negative');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(2000); await d.unhighlight();
        await d.highlight(t(d, 'pp-note-underpressure')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'shale', chapter: 'Shale samples', chapterSub: 'Read the method where it means something',
      say: 'Tick pressures from shale samples. The method is now read only where the gamma ray is at or above the cutoff in the NCT view, eighty two A. P. I. here, near the shale line, and carried across the sands by depth. Five thousand and thirty six shale samples; the Ekene Sand now reads eleven point six two.',
      do: async (d) => {
        await dockTo(d, 'pp-shale-pressures');
        await d.click(t(d, 'pp-shale-pressures'));
        await d.click(t(d, 'pp-apply-params'));
        await d.sleep(1500);
        await expectText(d, t(d, 'pp-note-pressures'), /Pore pressure from 5036 shale samples \(GR at or above 82 API\)/, 'shale');
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 11\.62/, 'shale pp');
        await d.highlight(t(d, 'pp-readout-pp')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'n', chapter: 'The exponent', chapterSub: 'How hard the ratio bites',
      say: 'The exponent sets how hard the sonic ratio bites. At two and a half the Ekene Sand reads eleven point one eight; at three it read eleven point six two. Measured pressures, not taste, should set it: that is lesson C7.',
      do: async (d) => {
        await dockTo(d, 'pp-param-eatonn');
        await setParams(d, { eatonn: '2.5' }, { onCamera: true });
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 11\.18/, 'n2.5');
        await d.sleep(1500);
        await setParams(d, { eatonn: '3' }, { onCamera: true });
      } },
    { id: 'line', chapter: 'The interpreted line', chapterSub: 'Through the shale points',
      say: 'Last, the interpreted line. With a window of three hundred feet, the pore pressure becomes the median of the shale pressures around each depth, and the shale points stay on the chart, pale, so you can see what the line was drawn through. One odd shale no longer moves the mud weight.',
      do: async (d) => {
        await dockTo(d, 'pp-line-window');
        await setParams(d, { 'pp-line-window': '300' }, { onCamera: true });
        await expectText(d, t(d, 'pp-note-pressures'), /interpreted line through them: the median over 300 ft/, 'line');
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
