// QI lesson F17: porosity from impedance, and reading the checks before trusting
// a property volume. Figures from the 2026-10-10 probes on the F15 impedance
// volume: whole well porosity = 0.2148 + 7.559e-6 AI, r² 0.00 over 1397 samples;
// window 1270-1330 ms porosity = 0.0984 + 1.521e-5 AI, r² 0.73, 60 samples,
// residual SD 0.0055; blind RMS 0.010 to 0.030, inside Q10-Q90 13 to 47 percent.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';
import { clearProductVolumes } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'lesson-qi-f17',
  ...qiLessonMeta(17, 'F', 'Properties from impedance: *what the checks say*', 'Calibrating porosity against inverted impedance at the wells, and reading the leave-one-out check before trusting the volume'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await clearProductVolumes(d, shared);
    await lessonProject(d, shared);
    // the impedance volume of lesson 15, made off camera in this project
    await d.page.getByTestId('qi-tab-inversion').click(); await d.sleep(2500);
    const vols = await d.page.getByTestId('qi-inv-volume').locator('option').allInnerTexts();
    await d.page.getByTestId('qi-inv-volume').selectOption({ label: vols.find((v) => /full/.test(v)) }); await d.sleep(1500);
    await d.page.getByTestId('qi-inv-read-wells').click();
    await d.page.getByTestId('qi-inv-wells').waitFor({ timeout: 300000 });
    await d.page.getByTestId('qi-inv-run').click();
    await d.page.locator('[data-testid="qi-inv-runs"] >> text=Ready: open in Seismolord').first().waitFor({ timeout: 1800000 });
    await d.sleep(2000);
    await d.page.getByTestId('qi-tab-properties').click(); await d.sleep(2500);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 17', chapterSub: 'Module F · Inversion and the decision',
      say: 'An impedance volume is one step from what a development team wants: porosity, or the chance of sand. Property prediction calibrates a transform at the wells and applies it to the inverted impedance. It is also the easiest place in QI to fool yourself, so this lesson spends as long on the checks as on the fit.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 17', title: 'Properties from impedance',
        body: '<ul><li>Fit porosity to impedance at the wells</li><li>Apply it to the inverted volume</li><li>Read the checks before you believe it</li></ul>' }) },
    { id: 'whole', chapter: 'A first fit', chapterSub: 'QI Studio · Properties',
      say: 'Take the impedance volume from lesson fifteen, predict porosity, and read the wells: their PHIT logs, taken to seismic scale. Over the whole of each well the fit explains nothing, an R squared of zero. Shales and sands, shallow and deep, follow different trends, and one line through all of them means nothing.',
      sub: 'Take the impedance volume from lesson 15, predict porosity, and read the wells: their PHIT logs, taken to seismic scale. Over the whole of each well the fit explains nothing, an R² of zero. Shales and sands, shallow and deep, follow different trends, and one line through all of them means nothing.',
      do: async (d) => {
        await d.hideSlide();
        const ais = await t(d, 'qi-prop-ai').locator('option').allInnerTexts();
        await d.select('qi-prop-ai', { label: ais.find((o) => /AI/.test(o)) });
        await d.click('qi-prop-read');
        await t(d, 'qi-prop-wells').waitFor({ timeout: 300000 });
        await d.click('qi-prop-calibrate'); await d.sleep(2500);
        await expectText(d, 'qi-prop-transform', /r squared 0\.00/, 'whole-well fit');
        await d.highlight('qi-prop-transform');
      } },
    { id: 'window', chapter: 'The reservoir window', chapterSub: '1270 to 1330 ms',
      say: 'So we fit only where it matters: a window from twelve seventy to thirteen thirty milliseconds, around the Ekene Sand. Now the fit explains seventy three percent of the variance. But look at the sign. Porosity rises with impedance, and in clean sand it should fall.',
      sub: 'So we fit only where it matters: a window from 1270 to 1330 ms, around the Ekene Sand. Now the fit explains 73 percent of the variance. But look at the sign. Porosity rises with impedance, and in clean sand it should fall.',
      do: async (d) => {
        await d.unhighlight();
        await d.type(d.page.getByLabel('Window start (ms)'), '1270');
        await d.type(d.page.getByLabel('Window end (ms)'), '1330');
        await d.click('qi-prop-read'); await d.sleep(3000);
        await d.click('qi-prop-calibrate'); await d.sleep(2500);
        await expectText(d, 'qi-prop-transform', /porosity = 0\.0984 \+ 1\.521e-5 x AI\s*\(r squared 0\.73, 60 samples/, 'window fit');
        await d.highlight('qi-prop-transform');
      } },
    { id: 'why', chapter: 'Why the sign is wrong', chapterSub: 'Lithology, not porosity',
      say: 'Inside this window the Ogbia Shale sits on top of the Ekene Sand. Here the sand is harder than the shale, with an impedance of twenty thousand seven hundred against fifteen thousand five hundred, and it is also the more porous rock. So the line is separating shale from sand. It is a lithology transform. Within the sand alone, porosity and impedance would run the other way.',
      sub: 'Inside this window the Ogbia Shale sits on top of the Ekene Sand. Here the sand is harder than the shale, with an impedance of 20,700 against 15,500 ft/s·g/cc, and it is also the more porous rock. So the line is separating shale from sand. It is a lithology transform. Within the sand alone, porosity and impedance would run the other way.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Why the sign is wrong', title: 'A lithology transform', body: '<ul><li>Shale: AI 15,500, lower porosity</li><li>Sand: AI 20,700, porosity near 20 percent</li><li>The line separates rock types</li><li>Porosity within a facies needs facies first</li></ul>' }); } },
    { id: 'check', chapter: 'The leave-one-out check', chapterSub: 'Each well predicted blind',
      say: 'Calibrating also ran the leave-one-out test: each well is predicted from the inverted impedance at its trace, with the transform fitted on the others. The errors look small, one to three porosity units. But the last column says how often the truth falls inside the predicted Q10 to Q90 band: it should be about eighty percent, and it is only thirteen to forty seven.',
      sub: 'Calibrating also ran the leave-one-out test: each well is predicted from the inverted impedance at its trace, with the transform fitted on the others. The errors look small, one to three porosity units. But the last column says how often the truth falls inside the predicted Q10 to Q90 band: it should be about 80 percent, and it is only 13 to 47 percent.',
      do: async (d) => {
        await d.hideSlide();
        await t(d, 'qi-prop-result').waitFor({ timeout: 900000 }); await d.sleep(1500);
        await expectText(d, 'qi-prop-result', /Ekene-1\s*15\s*0\.0\d\d\s*0\.\d\d\s*\d+/, 'leave-one-out table');
        await t(d, 'qi-prop-result').scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight('qi-prop-result');
      } },
    { id: 'meaning',
      say: 'That is the most important number on the page. The band was built from the scatter of the fit at the wells, which is tiny. It leaves out the error of the impedance itself, seven or eight percent from lesson fifteen. A porosity volume shipped with these bands would claim several times more certainty than it has.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Coverage', title: 'The band must hold the truth', body: '<ul><li>Q10 to Q90 should hold about 80 percent</li><li>Here: 13 to 47 percent</li><li>The fit\'s scatter is not the prediction error</li><li>Fix the model before you ship the volume</li></ul>' }); } },
    { id: 'issues',
      say: 'QI Studio offers these findings as issues for the register, so the decision not to ship the volume, or to rebuild it on facies, is recorded with the study.',
      do: async (d) => { await d.hideSlide(); await d.highlight(d.page.getByRole('button', { name: /property issues to the register/ })); } },
    { id: 'next',
      say: 'The last lesson brings the evidence together for a prospect: trap, amplitude, the competing explanations, and the report.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Next', title: 'Prospects and the report', body: '<ul><li>Trap and anomaly</li><li>Evidence and competing explanations</li><li>The QI assessment</li></ul>' }); } },
  ],
};
