// QI lesson F15: post-stack model-based impedance inversion and the blind-well
// check. Figures from the 2026-10-10 run after #983 (logs timed only within the
// checkshot range): blind correlation 0.66 to 0.78, blind AI error 7.3 to 8.6
// percent at Ekene-1, -2, -3, -4 and -8; with the well hardly different.
// Horizons come from Seismolord's Tops to horizons on EKENE3D-full.sgy.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const HZ = ['Seabed', 'Benin Formation', 'Agbada Formation', 'Ogbia Shale', 'Ekene Sand', 'Ekene Sand Base'];
const hzBox = (d, name) => d.page.locator('[data-testid="qi-inv-horizons"] label').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().locator('input');

export default {
  id: 'lesson-qi-f15',
  ...qiLessonMeta(15, 'F', 'Impedance inversion: *from reflections to rock*', 'Model-based post-stack inversion, the low-frequency model, and the blind-well check that tells you whether to believe it'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
    await d.page.getByTestId('qi-tab-inversion').click(); await d.sleep(2500);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 15', chapterSub: 'Module F · Inversion and the decision',
      say: 'Seismic records reflections: the contrasts between layers. Interpreters want the layers themselves, their impedance, because impedance ties to porosity, lithology and fluid. Inversion turns one into the other. This lesson inverts the Ekene full stack and checks the answer at every well.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 15', title: 'Impedance inversion',
        body: '<ul><li>Seismic: reflections between layers</li><li>Inversion: the layers\' impedance</li><li>Checked well by well, blind</li></ul>' }) },
    { id: 'how', chapter: 'How it works', chapterSub: 'Model-based inversion',
      say: 'A model-based inversion searches for the impedance whose synthetic, through the wavelet, matches the seismic trace. The seismic carries only the band of the wavelet, roughly ten to forty hertz here, so the lowest frequencies, the slow trend of impedance with depth, come from the wells, interpolated along horizons: the low-frequency model.',
      do: async (d) => d.slide({ eyebrow: 'How it works', title: 'Match the seismic, keep the trend', formula: 'minimise ‖ seismic − w ∗ R(Z) ‖² + λ ‖ Z − Z_low ‖²',
        body: '<ul><li>The <b>wavelet</b> from the ties</li><li>The seismic band from the trace</li><li>The <b>low frequencies</b> from the wells, along horizons</li></ul>' }) },
    { id: 'setup', chapter: 'Setting it up', chapterSub: 'QI Studio · Inversion',
      say: 'We take the full stack, the model-based method, and the field wavelet averaged from the four ties. The horizons come from Seismolord: its Tops to horizons tool tracked one horizon per formation top across the survey. Six of them guide the low-frequency model, from the seabed to the base of the Ekene Sand.',
      do: async (d) => {
        await d.hideSlide();
        const vols = await t(d, 'qi-inv-volume').locator('option').allInnerTexts();
        await d.select('qi-inv-volume', { label: vols.find((v) => /full/.test(v)) });
        await d.sleep(1500);
        for (const h of HZ) { const b = hzBox(d, h); if (await b.count()) { await d.click(b, { after: 150 }); } }
        await d.highlight('qi-inv-horizons');
      } },
    { id: 'wells', chapter: 'The wells in time', chapterSub: 'Read the wells',
      say: 'Read the wells turns each well\'s sonic and density into impedance on the seismic time axis, through its committed tie. Each log is used only between the shallowest and deepest checkshots, where the time-depth is measured. Above the first checkshot the times would be a guess, and a guessed interval scored against the seismic would double the error. Ekene nine has no density, so it sits out.',
      sub: 'Read the wells turns each well\'s sonic and density into impedance on the seismic time axis, through its committed tie. Each log is used only between the shallowest and deepest checkshots, where the time-depth is measured. Above the first checkshot the times would be a guess, and a guessed interval scored against the seismic would double the error. Ekene-9 has no density, so it sits out.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-inv-read-wells');
        await t(d, 'qi-inv-wells').waitFor({ timeout: 300000 });
        await expectText(d, 'qi-inv-wells', /Ekene-9\s*No density curve/, 'wells table');
        await t(d, 'qi-inv-wells').scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight('qi-inv-wells');
      } },
    { id: 'blind', chapter: 'The blind-well check', chapterSub: 'Each well left out in turn',
      say: 'Before inverting the survey, the blind-well check. Each well is left out of the low-frequency model in turn, and its impedance is predicted from the seismic and the other wells.',
      do: async (d) => { await d.unhighlight(); await d.click('qi-inv-blind'); },
      wait: async (d) => { await t(d, 'qi-inv-blind-table').waitFor({ timeout: 1200000 }); await d.sleep(1000); },
      waitLabel: 'Minutes later' },
    { id: 'blindread',
      say: 'Left out, every well\'s impedance is predicted within seven to nine percent, with correlations of point seven to point eight after a fifty hertz high cut. Putting the well back into the model hardly changes it. That is the result to want: the detail comes from the seismic, and the wells only set the trend.',
      sub: 'Left out, every well\'s impedance is predicted within 7 to 9 percent, with correlations of 0.7 to 0.8 after a 50 Hz high cut. Putting the well back into the model hardly changes it. That is the result to want: the detail comes from the seismic, and the wells only set the trend.',
      do: async (d) => {
        await expectText(d, 'qi-inv-blind-table', /Ekene-1\s*0\.\d\d\s*[78]\.\d[\s\S]*Ekene-8\s*0\.\d\d\s*[789]\.\d/, 'blind table');
        await t(d, 'qi-inv-blind-table').scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight('qi-inv-blind-table');
      } },
    { id: 'warn',
      say: 'Read it the other way too. If the blind error were much larger than the error with the well, the inversion would be leaning on the low-frequency model, and between the wells it would be guessing. If both were large, suspect the ties or the wavelet before the inversion settings.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Reading the blind check', title: 'Blind against with-the-well', body: '<ul><li>Both small and alike: the seismic carries it</li><li>Blind much worse: leaning on the trend</li><li>Both large: check ties and wavelet first</li></ul>' }); } },
    { id: 'run', chapter: 'Inverting the survey', chapterSub: 'On the seismic worker',
      say: 'With the check on record, we invert the full survey. The impedance volume comes back to Seismolord, beside the stacks.',
      do: async (d) => { await d.hideSlide(); await d.click('qi-inv-run'); },
      wait: async (d) => { await d.page.locator('[data-testid="qi-inv-runs"] >> text=Ready: open in Seismolord').first().waitFor({ timeout: 1800000 }); },
      waitLabel: 'Minutes later' },
    { id: 'ready',
      say: 'The impedance volume is ready, with its settings and the blind check saved in the project for the report.',
      do: async (d) => { await d.highlight('qi-inv-runs'); } },
    { id: 'next',
      say: 'Next lesson uses the angle stacks instead of the full stack, and inverts for shear impedance and density as well.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Next', title: 'Simultaneous inversion', body: '<ul><li>AI, SI and density at once</li><li>Why density needs the far angles</li><li>Blind wells per parameter</li></ul>' }); } },
  ],
};
