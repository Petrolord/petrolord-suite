// Well Design with Petrolord, Lesson B7: the plan editor and what Save
// means. The Plan view table (a tie-on and one row per section end, the
// Target column), the Survey listing and its station interval (more rows,
// the same well), Save as the authority everything downstream reads, and
// the export menu.
import { login, expectText, lessonSite, saveDesign, t, wdsLessonMeta } from './wds-common.mjs';

const SITE = 'Lesson B7: Ekene Alpha';
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');

export default {
  id: 'lesson-wds-b7',
  ...wdsLessonMeta(7, 'B', 'The plan editor and *what Save means*', 'One plan in two views, the station listing, Save and the exports'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { kop: '1312.3' });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'plan', chapter: 'The plan editor', chapterSub: 'One plan, two views',
      say: 'The Plan view is the plan as a directional driller reads it: a tie-on row, then one row per section end with measured depth, course length, inclination, azimuth, true vertical depth, the north and east offsets, vertical section and dogleg. It is the same plan as the segments list, so an edit in either shows in both.',
      do: async (d) => {
        await d.sleep(1200);
        await d.click(view(d, 'Plan'));
        await t(d, 'plan-editor').waitFor({ timeout: 30000 });
        await d.sleep(1500);
        await d.highlight(t(d, 'plan-editor'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'target',
      say: 'The last row ends on T1, and the Target column says so: a section end within five feet of a site target shows its name. If an edit moves the end off the target, the name goes.',
      do: async (d) => {
        const last = t(d, 'plan-editor').locator('tr', { hasText: 'T1 Oboro Sand' }).first();
        await expectText(d, last, /T1 Oboro Sand/, 'target column');
        await d.highlight(last);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'survey', chapter: 'The station listing', chapterSub: 'More rows, the same well',
      say: 'The Survey view lists stations every hundred feet. The interval in Design settings only changes how often a station is written: fifty feet doubles the rows and leaves the well, and every number in the strip, exactly where they were.',
      sub: 'The Survey view lists stations every 100 ft. The interval in Design settings only changes how often a station is written: 50 ft doubles the rows and leaves the well, and every number in the strip, exactly where they were.',
      do: async (d) => {
        await d.click(view(d, 'Survey'));
        await t(d, 'design-survey-table').waitFor({ timeout: 30000 });
        await d.sleep(1500);
        const before = (await kpis(d).innerText()).replace(/\s+/g, ' ');
        await d.type(t(d, 'design-station-interval'), '50');
        await t(d, 'design-station-interval').press('Tab');
        await d.sleep(2000);
        const after = (await kpis(d).innerText()).replace(/\s+/g, ' ');
        if (before !== after && !process.env.LENIENT) throw new Error(`KPIs moved with the listing interval: ${before} / ${after}`);
        await d.highlight(t(d, 'design-survey-table'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'save', chapter: 'Save', chapterSub: 'The authority',
      say: 'Then Save. Save writes the segments and the computed stations, and that saved trajectory is what anti-collision, the reports, the exports, publishing and the other drilling apps read. An edit you have not saved is invisible to all of them, deliberately: nothing downstream reports work nobody has committed to.',
      do: async (d) => {
        await saveDesign(d, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'export', chapter: 'Exports', chapterSub: 'Four audiences',
      say: 'Export offers the listing as a table in feet, the trajectory contract with the whole azimuth chain and both coordinate frames for other software, a spreadsheet, and a D. X. F. polyline for whoever draws the platform.',
      sub: 'Export offers the listing as a table in feet, the trajectory contract with the whole azimuth chain and both coordinate frames for other software, a spreadsheet, and a DXF polyline for whoever draws the platform.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Export/ }).first());
        await d.sleep(5500);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Module C',
      say: 'That completes the design. Module C asks how wrong the line might be, and who else is down there.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
