// Petroleum Economics with Petrolord, Lesson A1: cases and the three data
// slots. The case list, a new case, production, capex and opex files, the
// file name rule and templates, reserves scenario tags, and replacing a
// file in place of adding a second one.
import {
  login, expectText, openCases, newCase, upload, deleteCases, fileCard, FILES, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson A1: Ekene';

export default {
  id: 'lesson-epe-a1',
  ...epeLessonMeta(1, 'A', 'Cases and *the three data slots*', 'Production, capex and opex files, scenario tags and replacing a file'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(shared, /^Lesson A1/);
    await openCases(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'list', chapter: 'The case list', chapterSub: 'Your cases and your organisation\'s',
      say: 'Petroleum Economics Studio keeps its work in cases. Each card shows the last run\'s N. P. V. and I. R. R., so the list reads as a table of decisions. A case can be cloned into a what if copy with its data, archived when it is done, and shared with your organisation read only.',
      do: async (d) => {
        const card = d.page.getByText('EPE demo: Ekene with Ekene-11').first();
        if (await card.count()) { await d.moveTo(card); await d.sleep(3500); }
        await d.moveTo(d.page.getByPlaceholder(/Search cases/));
        await d.sleep(2500);
        await d.moveTo(d.page.getByRole('button', { name: /New Case/ }).first());
        await d.sleep(1500);
      } },
    { id: 'new', chapter: 'A new case', chapterSub: 'A name and a description',
      say: 'A new case needs a name, and a description helps whoever opens it next.',
      do: async (d) => {
        await newCase(d, CASE, 'Ekene field with Ekene-11, the kit\'s 2P forecast', { onCamera: true });
      } },
    { id: 'slots', chapter: 'Three slots', chapterSub: 'Production, capex and opex',
      say: 'A case has three slots: production volumes, capital expenditure and operating expenditure. Each takes a C. S. V. file whose name says what it holds, prod, capex or opex, and each offers a template with the columns the engine reads. Production can be field totals or one column per well and stream; costs are U. S. dollars by year.',
      do: async (d) => {
        for (const z of ['Drop Production CSV here', 'Drop CAPEX CSV here', 'Drop OPEX CSV here']) {
          await d.moveTo(d.page.getByText(z).first()); await d.sleep(2200);
        }
        await d.moveTo(d.page.getByText('Download template CSV').first());
        await d.sleep(2500);
      } },
    { id: 'prod', chapter: 'Production', chapterSub: 'One column per well and stream',
      say: 'The Ekene production file has twenty nine years, twenty twenty to twenty forty eight, with oil, gas and water for each of the four producers and for Ekene eleven. The preview shows the first rows before anything is saved.',
      do: async (d) => {
        await upload(d, 'prod', FILES.prod, { onCamera: true, beforeConfirm: async (dd) => {
          const tbl = dd.page.locator('table').last();
          await expectText(dd, dd.page.locator('body'), /16 columns/, 'columns');
          await dd.highlight(tbl); await dd.sleep(4000); await dd.unhighlight();
          const sel = dd.page.locator('select').filter({ has: dd.page.locator('option[value="2P"]') }).first();
          await dd.moveTo(sel); await dd.sleep(800);
          await dd.select(sel, '2P');
          await dd.sleep(600);
        } });
      } },
    { id: 'tags', chapter: 'Scenario tags', chapterSub: '1P, 2P, 3P or your own',
      say: 'Before confirming, the file was tagged two P. Tags are one P, two P, three P or a name of your own. A run prices one scenario at a time, and files with different tags never add together, so a case can hold the low, best and high forecasts side by side.',
      do: async (d) => {
        await d.highlight(fileCard(d, 'ekene-production-2p.csv'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'replace', chapter: 'Replace or add', chapterSub: 'The engine sums every file in a slot',
      say: 'Drop a revised file into the same scenario and the app offers to replace the one already there, ticked by default. Untick it only when the new file adds wells to the old one, because the engine adds together every file a run uses. Here we cancel.',
      do: async (d) => {
        const p = d.page;
        const card = p.locator('div.rounded-lg, div[class*=card]', { has: p.getByText('Production Volumes', { exact: true }) }).filter({ has: p.locator('input[type=file], button:has-text("Upload another")') }).last();
        const again = card.getByRole('button', { name: 'Upload another' });
        if (await again.count()) { await d.click(again.first()); await d.sleep(600); }
        await d.moveTo(p.getByText('Drop Production CSV here').first());
        await card.locator('input[type=file]').first().setInputFiles(FILES.prod);
        await p.getByRole('button', { name: 'Confirm Upload' }).first().waitFor();
        await d.sleep(600);
        const sel = p.locator('select').filter({ has: p.locator('option[value="2P"]') }).first();
        await d.select(sel, '2P');
        await d.sleep(800);
        const rep = p.locator('label', { hasText: /^Replace the/ }).first();
        await expectText(d, rep, /Replace the 1 existing file in the 2P scenario \(recommended\)/, 'replace');
        await d.highlight(rep); await d.sleep(5000); await d.unhighlight();
        await d.click(p.getByRole('button', { name: 'Cancel' }).first());
        await d.sleep(800);
      } },
    { id: 'capex', chapter: 'Costs', chapterSub: 'Capex and opex by year',
      say: 'Capex is two rows: Ekene eleven\'s drilling and completion, eleven point eight million dollars, and its hook up, six hundred thousand, both in twenty twenty seven. The category and item columns are kept for the reader; the engine reads the dollar column.',
      do: async (d) => {
        await upload(d, 'capex', FILES.capex, { onCamera: true, hold: 4500 });
      } },
    { id: 'opex',
      say: 'Opex has fixed and variable columns and their total by year, from twenty twenty to twenty forty eight. The engine reads the total. Every file shows its row count once processed, and Preview opens its first rows again.',
      do: async (d) => {
        await upload(d, 'opex', FILES.opex, { onCamera: true });
        const card = fileCard(d, 'ekene-opex.csv');
        await expectText(d, card, /Processed • 29 rows/, 'opex rows');
        await d.click(card.getByRole('button', { name: 'Preview' }));
        await d.sleep(3500);
      } },
    { id: 'next', chapter: 'Ready to run', chapterSub: 'Next: prices and escalation',
      say: 'The case now holds what a run needs. Next lesson: the prices the run applies, and how they escalate.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
