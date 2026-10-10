// QI lesson A2: the usability matrix and the issue register.
// Figures from the 2026-10-10 probe (kit v3): Ekene-1 good on both targets
// (25 checkshot levels, 76 survey stations); Ekene-2..4 good on the Ekene Sand,
// no Oboro Sand zone; Ekene-8 no zones; Ekene-9 density missing, porosity, Vsh
// and Sw limited; the depletion issue on Ekene-1 from the dates.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const cell = (d, well, target) => d.page.locator(`tr:has(td:text-is("${well}")) [data-testid$="-${target}"]`).first();
const issue = (d, text) => d.page.locator('tr').filter({ hasText: text }).first();

export default {
  id: 'lesson-qi-a2',
  ...qiLessonMeta(2, 'A', 'The usability matrix: *every well against every target*', 'Reading the grade behind each cell, and turning the gaps into issues with remedies'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 2', chapterSub: 'Module A · Should we do QI here?',
      say: 'Last lesson we set up a QI study on the Ekene field with six wells and two targets. Now we ask, well by well and target by target, whether the data can carry a quantitative interpretation.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 2', title: 'The usability matrix',
        body: '<ul><li>One cell per well and target</li><li><b>Good</b>, <b>limited</b> or <b>missing</b>, with the reasons</li><li>Every gap becomes an issue with a remedy</li></ul>' }) },
    { id: 'what', chapter: 'What is graded', chapterSub: 'Curves, time, depth',
      say: 'Each cell checks what rock physics and a tie need over that zone. The curves: sonic for Vp, density, shear sonic for Vs, then porosity, shale volume and water saturation. The time-depth link: checkshots. And the depth: the elevation, so true vertical depth below sea level is known, and the deviation survey.',
      do: async (d) => d.slide({ eyebrow: 'What is graded', title: 'Over the zone, in every well',
        body: '<ul><li><b>Curves</b>: DT, RHOB, DTS; porosity, Vsh, Sw</li><li><b>Time</b>: checkshots or a tie</li><li><b>Depth</b>: elevation and survey</li></ul>' }) },
    { id: 'matrix', chapter: 'The matrix', chapterSub: 'QI Studio · Usability',
      say: 'Here is the matrix. Ekene one is good on both targets. Ekene two, three and four are good on the Ekene Sand but missing on the Oboro Sand. Ekene eight is missing on both, and Ekene nine is missing on both, for a different reason.',
      sub: 'Here is the matrix. Ekene-1 is good on both targets. Ekene-2, Ekene-3 and Ekene-4 are good on the Ekene Sand but missing on the Oboro Sand. Ekene-8 is missing on both, and Ekene-9 is missing on both, for a different reason.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-tab-usability');
        await expectText(d, cell(d, 'Ekene-1', 'Oboro Sand'), /Good/, 'Ekene-1 Oboro');
        await expectText(d, cell(d, 'Ekene-2', 'Oboro Sand'), /Missing/, 'Ekene-2 Oboro');
        await d.highlight(d.page.locator('table').first());
      } },
    { id: 'good',
      say: 'Click a cell for its reasons. Ekene one on the Ekene Sand: every curve covers the zone, there are twenty five checkshot levels, the elevation is set and the survey has seventy six stations.',
      sub: 'Click a cell for its reasons. Ekene-1 on the Ekene Sand: every curve covers the zone, there are 25 checkshot levels, the elevation is set and the survey has 76 stations.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(cell(d, 'Ekene-1', 'Ekene Sand'));
        await expectText(d, 'qi-cell-detail', /25 checkshot levels[\s\S]*76 survey stations/, 'Ekene-1 detail');
        await d.highlight('qi-cell-detail');
      } },
    { id: 'zone',
      say: 'Ekene two on the Oboro Sand: there is no zone of that name on the well. The logs may well be there; the interval has not been defined in Petrophysics Studio. That is a quick fix, from the tops.',
      sub: 'Ekene-2 on the Oboro Sand: there is no zone of that name on the well. The logs may well be there; the interval has not been defined in Petrophysics Studio. That is a quick fix, from the tops.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(cell(d, 'Ekene-2', 'Oboro Sand'));
        await expectText(d, 'qi-cell-detail', /No zone named Oboro Sand on this well/, 'Ekene-2 Oboro detail');
        await d.highlight('qi-cell-detail');
      } },
    { id: 'density',
      say: 'Ekene nine is the harder case. The sonic, the shear log and the checkshots are good, but there is no density over the zone, so impedance cannot be computed and rock physics cannot run. Porosity, shale volume and saturation are limited too, because the petrophysics was never done without density.',
      sub: 'Ekene-9 is the harder case. The sonic, the shear log and the checkshots are good, but there is no density over the zone, so impedance cannot be computed and rock physics cannot run. Porosity, shale volume and saturation are limited too, because the petrophysics was never done without density.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(cell(d, 'Ekene-9', 'Ekene Sand'));
        await expectText(d, 'qi-cell-detail', /Density: No density over the zone/, 'Ekene-9 detail');
        await d.highlight('qi-cell-detail');
      } },
    { id: 'depletion',
      say: 'Notice the last line on Ekene one. The seismic was acquired after the well started producing, so the amplitudes near it may show depletion that the logs do not. That came from the two dates we typed in the last lesson.',
      sub: 'Notice the last line on Ekene-1. The seismic was acquired after the well started producing, so the amplitudes near it may show depletion that the logs do not. That came from the two dates we typed in the last lesson.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(cell(d, 'Ekene-1', 'Ekene Sand'));
        await expectText(d, 'qi-cell-detail', /after production started on 2015-03-01/, 'depletion line');
        await d.highlight(d.page.getByText(/may show depletion/).first());
      } },
    { id: 'issues', chapter: 'The issue register', chapterSub: 'QI Studio · Issues',
      say: 'The matrix suggests issues from its gaps, most severe first, each with a remedy. Missing zones and the missing density are high severity. The depletion risk on Ekene one and Ekene nine\'s limited petrophysics are medium.',
      sub: 'The matrix suggests issues from its gaps, most severe first, each with a remedy. Missing zones and the missing density are high severity. The depletion risk on Ekene-1 and Ekene-9\'s limited petrophysics are medium.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-issues');
        await expectText(d, issue(d, 'Ekene-9: density missing'), /Request the density log/, 'density issue');
        await d.highlight(issue(d, 'Ekene-9: density missing'));
      } },
    { id: 'own',
      say: 'Each issue has an owner and a status: open, resolved or dismissed, and a dismissal sticks, so the register stays honest. For Ekene one, the remedy is to model the depleted state in Rock Physics Studio before reading amplitudes near the well.',
      sub: 'Each issue has an owner and a status: open, resolved or dismissed, and a dismissal sticks, so the register stays honest. For Ekene-1, the remedy is to model the depleted state in Rock Physics Studio before reading amplitudes near the well.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(issue(d, 'seismic after first production'));
      } },
    { id: 'next',
      say: 'The wells are graded. In the next lesson we grade the seismic itself: its bandwidth, its signal to noise and any acquisition footprint.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Seismic QC', body: '<ul><li>Spectra and the -6 dB band</li><li>Signal to noise</li><li>Acquisition footprint</li></ul>' });
      } },
  ],
};
