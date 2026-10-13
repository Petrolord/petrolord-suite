// Material Balance with Petrolord, Lesson E12: the report and the handoffs
// (Ekene). Report details (identification, datum, input sources), the
// volumetric estimate taken from ReservoirCalc Pro by id, the methods table,
// the PDF and CSV, and the cross-check in ReservoirCalc Pro.
import {
  login, expectText, deleteCases, seedCase, t, tab, RCP_PROJECT, mbalLessonMeta,
} from './mbal-common.mjs';

const source = (d, i) => d.page.locator('[data-testid^="mbal-source-"]').nth(i);
async function pickSource(d, i, label) {
  await d.click(source(d, i).getByRole('combobox').first());
  await d.sleep(400);
  await d.click(d.page.getByRole('option', { name: label }).first());
  await d.sleep(400);
}

export default {
  id: 'lesson-mbal-e12',
  ...mbalLessonMeta(12, 'E', 'The report and *the handoffs*', 'Sources stated, the volumetric cross-check, the PDF and ReservoirCalc Pro'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson E12/);
    await seedCase(d, shared, 'Lesson E12: Ekene');
    await d.click(tab(d, 'Report'));
    await t(d, 'mbal-report-tab').waitFor({ timeout: 60000 });
    await d.sleep(1500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'what', chapter: 'The report', chapterSub: 'For a reviewer',
      say: 'The Report tab writes a PDF of the last run for a reviewer: every input with its unit and source, the data used and left out, the results, the in-place volume by each method, the drive indices, the limits of the method and the plots. The series CSV carries every number per survey. A run made before an input changed is not exported.',
      do: async (d) => {
        await d.highlight(t(d, 'mbal-export-pdf').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'details', chapter: 'Report details', chapterSub: 'Identification and datum',
      say: 'Report details holds what only the report needs, so saving them leaves the run current. The zone, the analyst, and the pressure datum: the depth the surveys refer to. The app applies no correction to datum, and the report says so.',
      do: async (d) => {
        await d.type(t(d, 'mbal-id-zone'), 'Ekene Sand').catch(async () => {});
        await d.type(t(d, 'mbal-id-analyst'), 'Lesson E12').catch(async () => {});
        const datum = d.page.getByText('PRESSURE DATUM', { exact: false }).first();
        await datum.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        const depth = d.page.locator('[data-testid^="mbal-datum-depth"], [data-testid="mbal-datum-datum_depth_ft"]').first();
        if (await depth.count()) { const i = (await depth.locator('input').count()) ? depth.locator('input').first() : depth; await d.type(i, '5036'); await i.press('Tab'); }
        await d.sleep(1500);
      } },
    { id: 'sources', chapter: 'Input sources', chapterSub: 'Measured, correlation, offset or assumed',
      say: 'Then the source of each input: measured, from a correlation, borrowed from an offset well, or assumed, with a note on its quality. The report prints it beside the value. For Ekene the initial pressure and the PVT were measured, and the rock compressibility came from core.',
      do: async (d) => {
        const sec = d.page.getByText(/INPUT SOURCES AND QUALITY/i).first();
        await sec.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await d.sleep(1000);
        await pickSource(d, 0, 'Measured (lab)');
        await pickSource(d, 4, 'Measured (lab)');
        await pickSource(d, 8, 'Measured (lab)');
        await d.click('mbal-study-save');
        await d.sleep(1500);
        await expectText(d, d.page.locator('main').last(), /INPUT SOURCES AND QUALITY \(3 OF 13 STATED\)/i, 'three stated');
      } },
    { id: 'volumetric', chapter: 'The volumetric estimate', chapterSub: 'From ReservoirCalc Pro, by id',
      say: 'The volumetric estimate is taken from a saved ReservoirCalc Pro project by its id, never typed. Twelve point one four million stock tank barrels, with its project, method and date recorded.',
      sub: 'The volumetric estimate is taken from a saved ReservoirCalc Pro project by its id, never typed. 12.14 million stock tank barrels, with its project, method and date recorded.',
      do: async (d) => {
        await d.click('mbal-volumetric-from-rcp');
        await t(d, 'mbal-volumetric-project').waitFor({ timeout: 30000 });
        await d.select(t(d, 'mbal-volumetric-project'), { label: RCP_PROJECT });
        await d.sleep(600);
        await d.click('mbal-volumetric-take');
        await d.waitText('mbal-volumetric-value', /12\.14 MMSTB/);
        await d.highlight(t(d, 'mbal-volumetric'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'methods', chapter: 'By each method', chapterSub: 'One table',
      say: 'The report puts every route to the oil in place in one table: the Havlena-Odeh slope, the Campbell level and the volumetric estimate, with the difference of each from the headline and its basis.',
      do: async (d) => {
        const tbl = d.page.locator('table').filter({ hasText: 'Campbell level' }).first();
        await expectText(d, tbl, /Volumetric estimate\s*12\.14 MMSTB\s*\+0\.0%/, 'methods table');
        await tbl.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(tbl);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'pdf', chapter: 'The PDF', chapterSub: 'Summary first',
      say: 'Export PDF writes the report, with a one page summary at the front for the reader who reads one page, and the full report after it.',
      do: async (d) => {
        const btn = t(d, 'mbal-export-pdf');
        await btn.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        const dl = d.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
        await d.click(btn);
        await dl;
        await d.sleep(2000);
      } },
    { id: 'rcp', chapter: 'The cross-check', chapterSub: 'In ReservoirCalc Pro',
      say: 'Last, the handoff the other way. From the Run tab, the cross-check opens ReservoirCalc Pro on the project the volumetric estimate came from, and prints the material balance beside it. The two agree. EOR Screening reads the same run by id.',
      do: async (d) => {
        await d.click(tab(d, 'Run'));
        await d.sleep(1200);
        await d.moveTo(t(d, 'mbal-send-eor'));
        await d.sleep(1200);
        await d.click('mbal-send-rcp');
        await d.waitText('rcp-mbal-check-values', /agree/, { timeout: 90000 });
        await d.sleep(800);
        await d.highlight(t(d, 'rcp-mbal-check'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'end', chapter: 'Material Balance with Petrolord', chapterSub: 'Twelve lessons',
      say: 'That completes the series: three reservoirs, the data, the PVT, the line, the aquifer, the contacts, the injection and the report. The data for every lesson is in the Ekene kit linked below.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
