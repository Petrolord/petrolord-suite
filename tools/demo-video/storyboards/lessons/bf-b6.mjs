// Basin Modelling with Petrolord, Lesson B6: calibrating to vitrinite and temperature.
import { login, expectText, openBf, enterExpert, openModel, simulate, importCalibration, seedModel, t, tab, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson B6: Ekene-1';
export default {
  id: 'lesson-bf-b6',
  ...bfLessonMeta(6, 'B', 'Calibrating to *vitrinite and temperature*', 'Easy%Ro against measured reflectance, residuals and Auto-Fit'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await seedModel(shared, 'ek1-calibrated', NAME, { heat_flow: { type: 'constant', value: 70, history: [] } });
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await tab(d, 'calibration');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'vitrinite', chapter: 'Vitrinite reflectance', chapterSub: 'A maximum-temperature thermometer',
      say: 'Vitrinite, the woody organic matter in the rock, reflects more light the hotter it has been, and never goes back. Fourteen cuttings samples from Ekene-1 give the measured points. The pink curve is Easy%Ro, Sweeney and Burnham\'s kinetic model, run through the column.',
      do: async (d) => { await d.sleep(5000); } },
    { id: 'hot', chapter: 'Too hot', chapterSub: 'Seventy milliwatts',
      say: 'This model has a heat flow of seventy milliwatts per square metre. The modelled reflectance runs to the right of every sample, and the corrected temperatures sit left of the curve: the basin in the model is too hot. The misfit says so in numbers.',
      do: async (d) => {
        await expectText(d, 'bf-cal-ro-rms', /^0\.\d+ %$/, 'ro rms hot');
        await d.highlight(t(d, 'bf-cal-ro-rms')); await d.sleep(2000);
        await d.highlight(t(d, 'bf-cal-temp-rms')); await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'residuals', chapter: 'Residuals', chapterSub: 'Measured minus modelled',
      say: 'The residual plots show it point by point: every reflectance sample and every temperature below the model. A good calibration scatters around zero with no trend in depth.',
      do: async (d) => { await d.page.mouse.wheel(0, 500); await d.sleep(4500); await d.page.mouse.wheel(0, -500); } },
    { id: 'fit', chapter: 'Auto-Fit', chapterSub: 'Both data sets at once',
      say: 'Auto-Fit searches for the heat flow that matches both: fifty eight and a half milliwatts per square metre. The vitrinite is now matched to about a hundredth of a percent, and the temperatures to under a degree.',
      sub: 'Auto-Fit searches for the heat flow that matches both: 58.5 mW/m². The vitrinite is now matched to about a hundredth of a percent, and the temperatures to under a degree.',
      do: async (d) => {
        await d.click(t(d, 'bf-cal-autofit'));
        await expectText(d, 'bf-cal-fit-note', /Heat flow fitted to 58\.5 mW\/m2/, 'fit');
        await d.sleep(1500);
        await expectText(d, 'bf-cal-ro-rms', /^0\.01\d %$/, 'ro rms');
        await d.highlight(t(d, 'bf-cal-fit-note')); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'limits', chapter: 'What it does not tell you', chapterSub: 'One well, one heat flow',
      say: 'Two cautions. A fit at one well calibrates the heat flow there; carrying it into the kitchen is an assumption, tested in the sensitivity lesson. And the samples here only reach zero point six five percent, so the fit says little about the heat flow far in the past.',
      sub: 'Two cautions. A fit at one well calibrates the heat flow there; carrying it into the kitchen is an assumption, tested in the sensitivity lesson. And the samples here only reach 0.65 %Ro, so the fit says little about the heat flow far in the past.',
      do: async (d) => { await d.sleep(5000); } },
  ],
};
