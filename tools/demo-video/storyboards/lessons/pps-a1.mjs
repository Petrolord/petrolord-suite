// Pore Pressure with Petrolord, Lesson A1: the workspace and the water column.
// The registry wells, the working copy of Ekene-1, the water column taken from
// the well's datum, the four depth frames and the pressure units.
import { expectText, setupStudio, pickWell, readout, dockTo, act, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-a1',
  ...ppsLessonMeta(1, 'A', 'The workspace and *the water column*', 'Registry wells, the datum, four depth frames and the pressure units'),
  async setup(d, shared) { await setupStudio(d, shared); },
  steps: [
    { id: 'tour', chapter: 'Pore Pressure Studio', chapterSub: 'The workspace',
      say: 'Pore Pressure Studio has three parts. On the left, the wells in the shared registry, and any seismic velocity trends. In the middle, three views of the same prognosis: the pressures, the normal compaction trend and a crossplot. On the right, the parameters dock.',
      do: async (d) => {
        await d.moveTo(t(d, 'pp-well-row').first()); await d.sleep(2200);
        for (const v of ['prognosis', 'nct', 'crossplot']) { await d.moveTo(t(d, `pp-view-${v}`)); await d.sleep(900); }
        await d.moveTo(t(d, 'pp-param-wd')); await d.sleep(1500);
      } },
    { id: 'well', chapter: 'A well', chapterSub: 'The working copy of Ekene-1',
      say: 'The lessons use a working copy of Ekene-1, the Ekene discovery well, loaded from the kit\'s LAS file through Well Data Manager. Selecting it reads the sonic and the density: fourteen thousand three hundred and seventy samples, every half foot.',
      do: async (d) => {
        await pickWell(d, WELL, { onCamera: true });
        await expectText(d, t(d, 'pp-status'), /Loaded 14370 samples/, 'samples');
        await d.highlight(t(d, 'pp-status')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'water', chapter: 'The water column', chapterSub: 'From the well\'s datum',
      say: 'Offshore, every pressure starts with the water. The studio takes it from the well\'s datum in the registry, and says so: one hundred and fifteen feet of water, mudline one hundred and ninety seven feet below the rotary table. The two values sit at the top of the dock, where you can type your own.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-note-water'), /115 ft of water, mudline 197 ft MD/, 'water');
        await d.highlight(t(d, 'pp-note-water')); await d.sleep(2500); await d.unhighlight();
        await dockTo(d, 'pp-param-wd');
        await d.highlight(t(d, 'pp-param-wd')); await d.sleep(1200); await d.unhighlight();
        await d.highlight(t(d, 'pp-param-mudline')); await d.sleep(1200); await d.unhighlight();
      } },
    { id: 'frames', chapter: 'Four depth frames', chapterSub: 'One sample, four names',
      say: 'The readout sits at the bottom of the well. The same sample has four depths: seven thousand one hundred and eighty four point six feet below the mudline, seven thousand three hundred and eighty one point five true vertical below the rotary table, seven thousand two hundred and ninety nine point five subsea, and on this vertical well the same again in measured depth.',
      do: async (d) => {
        const a = act(d, true);
        await expectText(d, t(d, 'pp-readout-ref'), /ft bml/, 'bml');
        await d.highlight(t(d, 'pp-readout-depth')); await d.sleep(1800); await d.unhighlight();
        for (const r of ['tvdrkb', 'tvdss', 'md']) { await a.select(t(d, 'pp-depth-ref'), r); await d.sleep(1800); }
        await expectText(d, t(d, 'pp-readout-ref'), /ft MD/, 'md');
      } },
    { id: 'units', chapter: 'Pressure units', chapterSub: 'psi, or a mud weight',
      say: 'Pressures read in p. s. i. by default. At five thousand one hundred and eighteen feet the overburden is four thousand seven hundred and forty two p. s. i. and hydrostatic two thousand two hundred and forty eight. A driller thinks in mud weight, so switch to pounds per gallon: seventeen point eight two and eight point four five, equivalent mud weights against the rotary table.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 4742/, 'obg psi');
        await expectText(d, t(d, 'pp-readout-ph'), /Ph 2248/, 'ph psi');
        await d.sleep(1500);
        await act(d, true).select(t(d, 'pp-unit-pressure'), 'ppg');
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 17\.82/, 'obg ppg');
        await expectText(d, t(d, 'pp-readout-ph'), /Ph 8\.45/, 'ph ppg');
        await d.highlight(t(d, 'pp-readout-obg')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'si', chapter: 'Stored in SI', chapterSub: 'The display is yours',
      say: 'The selectors change the display only. Everything stored, computed and published stays in pascals and metres, as the status bar says, so a colleague in metres and megapascals reads the same prognosis. Next lesson: where the overburden and hydrostatic come from.',
      do: async (d) => {
        await d.moveTo(d.page.getByText(/SI internal/).first()); await d.sleep(3500);
      } },
  ],
};
