// Volumetrics with Petrolord, Lesson D11: reports and exports.
// The booked case saved as "Lesson D11 Ekene booked case": report details
// (field, analyst, company, licence, well control, the source of each input
// group), the 16:9 presentation slide, the full PDF (first page shown as it
// downloads), the PNG, and the result units.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, deleteProjects, saveProject, rcpLessonMeta,
} from './rcp-common.mjs';

const PROJECT = 'Lesson D11 Ekene booked case';
const OUT = '/tmp/claude-0/rcpv/d11';

export default {
  id: 'lesson-rcp-d11',
  ...rcpLessonMeta(11, 'D', 'Reports and *exports*', 'Report details, the slide, the PDF a reviewer signs, and the units'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await deleteProjects(d, PROJECT);
    await bookedCase(d);
    await stoiip(d);
    await saveProject(d, PROJECT);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'details', chapter: 'Report details', chapterSub: 'Who, where and from what',
      say: 'A volume goes to a reviewer, so the report must say who made it and from what. Project settings hold the field and the analyst; under them, the company, the licence, the well control, and the source of each group of inputs.',
      do: async (d) => {
        await d.type('rcp-report-field', 'Ekene');
        await d.type('rcp-report-analyst', 'Lesson D11');
        await d.click(t(d, 'rcp-report-more').locator('summary'));
        await d.sleep(500);
        await d.type('rcp-report-company', 'Petrolord demonstration data');
        await d.type('rcp-report-licence', 'Block EK-11');
        await d.type('rcp-report-well', 'Ekene-1 to Ekene-6');
      } },
    { id: 'sources',
      say: 'The structure comes from the booked six well maps and the contact the pressure gradients confirm; the rock properties from signed off cutoffs and core; the formation volume factor from the laboratory.',
      do: async (d) => {
        await d.type('rcp-report-source-structure', 'Booked six-well maps; OWC from logs and MDT gradients');
        await d.type('rcp-report-source-petrophysics', 'Signed-off cutoffs; core-checked porosity');
        await d.type('rcp-report-source-fluids', 'PVT laboratory Bo at initial pressure');
        await stoiip(d);
      } },
    { id: 'slide', chapter: 'The slide', chapterSub: 'Ready for a presentation',
      say: 'View full results opens the presentation slide: sixteen by nine, with the volume, the chain from rock to oil and the project, ready to paste into a deck with Copy image, or to save with Download P N G.',
      sub: 'View full results opens the presentation slide: 16:9, with the volume, the chain from rock to oil and the project, ready to paste into a deck with Copy image, or to save with Download PNG.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await dialog(d).getByText('Volumetric Chain').waitFor({ timeout: 30000 });
        await expectText(d, dialog(d), new RegExp(`${PROJECT}[\\s\\S]*12\\.14`), 'slide');
        await d.sleep(2500);
        await d.highlight(dialog(d).getByRole('button', { name: /Download PNG/ }));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'pdf', chapter: 'The PDF', chapterSub: 'A report a reviewer can sign',
      say: 'Full P D F writes the report. It carries the field, the analyst, the build of the app, the units, the method, the contacts with their datum, how the surfaces were integrated, the open closure note, and every input with its source.',
      sub: 'Full PDF writes the report. It carries the field, the analyst, the build of the app, the units, the method, the contacts with their datum, how the surfaces were integrated, the open closure note, and every input with its source.',
      do: async (d) => {
        fs.mkdirSync(OUT, { recursive: true });
        const [dl] = await Promise.all([
          d.page.waitForEvent('download', { timeout: 60000 }),
          d.click(dialog(d).getByRole('button', { name: /Full PDF/ })),
        ]);
        const f = `${OUT}/report.pdf`;
        await dl.saveAs(f);
        const text = execFileSync('pdftotext', ['-layout', f, '-']).toString();
        if (!/Ekene/.test(text) || !/5,036/.test(text) || !/Block EK-11/.test(text)) {
          const msg = `Narration mismatch at "PDF contents": ${text.slice(0, 400)}`;
          if (process.env.LENIENT) console.log('MISMATCH', msg); else throw new Error(msg);
        }
        execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', f, `${OUT}/page`]);
        const png = fs.readdirSync(OUT).find((n) => n.startsWith('page') && n.endsWith('.png'));
        const b64 = fs.readFileSync(`${OUT}/${png}`).toString('base64');
        await d.slide({ eyebrow: 'Full PDF · page 1', title: 'The report, as downloaded', body: '<ul><li>Field, analyst, company, licence</li><li>Method, units, contacts with datum</li><li>Inputs with their sources</li><li>Open closure stated</li></ul>', side: `<img src="data:image/png;base64,${b64}" style="height:860px;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.5)"/>` });
        await d.sleep(6000);
        await d.hideSlide();
      } },
    { id: 'units', chapter: 'Units on the page', chapterSub: 'Display units for the result',
      say: 'In the detailed view, the volume can be shown in stock tank barrels, millions of barrels or cubic metres. The display changes; the number underneath does not.',
      do: async (d) => {
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        await d.sleep(1200);
        const sel = d.page.locator('button[role=combobox]:has-text("STB")').last();
        await sel.scrollIntoViewIfNeeded();
        await d.click(sel);
        await d.sleep(800);
        const opt = d.page.getByRole('option', { name: /MMSTB/ }).first();
        await d.click(opt);
        await d.sleep(1500);
        await expectText(d, t(d, 'rcp-stooip-full'), /12\.14/, 'MMSTB display');
        await d.highlight(t(d, 'rcp-stooip-full'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Projects, sharing and the chain',
      say: 'The last lesson keeps the work: projects, sharing with the team, source changed notices, and the links to the other apps.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
