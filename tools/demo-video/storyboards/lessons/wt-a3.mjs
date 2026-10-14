// Well Testing with Petrolord, Lesson A3: the inputs and where they come from.
// Ekene-1 again: what each input does to the answer, total compressibility
// built from its parts, and the source of every value carried to the report.
import { expectText, setupTest, fill, pick, tab, scrollMain, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-a3',
  ...wtLessonMeta(3, 'A', 'The inputs, and *where they come from*', 'What each input moves, total compressibility from its parts, and sources in the report'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson A3: Ekene-1 inputs', test: 'e1' });
  },
  steps: [
    { id: 'what', chapter: 'What the inputs do', chapterSub: 'Slope and intercept',
      say: 'A buildup measures a slope and a level. The slope gives k h over mu B: rate, formation volume factor and viscosity enter the permeability directly, and the net thickness divides it. The level gives the skin, through porosity, total compressibility and the wellbore radius, inside a logarithm, so they matter less. Rate, B, mu and h deserve the most care.',
      do: async (d) => {
        for (const re of [/^Rate q/, /^Oil FVF B/, /^Viscosity/, /^Net thickness h/]) { const l = d.page.getByLabel(re).first(); await l.scrollIntoViewIfNeeded(); await d.highlight(l); await d.sleep(1300); await d.unhighlight(); }
        for (const re of [/^Porosity/, /^Total ct/, /^Wellbore radius rw/]) { const l = d.page.getByLabel(re).first(); await d.highlight(l); await d.sleep(900); await d.unhighlight(); }
      } },
    { id: 'ct', chapter: 'Total compressibility', chapterSub: 'Built from its parts',
      say: 'Total compressibility is a sum: the rock, plus each fluid\'s compressibility weighted by its saturation. Switch the entry to components and type them: formation four times ten to the minus six, oil saturation zero point six five with the oil compressibility from the slope of the lab formation volume factor, and water at zero point three five.',
      do: async (d) => {
        await pick(d, 'Total compressibility entry', /Built from components/, { onCamera: true });
        await fill(d, [[/^Formation cf/, '4e-6'], [/^Oil saturation So/, '0.65'], [/^Oil co/, '1.1852e-5'], [/^Water saturation Sw/, '0.35'], [/^Water cw/, '3e-6'], [/^Gas saturation Sg/, '0']], { onCamera: true, pause: 200 });
        await d.sleep(800);
      } },
    { id: 'ctsum',
      say: 'The studio adds them up and says so: one point two eight times ten to the minus five per p. s. i., the value the analysis now uses, and the report prints each part beside it.',
      do: async (d) => {
        await expectText(d, t(d, 'wts-ct-readout'), /= 1\.28e-5 1\/psi\. The analysis uses this value\./, 'ct');
        await d.highlight(t(d, 'wts-ct-readout')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'sources', chapter: 'Where each value came from', chapterSub: 'Carried to the report',
      say: 'Every input can carry its source. The viscosity and the formation volume factor come from the Ekene P. V. T. lab table at the test pressure, so they are marked measured, with a note. A reviewer reading the report sees which numbers were measured and which were assumed.',
      do: async (d) => {
        const sec = t(d, 'wts-input-sources');
        await sec.scrollIntoViewIfNeeded(); await d.click(sec.locator('button').first()); await d.sleep(1000);
        await pick(d, 'Viscosity mu source', /Measured \(lab\)/, { onCamera: true });
        await fill(d, [[/^Viscosity mu note/, 'PVT lab table at 2112 psia']], { onCamera: true });
        await pick(d, 'Formation volume factor source', /Measured \(lab\)/, { onCamera: true });
        await fill(d, [[/^Formation volume factor note/, 'PVT lab table at 2112 psia']], { onCamera: true });
        await d.sleep(800);
      } },
    { id: 'report', chapter: 'In the report', chapterSub: 'Value, unit, source',
      say: 'On the Report tab the inputs table lists every value with its unit and its source, and says which inputs the oil analysis actually uses.',
      do: async (d) => {
        await tab(d, 'Report', { onCamera: true });
        const tbl = d.page.getByText('Reservoir and fluid inputs', { exact: false }).first();
        await tbl.scrollIntoViewIfNeeded(); await d.sleep(800);
        await expectText(d, d.page.locator('tr', { hasText: 'Oil viscosity mu_o' }).first(), /Measured \(lab\)/, 'source');
        await d.highlight(d.page.locator('tr', { hasText: 'Oil viscosity mu_o' }).first()); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
