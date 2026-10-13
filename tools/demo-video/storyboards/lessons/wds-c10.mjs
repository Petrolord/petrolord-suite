// Well Design with Petrolord, Lesson C10: actual surveys. Ekene-10's
// definitive survey from the kit's Excel workbook (a header sheet and a
// survey sheet: pick the sheet, check the preview, map the columns), the
// definitive composite and its listing; then Ekene-11's first MWD run to
// 1,500 m MD (seed/wds_assets.mjs, from the kit's Ekene-11 survey) against
// the plan, and the project-ahead to T1.
import path from 'node:path';
import {
  login, expectText, lessonSite, createWellbore, confirmWellbore, treeRow, selectDesign, pick, dialog, t, tab,
  wdsLessonMeta, KIT_DIR,
} from './wds-common.mjs';
import { WDS_ASSETS } from '../../seed/wds.mjs';

const SITE = 'Lesson C10: Ekene Alpha';
const RUN1 = path.join(WDS_ASSETS, 'Ekene-11-mwd-run1.csv');
const btn = (d, name) => d.page.getByRole('button', { name, exact: true }).first();

async function newRun(d, name, file) {
  await d.click(t(d, 'new-survey'));
  const dlg = dialog(d);
  await dlg.getByTestId('survey-name').waitFor();
  await d.sleep(800);
  await d.type(dlg.getByTestId('survey-name'), name);
  await pick(d, dlg.getByText('Source', { exact: true }).locator('..').getByRole('combobox'), /file/i, { onCamera: true });
  const p = await d.moveTo(dlg.getByRole('button', { name: /Choose|file|Browse|Select/i }).first());
  await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
  await dlg.getByTestId('survey-file').setInputFiles(file);
  await d.sleep(2000);
  return dlg;
}

