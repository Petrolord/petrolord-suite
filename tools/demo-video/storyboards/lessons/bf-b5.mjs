// Basin Modelling with Petrolord, Lesson B5: correcting bottom-hole temperatures.
import { login, expectText, openBf, enterExpert, openModel, simulate, importCalibration, deleteModels, seedModel, t, tab, asset, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson B5: Ekene-1';
export default {
  id: 'lesson-bf-b5',
  ...bfLessonMeta(5, 'B', 'Correcting *bottom-hole temperatures*', 'Depths below KB, raw log temperatures, Horner, AAPG and Harrison, and the DST'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await seedModel(shared, 'ek1-calibrated', NAME, { calibration_data: { ro: [], temp: [] } });
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'file', chapter: 'The temperature file', chapterSub: 'Three logging runs and a DST',
      say: 'Ekene-1 was logged three times: at the thirteen and three eighths inch casing point, at the nine and five eighths inch, and at total depth. Each run recorded the bottom-hole temperature on three passes, with the hours since the mud stopped circulating. There is also a drill stem test in the Ekene Sand.',
      do: async (d) => {
        await tab(d, 'import', { onCamera: true });
        await d.click(t(d, 'bf-import-tab-calibration'));
        await t(d, 'bf-import-input-calibration').setInputFiles(asset('ekene-1-temperatures.csv'));
        await t(d, 'bf-import-preview-calibration').waitFor();
        await d.highlight(t(d, 'bf-import-read-units')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'datum', chapter: 'Depths below KB', chapterSub: 'Moved to the model surface',
      say: 'Well depths are measured from the rig floor, but this model starts at the seabed, a hundred and ninety seven feet below it. Read below KB, the import moves every point up by that, so a temperature lands on the rock it was measured in.',
      sub: 'Well depths are measured from the rig floor, but this model starts at the seabed, 197 ft below it. Read below KB, the import moves every point up by that, so a temperature lands on the rock it was measured in.',
      do: async (d) => {
        await d.select(t(d, 'bf-import-cal-datum'), 'kb');
        await expectText(d, 'bf-import-cal-shift', /197 ft below KB/, 'shift');
        await d.highlight(t(d, 'bf-import-cal-shift')); await d.sleep(3500); await d.unhighlight();
        await d.click(t(d, 'bf-import-apply-calibration'));
        await d.sleep(1000);
      } },
    { id: 'raw', chapter: 'Raw BHTs read cool', chapterSub: 'The mud chilled the hole',
      say: 'On the Calibration tab the raw values sit well left of the model: circulating mud cooled the borehole wall, and each later pass reads warmer as it recovers. Taken as measured, they would pull the heat flow far too low.',
      do: async (d) => {
        await tab(d, 'calibration', { onCamera: true });
        await d.sleep(3500);
      } },
    { id: 'horner', chapter: 'Horner', chapterSub: 'Extrapolate each run',
      say: 'Horner plots each run against the log of circulation plus shut-in time over shut-in time, and extrapolates to infinite shut-in. With four hours of circulation: one hundred and seventy two point six degrees at the first casing point, one hundred and ninety six point one at the second, two hundred and twenty six point three at total depth. The DST is a formation temperature already, and is never corrected.',
      sub: 'Horner plots each run against the log of circulation plus shut-in time over shut-in time, and extrapolates to infinite shut-in. With four hours of circulation: 172.6 °F at the first casing point, 196.1 at the second, 226.3 at total depth. The DST is a formation temperature already, and is never corrected.',
      do: async (d) => {
        await t(d, 'bf-cal-bht').scrollIntoViewIfNeeded();
        await d.select(t(d, 'bf-cal-bht-method'), 'horner');
        await d.type(t(d, 'bf-cal-bht-circ'), '4');
        await expectText(d, 'bf-cal-bht-table', /172\.6[\s\S]*179\.7 \(DST\)[\s\S]*196\.1[\s\S]*226\.3/, 'horner');
        await d.highlight(t(d, 'bf-cal-bht-table')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'aapg', chapter: 'One BHT per depth', chapterSub: 'AAPG and Harrison',
      say: 'When a well has a single BHT per depth, the published corrections add an amount by depth instead, from regional data sets. At total depth AAPG adds twenty six degrees and Harrison twenty two, so the last pass reads two hundred and forty four and two hundred and forty: both too hot here, because that pass had already warmed up for eighteen hours. Horner uses this well\'s own recovery, so we keep it.',
      sub: 'When a well has a single BHT per depth, the published corrections add an amount by depth instead, from regional data sets. At total depth AAPG adds 26 °F and Harrison 22, so the last pass reads 244.1 and 240.3: both too hot here, because that pass had already warmed up for eighteen hours. Horner uses this well\'s own recovery, so we keep it.',
      do: async (d) => {
        await d.select(t(d, 'bf-cal-bht-method'), 'aapg');
        await expectText(d, 'bf-cal-bht-table', /7185\s*218\.1\s*244\.1/, 'aapg');
        await d.sleep(2500);
        await d.select(t(d, 'bf-cal-bht-method'), 'harrison');
        await expectText(d, 'bf-cal-bht-table', /7185\s*218\.1\s*240\.3/, 'harrison');
        await d.sleep(2500);
        await d.select(t(d, 'bf-cal-bht-method'), 'horner');
        await d.sleep(1500);
      } },
  ],
};
