// Well Testing with Petrolord, Lesson A1: the workspace and a first buildup.
// The kit's Ekene-1 buildup of February 2025: a project, the six tabs, the
// test setup, the gauge file, and why the flowing pressure at shut-in is typed.
import { expectText, setupTest, importGauge, fill, tab, kpi, railRow, t, FILES, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-a1',
  ...wtLessonMeta(1, 'A', 'The workspace and *a first buildup*', 'A project, six tabs, the test setup and Ekene-1\'s February 2025 buildup'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson A1: Ekene-1 buildup', test: 'e1', gauge: false, inputs: false });
  },
  steps: [
    { id: 'tour', chapter: 'Well Test Analysis Studio', chapterSub: 'Six tabs, one test',
      say: 'Well Test Analysis Studio reads one test at a time. On the left, the inputs for the tab you are on; in the middle, the plots and results; on the right, a summary that follows you across the tabs. The six tabs run in the order a test is read: the data, the diagnostics, the model match, the straight-line plots, rate transient analysis, and the report.',
      do: async (d) => {
        await d.sleep(1500);
        for (const n of ['Data', 'Diagnostics', 'Match', 'Specialized', 'RTA', 'Report']) { await d.moveTo(d.page.getByRole('tab', { name: n })); await d.sleep(800); }
        await d.moveTo(d.page.getByText('Test', { exact: true }).last()); await d.sleep(1500);
      } },
    { id: 'project', chapter: 'A project', chapterSub: 'Saved as you work',
      say: 'Work lives in a project. This one is called Lesson A1, Ekene-1 buildup; the studio saves it ten seconds after each change, and the button at the top saves it at once.',
      do: async (d) => {
        await d.highlight(d.page.getByLabel('Project').first()); await d.sleep(2500); await d.unhighlight();
        await d.moveTo(d.page.getByRole('button', { name: /Save/ }).first()); await d.sleep(1500);
      } },
    { id: 'setup', chapter: 'The test setup', chapterSub: 'Ekene-1, February 2025',
      say: 'The test is Ekene-1\'s pressure buildup, run for the static survey of February twenty twenty five. A buildup needs a producing time: the well had made one hundred and two thousand barrels at thirty five point eight eight a day, which is sixty eight thousand five hundred and ten hours of Horner\'s equivalent time.',
      do: async (d) => {
        await d.highlight(d.page.getByLabel('Test type').first()); await d.sleep(1500); await d.unhighlight();
        await fill(d, [[/^Producing time tp/, '68510']], { onCamera: true });
        await d.sleep(800);
      } },
    { id: 'import', chapter: 'The gauge file', chapterSub: 'Ninety seven readings',
      say: 'The kit\'s gauge file has ninety seven readings, from a hundredth of an hour to seventy two hours after the shut-in. The columns are found from their headers.',
      do: async (d) => {
        await importGauge(d, FILES.e1, { onCamera: true });
        await expectText(d, t(d, 'wts-import-mapping'), /97 readings loaded/, 'readings');
        await d.highlight(t(d, 'wts-import-mapping')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'pwf', chapter: 'The flowing pressure at shut-in', chapterSub: 'Type it when the file starts late',
      say: 'The file starts thirty six seconds after the shut-in, so it does not hold the flowing pressure at the instant the well was closed. Left blank, the studio would take the first reading and withhold the skin, because that reading has already built up. The survey report gives it: two thousand and eighty six point six eight four p. s. i.',
      do: async (d) => {
        await expectText(d, d.page.getByText(/Skin is withheld/).first(), /Skin is withheld: enter the flowing pressure at shut-in/, 'withheld');
        await d.highlight(d.page.getByText(/Skin is withheld/).first()); await d.sleep(2500); await d.unhighlight();
        await fill(d, [[/^Flowing pressure at shut-in/, '2086.684']], { onCamera: true });
        await expectText(d, t(d, 'wts-pwf-readout'), /2086\.7 psi, entered/, 'pwf');
      } },
    { id: 'reservoir', chapter: 'Rock and fluid', chapterSub: 'From the kit\'s inputs sheet',
      say: 'The rock and fluid properties come from the kit\'s inputs sheet, each with its source: thirty one and a half feet of net pay, a porosity of zero point two, the twelve and a quarter inch hole, the total compressibility, the oil\'s formation volume factor and viscosity at the test pressure, the rate, and the reservoir pressure. Lesson A3 is about where each of them comes from.',
      do: async (d) => {
        await fill(d, [[/^Net thickness h/, '31.50'], [/^Porosity/, '0.2'], [/^Wellbore radius rw/, '0.5104'], [/^Total ct/, '1.2749e-5'],
          [/^Oil FVF B/, '1.2157'], [/^Viscosity/, '1.7962'], [/^Rate q/, '35.88'], [/^Initial pressure pi/, '2112.25']], { onCamera: true, pause: 150 });
        await d.sleep(800);
      } },
    { id: 'first', chapter: 'A first answer', chapterSub: 'Already on the right',
      say: 'Already the right-hand summary has a first reading from the semilog line on the radial flow it found: a k h of seven thousand and thirty millidarcy feet, which is two hundred and twenty three millidarcies over the thirty one and a half feet. The next lessons earn that number properly.',
      do: async (d) => {
        await expectText(d, railRow(d, 'kh \\(md·ft\\)'), /7,030/, 'kh');
        await d.highlight(railRow(d, 'kh \\(md·ft\\)')); await d.sleep(3000); await d.unhighlight();
      } },
  ],
};
