// Pore Pressure with Petrolord, Lesson B5: which rock is shale? Ekene-1 itself
// (read only: nothing is saved or published on it) carries the Petrophysics
// Studio VSH and the loaded gamma ray. The NCT view picks on either; the VSH
// leaves few shallow shales over its cutoff, the GR gives more; picks in sand,
// and the cutoff the pressures use.
import { expectText, setupStudio, pickWell, units, act, t, ppsLessonMeta } from '../pps-common.mjs';

async function pick(d, cut, { from = '328', to = '4035', every = '100' } = {}) {
  const a = act(d, true);
  await a.type(t(d, 'pp-shale-cutoff'), cut);
  await a.type(t(d, 'pp-shale-from'), from);
  await a.type(t(d, 'pp-shale-to'), to);
  await a.type(t(d, 'pp-shale-every'), every);
  await a.click(t(d, 'pp-auto-pick'));
  await d.sleep(1200);
}

export default {
  id: 'lesson-pps-b5',
  ...ppsLessonMeta(5, 'B', 'Which rock *is shale?*', 'Shale volume or gamma ray, the cutoff, and picks that land in sand'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: 'Ekene-1' });
    await units(d, { pressure: 'ppg', ref: 'md' });
  },
  steps: [
    { id: 'why', chapter: 'Shale only', chapterSub: 'Both the trend and the pressures',
      say: 'Everything in this method is read in shale: the trend picks, and the pressures themselves. So the first decision is which curve tells shale from sand. This is Ekene-1 itself, opened to look, with nothing saved. It carries two candidates.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-nct')); await d.sleep(2000);
        await d.highlight(t(d, 'pp-nct-shale')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'vsh', chapter: 'Shale volume', chapterSub: 'From Petrophysics Studio',
      say: 'First, the shale volume published from Petrophysics Studio. At a cutoff of zero point six, one pick per hundred feet above the ramp finds only four: the interpretation\'s shale lines put few of the shallow shales over the cutoff.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-shale-indicator'), /VSH/, 'vsh');
        await d.highlight(t(d, 'pp-shale-indicator')); await d.sleep(1500); await d.unhighlight();
        await pick(d, '0.6');
        await expectText(d, t(d, 'pp-fit-nct'), /Fit NCT \(4 picks\)/, 'vsh picks');
        await d.highlight(t(d, 'pp-fit-nct')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'gr', chapter: 'Gamma ray', chapterSub: 'The log as loaded',
      say: 'Switch the indicator to the gamma ray as loaded. The cutoff resets to the gamma ray\'s own default, halfway between its sand and shale lines. At sixty A. P. I. the same window gives thirteen picks.',
      do: async (d) => {
        await act(d, true).select(t(d, 'pp-shale-indicator'), 'gr');
        await d.sleep(1500);
        await d.moveTo(t(d, 'pp-shale-cutoff')); await d.sleep(1500);
        await pick(d, '60');
        await expectText(d, t(d, 'pp-fit-nct'), /Fit NCT \(13 picks\)/, 'gr picks');
        await d.highlight(t(d, 'pp-fit-nct')); await d.sleep(1500); await d.unhighlight();
      } },
    { id: 'sand', chapter: 'Picks in sand', chapterSub: 'Said when the cutoff moves',
      say: 'Raise the cutoff to eighty two A. P. I., near the shale line, and the studio counts the picks that now sit below it, in sand, by its own measure: nine of the thirteen. That is the warning to pick again or keep the lower cutoff for the trend.',
      do: async (d) => {
        await act(d, true).type(t(d, 'pp-shale-cutoff'), '82');
        await d.sleep(1200);
        await expectText(d, t(d, 'pp-picks-in-sand'), /9 picks in sand/, 'in sand');
        await d.highlight(t(d, 'pp-picks-in-sand')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'pressures', chapter: 'The pressure cutoff', chapterSub: 'Near the shale line',
      say: 'The cutoff in this box is also the one the pressures use. For the trend a looser cutoff gives enough picks; for the pressures, a cutoff near the shale line keeps shaly sands out. The lessons pick the trend at sixty and read the pressures at eighty two.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-prognosis')); await d.sleep(1500);
        await expectText(d, t(d, 'pp-note-pressures'), /GR at or above 82 API/, 'pressures');
        await d.highlight(t(d, 'pp-note-pressures')); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
