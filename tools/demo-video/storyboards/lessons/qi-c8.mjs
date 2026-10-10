// QI lesson C8: the synthetic seismogram and its wavelet, on Ekene-2.
// Figures from the 2026-10-10 probe (kit v3, after the synthetic placement
// fix #977): Ricker 25 Hz best 0 ms r 0.70, tie QC mean 0.51; statistical
// wavelet 25.4 Hz zero phase, r 0.68, QC 0.49, phase estimate -9 deg; well
// (least-squares) wavelet 25.5 Hz, -12 deg, fit 0.88, r 0.71, QC 0.59. The kit's
// wavelet at the reservoir is a zero-phase Ricker of about 23.5 Hz.
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openSynthetics } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'lesson-qi-c8',
  ...qiLessonMeta(8, 'C', 'Synthetics and wavelets: *what the well says the seismic should look like*', 'Building a synthetic seismogram from the sonic and density, and three ways to get the wavelet'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await openSynthetics(d, shared);
    const wells = await d.page.getByTestId('synth-well').locator('option').allInnerTexts();
    await d.page.getByTestId('synth-well').selectOption({ label: wells.find((x) => /^Ekene-2(?!\d)/.test(x)) });
    await d.sleep(3000);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 8', chapterSub: 'Module C · Tying the wells',
      say: 'Module B predicted what the reservoir should look like on seismic. To lay that prediction over the real data, each well has to sit at the right time on the seismic. The tool for that is the synthetic seismogram: the seismic trace the well\'s logs predict.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 8', title: 'Synthetics and wavelets',
        body: '<ul><li>Logs in depth, seismic in time</li><li>A synthetic: what the logs predict the trace to be</li><li>The <b>wavelet</b> is half the answer</li></ul>' }) },
    { id: 'recipe', chapter: 'The recipe', chapterSub: 'Sonic, density, time, wavelet',
      say: 'The recipe has four steps. Multiply velocity by density for acoustic impedance. Convert depth to time with the checkshots. Turn each impedance contrast into a reflection coefficient. And convolve those spikes with a wavelet. Get the time-depth wrong and the synthetic slides against the seismic; get the wavelet wrong and the shapes do not match.',
      do: async (d) => d.slide({ eyebrow: 'The recipe', title: 'From logs to a synthetic trace', formula: 'Z = Vp·ρ   ·   R = (Z₂ − Z₁)/(Z₂ + Z₁)   ·   synthetic = R ∗ w',
        body: '<ul><li>Impedance from sonic and density</li><li>Depth to time through the checkshots</li><li>Reflection coefficients, then the wavelet</li></ul>' }) },
    { id: 'ricker', chapter: 'A textbook wavelet', chapterSub: 'Seismolord · Synthetics · Ekene-2',
      say: 'In Seismolord\'s Synthetics window, on Ekene two, we start with a textbook wavelet: a twenty five hertz zero-phase Ricker. Synthesize, then Suggest looks for the best bulk shift. Zero milliseconds, at a correlation of point seven: the checkshots already place the well correctly.',
      sub: 'In Seismolord\'s Synthetics window, on Ekene-2, we start with a textbook wavelet: a 25 Hz zero-phase Ricker. Synthesize, then Suggest looks for the best bulk shift. Zero milliseconds, at a correlation of 0.7: the checkshots already place the well correctly.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('synth-mode-ricker');
        await d.click('synth-run'); await d.sleep(4000);
        await d.click('synth-suggest');
        await expectText(d, t(d, 'synth-suggest-result').first(), /best 0 ms \(r = 0\.70\)/, 'Ricker suggest');
        await d.highlight(t(d, 'synth-suggest-result').first());
      } },
    { id: 'tracks',
      say: 'The tracks read left to right: sonic, density, impedance, the reflection coefficients, the synthetic, and the seismic traces around the well. A good tie is when the synthetic\'s peaks and troughs line up with the seismic\'s, event by event, all the way down.',
      do: async (d) => { await d.unhighlight(); await d.highlight('synth-canvas', { pad: -20 }); } },
    { id: 'stat', chapter: 'A wavelet from the seismic', chapterSub: 'Statistical extraction',
      say: 'A textbook wavelet is a guess. A statistical wavelet comes from the seismic itself: the autocorrelation of the traces near the well gives the amplitude spectrum, and the wavelet is built zero phase from it. Here it peaks at twenty five point four hertz. The tie is the same, zero milliseconds at point six eight.',
      sub: 'A textbook wavelet is a guess. A statistical wavelet comes from the seismic itself: the autocorrelation of the traces near the well gives the amplitude spectrum, and the wavelet is built zero phase from it. Here it peaks at 25.4 Hz. The tie is the same, zero milliseconds at 0.68.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-extract'); await d.sleep(5000);
        await expectText(d, 'synth-wavelet-info', /statistical wavelet, peak 25\.4 Hz, phase 0 deg/, 'statistical wavelet');
        await d.click('synth-run'); await d.sleep(4000);
        await d.click('synth-suggest');
        await expectText(d, t(d, 'synth-suggest-result').first(), /best 0 ms \(r = 0\.68\)/, 'statistical suggest');
        await d.highlight('synth-wavelet-info');
      } },
    { id: 'phase', chapter: 'Phase', chapterSub: 'What the spectrum cannot tell',
      say: 'The autocorrelation throws the phase away, so a statistical wavelet is zero phase by assumption. Estimate phase tests constant rotations against the seismic: minus nine degrees, improving the correlation by only a hundredth. Small rotations like this are within the noise; the data is close to zero phase.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-phase-estimate');
        await expectText(d, 'synth-phase-result', /-9°/, 'phase estimate');
        await d.highlight('synth-phase-result');
      } },
    { id: 'well', chapter: 'A wavelet from the well', chapterSub: 'Least squares',
      say: 'The third way uses the well itself. Least squares finds the wavelet that best turns this well\'s reflection coefficients into the seismic trace at the well, so it measures the phase instead of assuming it. Twenty five point five hertz, minus twelve degrees, and it explains eighty eight percent of the trace. The windowed tie quality improves from about point five to point six.',
      sub: 'The third way uses the well itself. Least squares finds the wavelet that best turns this well\'s reflection coefficients into the seismic trace at the well, so it measures the phase instead of assuming it. 25.5 Hz, -12 degrees, and it explains 88 percent of the trace. The windowed tie quality improves from about 0.5 to 0.6.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-extract-well'); await d.sleep(5000);
        await expectText(d, 'synth-wavelet-info', /well wavelet, peak 25\.5 Hz, phase -12 deg, fit 0\.88/, 'well wavelet');
        await d.click('synth-run'); await d.sleep(4000);
        await d.click('synth-suggest');
        await expectText(d, 'synth-qc-summary', /tie QC: mean r 0\.59/, 'well tie QC');
        await d.highlight('synth-wavelet-info');
      } },
    { id: 'which', chapter: 'Which wavelet?', chapterSub: 'Each has its place',
      say: 'Which should you use? The statistical wavelet needs no well and no tie, so it is the honest first pass. The well wavelet is better once the tie is right, but a least-squares fit can absorb a wrong tie into a strange phase, so check it against the statistical one. On Ekene both agree: about twenty five hertz and close to zero phase, which is what the kit was built with.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Which wavelet?', title: 'Statistical first, then the well', body: '<ul><li><b>Statistical</b>: no well needed, phase assumed zero</li><li><b>Well</b>: phase measured, needs a good tie</li><li>On Ekene: about 25 Hz, close to zero phase</li></ul>' });
      } },
    { id: 'next',
      say: 'Next lesson: when a tie needs a shift or a stretch, how to make it, and how to commit it so every application uses the corrected time-depth.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'Shifts, anchors and the time-depth record', body: '<ul><li>Bulk shift</li><li>Anchors: stretch and squeeze</li><li>Commit to the checkshots</li></ul>' }) },
  ],
};
