// Material Balance with Petrolord, Lesson A2: data in. The import door on
// the kit's tank history (columns by name, units from the headers, what was
// read), a pasted table in psig with semicolons, the saved table.
import {
  login, expectText, openStudio, deleteCases, createCase, confirmCase, dropFile, saveData, t, TANK, mbalLessonMeta,
} from './mbal-common.mjs';

const PASTE = 'Date;Pressure (psig);Np (MSTB)\n2020-01-01;3185.3;0\n2020-07-01;3023.0;38.864\n2021-01-01;2768.2;99.595';

export default {
  id: 'lesson-mbal-a2',
  ...mbalLessonMeta(2, 'A', 'Data in: *the import door*', 'Columns by name, units from headers, and checking what was read'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson A2/);
    await openStudio(d, shared);
    await createCase(d, 'Lesson A2: Ekene');
    await confirmCase(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'what', chapter: 'What the studio needs', chapterSub: 'One row per survey',
      say: 'The Data tab takes one row per pressure survey, with the initial state first. It needs a pressure; usually a date and the cumulative oil, gas and water; and, if you have them, the formation volume factors and solution gas at each survey. A file, a pasted table or an Excel sheet all come through the same door.',
      do: async (d) => {
        await d.highlight(t(d, 'mbal-data-dropzone'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'paste', chapter: 'A pasted table', chapterSub: 'Gauge pressure and semicolons',
      say: 'Paste a table first, to see the door at work. These columns are split by semicolons, and the pressure is in psig. The door reads the unit from the header and adds the atmospheric pressure, so three thousand one hundred and eighty five point three psig becomes three thousand two hundred psia, as the saved table shows.',
      sub: 'Paste a table first, to see the door at work. These columns are split by semicolons, and the pressure is in psig. The door reads the unit from the header and adds the atmospheric pressure, so 3,185.3 psig becomes 3,200 psia, as the saved table shows.',
      do: async (d) => {
        await d.click('mbal-data-paste-toggle');
        await d.sleep(600);
        await t(d, 'mbal-data-paste').fill(PASTE);
        await d.sleep(1200);
        await d.click('mbal-data-paste-read');
        await t(d, 'mbal-import-mapping').waitFor({ timeout: 30000 });
        await d.sleep(800);
        await expectText(d, 'mbal-import-counts', /3 rows read.*Columns split by semicolon/, 'pasted');
        await d.highlight(t(d, 'mbal-import-row-pressure_psia'));
        await d.sleep(3500);
        await d.unhighlight();
        await d.highlight(t(d, 'mbal-import-counts'));
        await d.sleep(2000);
        await d.unhighlight();
        await saveData(d, { onCamera: true });
        const table = t(d, 'mbal-data-table');
        await expectText(d, table, /2020-01-01\s*3,200\.0/, 'psig to psia');
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        await d.highlight(table.locator('tbody tr').first());
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'file', chapter: 'The tank history', chapterSub: 'Each column found by its name',
      say: 'Now the kit\'s tank history, which replaces those rows. Each column is found by its name, in any order, and each unit is read from its header: psia, stock tank barrels, standard cubic feet. Any column can be placed by hand from the list beside it. Nothing is saved yet.',
      do: async (d) => {
        await dropFile(d, TANK, { onCamera: true });
        await expectText(d, 'mbal-pending-status', /^7 rows read\. Ready to save\.$/, 'rows read');
        await d.highlight(t(d, 'mbal-import-mapping'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'save', chapter: 'Saved to the case', chapterSub: 'The table in display units',
      say: 'Save to case writes the rows. The saved table shows them in the display units, with Np in thousands of barrels and Gp in millions of cubic feet. Each row after the initial state can be left out of the fit with a reason, which Lesson four does. Download CSV gives the table back.',
      do: async (d) => {
        await saveData(d, { onCamera: true });
        const table = t(d, 'mbal-data-table');
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(table);
        await d.sleep(4000);
        await d.unhighlight();
        await d.moveTo(t(d, 'mbal-data-download'));
        await d.sleep(1500);
      } },
    { id: 'other', chapter: 'Other doors', chapterSub: 'Pressures from other apps',
      say: 'Below the table, two more doors bring pressures from other apps by their saved project: the average pressures of a Voidage Replacement Monitor project, and the average pressure from a Well Test Analysis Studio project. Each names its source in the report.',
      do: async (d) => {
        const vrr = d.page.getByText('Pressures from Voidage Replacement Monitor').first();
        await vrr.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.moveTo(vrr);
        await d.sleep(3000);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'PVT and rock',
      say: 'Next, the PVT tab: where the fluid properties come from, and the two compressibilities.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