export default {
  id: 'lesson-wds-c10',
  ...wdsLessonMeta(10, 'C', 'Actual *surveys*', 'An Excel survey, the definitive composite, plan versus actual and project ahead'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { kop: '1312.3' });
    await createWellbore(d, SITE, 'Ekene-10', { slot: 'S1' });
    await confirmWellbore(d);
    await treeRow(d, 'Ekene-10').click();
    await d.sleep(1500);
    await tab(d, 'Surveys').click();
    await d.sleep(2000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'workbook', chapter: 'A survey file', chapterSub: 'Ekene-10, from Excel',
      say: 'Ekene ten was drilled from slot one, and the kit has its definitive survey as an Excel workbook. On the Surveys tab, a new run from a file. The importer reads delimited text or Excel, and shows what it parsed before you map anything.',
      sub: 'Ekene-10 was drilled from slot S1, and the kit has its definitive survey as an Excel workbook. On the Surveys tab, a new run from a file. The importer reads delimited text or Excel, and shows what it parsed before you map anything.',
      do: async (d) => {
        await newRun(d, 'Ekene-10 definitive survey', path.join(KIT_DIR, '01-wells/Ekene-10-definitive-survey.xlsx'));
        await d.highlight(dialog(d).getByTestId('survey-preview'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'sheet', chapter: 'The sheet', chapterSub: 'Header, then stations',
      say: 'The first sheet is a header: the operator, the coordinate system and the wellhead. The stations are on the second sheet. Pick it, and the columns are found by their names: measured depth, inclination and azimuth. The depth unit is read from the header too: metres, although Ekene ten is planned in feet. Seventy eight stations to two thousand two hundred and fifty metres.',
      sub: 'The first sheet is a header: the operator, the coordinate system and the wellhead. The stations are on the second sheet. Pick it, and the columns are found by their names: measured depth, inclination and azimuth. The depth unit is read from the header too: metres, although Ekene-10 is planned in feet. 78 stations to 2,250 m.',
      do: async (d) => {
        const dlg = dialog(d);
        await pick(d, dlg.getByTestId('survey-sheet'), /^Definitive Survey/, { onCamera: true });
        await d.sleep(1500);
        await expectText(d, dlg, /78 stations, MD 0\.0 to 2250\.0 m/, 'parsed');
        await d.highlight(dlg.getByTestId('survey-unit-note'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight(dlg.getByText(/78 stations/).first());
        await d.sleep(3000);
        await d.unhighlight();
        await d.click(dlg.getByTestId('survey-save'));
        await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'composite', chapter: 'The definitive composite', chapterSub: 'The deeper run wins',
      say: 'A wellbore\'s first run goes straight into the definitive composite. With several runs, the deeper run wins from its tie-on down. The composite is the well as drilled: it is what anti-collision scans when Ekene ten is somebody else\'s neighbour.',
      sub: 'A wellbore\'s first run goes straight into the definitive composite. With several runs, the deeper run wins from its tie-on down. The composite is the well as drilled: it is what anti-collision scans when Ekene-10 is somebody else\'s neighbour.',
      do: async (d) => {
        await d.highlight(d.page.getByText(/^Definitive composite:/).first());
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'run1', chapter: 'Plan versus actual', chapterSub: 'Ekene-11, first MWD run',
      say: 'Now Ekene eleven is drilling. Its first measurement while drilling run reached one thousand five hundred metres, and comes in as a comma separated file. Each run carries its own azimuth reference and depth unit, because the tool that measured it did.',
      sub: 'Now Ekene-11 is drilling. Its first measurement while drilling run reached 1,500 m, and comes in as a comma separated file. Each run carries its own azimuth reference and depth unit, because the tool that measured it did.',
      do: async (d) => {
        await treeRow(d, 'Ekene-11').click();
        await d.sleep(1500);
        await treeRow(d, 'Plan 1').click().catch(() => {});
        await d.sleep(1500);
        await tab(d, 'Surveys').click();
        await d.sleep(1500);
        const dlg = await newRun(d, 'MWD run 1', RUN1);
        await d.sleep(1000);
        await d.click(dlg.getByTestId('survey-save'));
        await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'compare',
      say: 'Plan versus actual overlays the run on the plan and compares them station by station. At the last survey, four thousand nine hundred and twenty one feet, the hole is a third of a degree steeper than planned, and sits fifteen and a half feet from the plan, most of it to the east.',
      sub: 'Plan versus actual overlays the run on the plan and compares them station by station. At the last survey, 4,921 ft, the hole is a third of a degree steeper than planned, and sits 15.5 ft from the plan, most of it to the east.',
      do: async (d) => {
        await d.click(btn(d, 'Plan vs actual'));
        await d.sleep(3000);
        await d.highlight(d.page.getByText(/^Plan view \(plan vs/).first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'));
        await d.sleep(3500);
        await d.unhighlight();
        const last = d.page.locator('table tbody tr').last();
        await last.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1500);
        await expectText(d, last, /4921\.26\s*22\.36 \/ 74\.61\s*22\.68 \/ 74\.75[\s\S]*15\.46/, 'plan vs actual');
        await d.highlight(last);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'ahead', chapter: 'Project ahead', chapterSub: 'From the last station to T1',
      say: 'Project ahead answers the driller\'s question: from the last station, what single arc still lands on T1? A dogleg of nought point one degrees per hundred feet, dropping slightly, over one thousand seven hundred and two feet, landing at six thousand six hundred and twenty three feet measured depth. On course.',
      sub: 'Project ahead answers the driller\'s question: from the last station, what single arc still lands on T1? A dogleg of 0.10° per 100 ft, dropping slightly, over 1,702 ft, landing at 6,623 ft measured depth. On course.',
      do: async (d) => {
        await d.click(btn(d, 'Project ahead'));
        await d.sleep(1500);
        await pick(d, t(d, 'project-target'), /^T1 Oboro Sand/, { onCamera: true }).catch(() => {});
        await d.sleep(2500);
        await d.moveTo({ x: 1100, y: 650 });
        await expectText(d, t(d, 'project-result'), /Required dogleg 0\.10 deg\/100ft at toolface 189\.9 deg[\s\S]*Arc length 1701\.6 ft, landing at MD 6622\.8 ft with attitude 21\.0 deg inc \/ 73\.9 deg grid azi/, 'project ahead');
        await d.highlight(t(d, 'project-result'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Module D',
      say: 'Surveys as drilled, compared with the plan as designed. Module D hands the plan to the people who drill it: the mud window, the casing seats and the report pack.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
