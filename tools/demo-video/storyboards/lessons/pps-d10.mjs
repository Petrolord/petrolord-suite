// Pore Pressure with Petrolord, Lesson D10: the drilling window and casing
// seats. Trip and kick margins, the bottom-up seat selection, the window per
// section, and a shallowest seat set by the user.
import { expectText, setupStudio, demoOnePrognosis, importKitFile, setParams, dockTo, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-d10',
  ...ppsLessonMeta(10, 'D', 'The drilling window *and casing seats*', 'Trip and kick margins, seats from the bottom up, and the window per section'),
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
    { id: 'window', chapter: 'The drilling window', chapterSub: 'Between pore and fracture pressure',
      say: 'The mud must stay above the pore pressure and below the fracture pressure: the green band. Below the conductor section, its narrowest point on the calibrated prognosis is two point one one pounds per gallon, at seven thousand two hundred and thirty feet.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-drilling-window'), /Narrowest drilling window 2\.11 ppg[\s\S]*at 7230 ft MD/, 'window');
        await d.highlight(t(d, 'pp-drilling-window')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'margins', chapter: 'Margins', chapterSub: 'Trip and kick',
      say: 'Two margins turn the window into a design. The trip margin goes on top of the pore pressure, so pulling the pipe does not swab the well in: the dashed purple line. The kick margin comes off the fracture pressure, so the shoe survives shutting in a kick: the dotted blue line. Half a pound each by default.',
      do: async (d) => {
        await dockTo(d, 'pp-param-trip');
        await d.highlight(t(d, 'pp-param-trip')); await d.sleep(1500); await d.unhighlight();
        await d.highlight(t(d, 'pp-param-kick')); await d.sleep(1500); await d.unhighlight();
        await d.highlight(t(d, 'pp-prognosis-chart')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'seats', chapter: 'Seats from the bottom up', chapterSub: 'Applied Drilling Engineering, chapter seven',
      say: 'The seats come from the bottom up. The mud needed at total depth sets how high that open hole can reach before the design fracture line falls below it; there goes a shoe, and the mud needed there sets the next one up. Here: two shoes, at least four thousand one hundred and seven and five thousand two hundred and sixty nine feet.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-casing-seats'), /shoe at least 4107 ft MD, then 12\.53 ppg below; shoe at least 5269 ft MD, then 13\.97 ppg below/, 'seats');
        await d.highlight(t(d, 'pp-casing-seats')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'tight', chapter: 'Tighter margins', chapterSub: 'Point three each',
      say: 'Margins are a policy, and they move the seats. At zero point three each, the shoes move to three thousand three hundred and forty seven and four thousand seven hundred and eighty one feet. Back to half a pound.',
      do: async (d) => {
        await setParams(d, { trip: '0.3', kick: '0.3' }, { onCamera: true });
        await expectText(d, t(d, 'pp-casing-seats'), /shoe at least 3347 ft MD[\s\S]*shoe at least 4781 ft MD/, 'tight');
        await d.highlight(t(d, 'pp-casing-seats')); await d.sleep(3000); await d.unhighlight();
        await setParams(d, { trip: '0.5', kick: '0.5' }, { onCamera: true });
      } },
    { id: 'min', chapter: 'A shallowest seat', chapterSub: 'Your minimum',
      say: 'A regulator or a shallow aquifer may set a minimum for the first string. Shallowest seat at least four thousand five hundred feet below the mudline moves the first shoe down to it, and the line says it is your minimum.',
      do: async (d) => {
        await setParams(d, { minseat: '4500' }, { onCamera: true });
        await expectText(d, t(d, 'pp-casing-seats'), /\(your minimum\)/, 'min');
        await d.highlight(t(d, 'pp-casing-seats')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'sections', chapter: 'Window per section', chapterSub: 'What each open hole has to work with',
      say: 'Under the seats, the window per section gives each open hole its mud weight and its margin to the design fracture line. These are the numbers the well plan carries forward.',
      do: async (d) => {
        await d.highlight(t(d, 'pp-casing-sections')); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
