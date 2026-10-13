// Material Balance with Petrolord, Lesson A3: PVT and rock. Rows first,
// what the correlations would have given (Standing Rs at the bubble point
// against the rows' 400 scf/stb), the table source, the Fluid Systems
// Studio door and the compressibilities.
import {
  login, expectText, deleteCases, seedCase, setPvt, t, tab, mbalLessonMeta,
} from './mbal-common.mjs';

export default {
  id: 'lesson-mbal-a3',
  ...mbalLessonMeta(3, 'A', 'PVT and rock: *where the numbers come from*', 'Row PVT, correlations, tables and the compressibilities'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson A3/);
    await seedCase(d, shared, 'Lesson A3: Ekene', { pvt: { api: '32', salinity: '35000', cf: null, cw: null }, run: false });
    await d.click(tab(d, 'PVT'));
    await t(d, 'mbal-pvt-cf').waitFor({ timeout: 60000 });
    await d.sleep(1500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'engine', chapter: 'The PVT tab', chapterSub: 'What the correlations start from',
      say: 'The PVT tab starts from the case: temperature, bubble point and initial pressure, which are changed with Edit case. The source decides how the engine gets the fluid properties at each survey.',
      do: async (d) => {
        await d.highlight(d.page.getByText('CORRELATION ENGINE', { exact: false }).first().locator('xpath=ancestor::div[contains(@class,"space-y")][1]'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'rows', chapter: 'Rows first', chapterSub: 'The data carry their own PVT',
      say: 'The Ekene rows carry their own formation volume factor and solution gas, and the engine always uses a row\'s own values first. The correlations here only fill in what a row leaves blank, and the tab says so.',
      do: async (d) => {
        const note = t(d, 'mbal-pvt-rows-first');
        await expectText(d, note, /The data rows carry their own Bo and Rs/, 'rows first');
        await d.highlight(note);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'preview', chapter: 'What the correlations say', chapterSub: 'Standing at the bubble point',
      say: 'Recalculate, and the preview shows what the selected correlations give. For the Ekene oil, thirty two degrees API, Standing puts the solution gas at four hundred and twenty two standard cubic feet per barrel above the bubble point, where the Ekene lab measured four hundred. Had the rows carried no PVT, the balance would have run on these numbers instead. That is why measured PVT belongs on the rows or in the table.',
      do: async (d) => {
        const table = d.page.getByText('PVT PREVIEW TABLE', { exact: false }).first().locator('xpath=ancestor::div[contains(@class,"space-y") or contains(@class,"rounded")][1]');
        await d.click(d.page.getByRole('button', { name: /Recalculate PVT Table/ }));
        await d.sleep(1500);
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await expectText(d, d.page.locator('main').last(), /2052\s*1\.2506\s*422/, 'Standing Rs above Pb');
        await d.highlight(d.page.getByText('2052', { exact: true }).first().locator('xpath=ancestor::tr[1]'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'fluid', chapter: 'Other sources', chapterSub: 'A table, or a Fluid Systems Studio project',
      say: 'Two other sources. A PVT table typed or pasted here, from the lab or built from correlations and named as such in the report. Or a saved Fluid Systems Studio project, taken by its id, which is refused if its table does not cover the pressures of the case.',
      do: async (d) => {
        const src = d.page.getByRole('combobox').filter({ hasText: 'Correlated' }).first();
        await src.scrollIntoViewIfNeeded();
        await d.click(src);
        await d.sleep(500);
        await d.click(d.page.getByRole('option', { name: 'PVT table' }));
        await d.sleep(1200);
        const intake = t(d, 'mbal-pvt-intake');
        await intake.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(intake);
        await d.sleep(4500);
        await d.unhighlight();
        const back = d.page.getByRole('combobox').filter({ hasText: 'PVT table' }).first();
        await back.scrollIntoViewIfNeeded();
        await d.click(back);
        await d.sleep(500);
        await d.click(d.page.getByRole('option', { name: 'Correlated' }));
        await d.sleep(800);
      } },
    { id: 'rock', chapter: 'Rock and water', chapterSub: 'The compressibilities',
      say: 'Last, the rock and water compressibilities. Left blank, the engine uses its defaults, shown in grey. For Ekene: four millionths per psi for the rock, measured on core, and three for the water. Save, and the next run uses them.',
      do: async (d) => {
        const cf = t(d, 'mbal-pvt-cf');
        await cf.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await setPvt(d, { api: null, salinity: null }, { onCamera: true });
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'The straight line',
      say: 'Next, the run, and the straight line of Havlena and Odeh.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
