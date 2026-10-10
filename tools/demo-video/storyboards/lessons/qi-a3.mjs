// QI lesson A3: seismic QC (spectra, -6 dB band, signal to noise, footprint).
// Figures from the 2026-10-10 dry run on EKENE3D-full.sgy: 800-1600 ms peak 31.4 Hz,
// -6 dB 14.4 to 34.8 Hz, S/N 23.9 dB; 1600-2404 ms peak 21.8 Hz, 18.1 dB; no footprint. The shallow window of the
// synthetic kit has few reflectors, so its spectrum is peaky; the lesson reads
// the target window (800 to 1600 ms, the Ekene Sand at about 1290 ms).
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const qcBlock = (d, name) => d.page.locator('[data-testid^="qi-qc-"]').filter({ hasText: name }).first();
const runFor = async (d, name) => {
  const ids = await d.page.locator('[data-testid^="qi-qc-run-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid'), text: e.closest('div')?.parentElement?.innerText || '' })));
  return ids.find((x) => x.text.includes(name))?.id;
};

export default {
  id: 'lesson-qi-a3',
  ...qiLessonMeta(3, 'A', 'Seismic QC: *bandwidth, noise and footprint*', 'What the seismic can resolve before anyone inverts it'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 3', chapterSub: 'Module A · Should we do QI here?',
      say: 'The wells are graded. Now the seismic. Three things decide what a volume can tell us: its bandwidth, which sets how thin a bed it can resolve; its signal to noise, which sets how small a change it can see; and any acquisition footprint, a pattern from the survey geometry that can masquerade as geology.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 3', title: 'Seismic QC',
        body: '<ul><li><b>Bandwidth</b>: how thin a bed it resolves</li><li><b>Signal to noise</b>: how small a change it sees</li><li><b>Footprint</b>: survey geometry posing as geology</li></ul>' }) },
    { id: 'tuning', chapter: 'Resolution', chapterSub: 'A quarter of a wavelength',
      say: 'A rule of thumb: beds thinner than about a quarter of the dominant wavelength tune, and their top and base reflections merge. At thirty hertz and an interval velocity of nine thousand five hundred feet per second, the wavelength is about three hundred and twenty feet, so the tuning thickness is about eighty feet. The Ekene Sand is a hundred and five feet thick, so its top and base resolve; its oil column, under forty feet, does not.',
      sub: 'A rule of thumb: beds thinner than about a quarter of the dominant wavelength tune, and their top and base reflections merge. At 30 Hz and an interval velocity of 9,500 ft/s, the wavelength is about 320 ft, so the tuning thickness is about 80 ft. The Ekene Sand is 105 ft thick, so its top and base resolve; its oil column, under 40 ft, does not.',
      do: async (d) => d.slide({ eyebrow: 'Resolution', title: 'Tuning: a quarter of a wavelength', formula: 'λ = v / f · tuning ≈ λ / 4',
        body: '<ul><li>v 9,500 ft/s, f 30 Hz: λ ≈ 320 ft</li><li>Tuning thickness ≈ 80 ft</li></ul>' }) },
    { id: 'run', chapter: 'Running QC', chapterSub: 'QI Studio · Seismic QC',
      say: 'Seismic QC runs on the seismic worker. It samples twelve inlines across the survey for the amplitude spectra and the signal to noise, and builds R M S amplitude maps from every trace to look for footprint. We run it on the full stack.',
      sub: 'Seismic QC runs on the seismic worker. It samples twelve inlines across the survey for the amplitude spectra and the signal to noise, and builds RMS amplitude maps from every trace to look for footprint. We run it on the full stack.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-tab-qc');
        const id = await runFor(d, 'EKENE3D-full.sgy');
        await d.click(id);
      },
      wait: async (d) => { await d.page.getByTestId('qi-qc-result').first().waitFor({ timeout: 900000 }); await d.sleep(1500); },
      waitLabel: 'Minutes later' },
    { id: 'spectra', chapter: 'Spectra', chapterSub: 'Three time windows',
      say: 'Three windows, shallow to deep. Read the middle one: eight hundred to sixteen hundred milliseconds holds the Ekene Sand, at about twelve hundred and ninety. Its spectrum peaks at thirty one hertz, with a minus six decibel band from fourteen to thirty five hertz. The shallow window has only a few reflectors, so its spectrum is spiky and its band hugs the peak; that is the geology, not the wavelet. Deeper, the peak falls to twenty two hertz as the earth absorbs the high frequencies.',
      sub: 'Three windows, shallow to deep. Read the middle one: 800 to 1600 ms holds the Ekene Sand, at about 1290 ms. Its spectrum peaks at 31 Hz, with a -6 dB band from 14 to 35 Hz. The shallow window has only a few reflectors, so its spectrum is spiky and its band hugs the peak; that is the geology, not the wavelet. Deeper, the peak falls to 22 Hz as the earth absorbs the high frequencies.',
      do: async (d) => {
        const table = qcBlock(d, 'EKENE3D-full.sgy').locator('table').first();
        await expectText(d, table, /800 to 1600\s*31\.4\s*14\.4 to 34\.8/, 'target window spectrum');
        await expectText(d, table, /1600 to 2404\s*21\.8/, 'deep window peak');
        await d.highlight(table);
      } },
    { id: 'snr',
      say: 'Signal to noise comes from how alike neighbouring traces are. In the target window it is about twenty four decibels, so the signal is some two hundred and fifty times the noise power. That is very clean, as you would expect of a demonstration dataset; field data is often ten to fifteen. Deeper it drops to eighteen.',
      sub: 'Signal to noise comes from how alike neighbouring traces are. In the target window it is about 24 dB, so the signal is some 250 times the noise power. That is very clean, as you would expect of a demonstration dataset; field data is often 10 to 15 dB. Deeper it drops to 18 dB.',
      do: async (d) => {
        await d.unhighlight();
        const table = qcBlock(d, 'EKENE3D-full.sgy').locator('table').first();
        await expectText(d, table, /800 to 1600[\s\S]*\(23\.9 dB\)[\s\S]*\(18\.1 dB\)/, 'signal to noise');
        await d.highlight(table);
      } },
    { id: 'footprint', chapter: 'Footprint', chapterSub: 'RMS maps at three times',
      say: 'Footprint is a periodic stripe in the amplitude maps that repeats with the source and receiver line spacing. QC looks for it along the inlines and along the crosslines, at four hundred, twelve hundred and two thousand milliseconds. None is found: the strongest periodic pattern explains under ten percent of the variance at every time.',
      sub: 'Footprint is a periodic stripe in the amplitude maps that repeats with the source and receiver line spacing. QC looks for it along the inlines and along the crosslines, at 400, 1200 and 2000 ms. None is found: the strongest periodic pattern explains under 10 percent of the variance at every time.',
      do: async (d) => {
        await d.unhighlight();
        const table = qcBlock(d, 'EKENE3D-full.sgy').locator('table').last();
        await expectText(d, table, /400\s*none[\s\S]*1200\s*none[\s\S]*2000\s*none/, 'no footprint');
        await d.highlight(table);
      } },
    { id: 'next',
      say: 'With the data graded, Module B turns to the rock physics: does the fluid change the rock enough for this seismic to see it?',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Module B: rock physics first', body: '<ul><li>Shear logs and the local trend</li><li>Fluids and Gassmann</li><li>Crossplots and modelled AVO</li></ul>' });
      } },
  ],
};
