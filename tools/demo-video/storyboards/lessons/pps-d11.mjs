// Pore Pressure with Petrolord, Lesson D11: publish, the CSV and the report.
// Publish to the registry and the publish state, the curves in Well Data
// Manager with their source, Prognosis CSV and the reviewer PDF.
import { expectText, setupStudio, demoOnePrognosis, importKitFile, openStudio, pickWell, units, dockTo, act, t, WELL, ppsLessonMeta } from '../pps-common.mjs';

export default {
  id: 'lesson-pps-d11',
  ...ppsLessonMeta(11, 'D', 'Publish, the CSV *and the report*', 'The registry curves and their provenance, the table for the well plan, and the reviewer PDF'),
  async setup(d, shared) {
    await setupStudio(d, shared, { well: WELL });
    await demoOnePrognosis(d);
    await importKitFile(d, 'ekene-mdt-pressures.csv');
    await t(d, 'pp-fit-calibration').click();
    await t(d, 'pp-status').filter({ hasText: 'Fitted n' }).waitFor({ timeout: 60000 });
    await importKitFile(d, 'ekene-lot-fit.csv');
    await t(d, 'pp-fit-lot').click(); await d.sleep(1500);
  },
  steps: [
    { id: 'state', chapter: 'Not published yet', chapterSub: 'The chip beside Publish',
      say: 'A calibrated prognosis lives in this project until it is published. The chip beside Publish says where things stand: not published, so Well Design Studio and the other readers have nothing from it.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-publish-state'), /Not published/, 'not published');
        await d.highlight(t(d, 'pp-publish-state')); await d.sleep(2000); await d.unhighlight();
        await d.highlight(t(d, 'pp-note-published')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Publish', chapterSub: 'Three curves on the well',
      say: 'Publish writes three curves to the well in the registry: pore pressure, fracture pressure and overburden, on the well\'s own measured depth, with the method, the parameters and the input curves in their provenance. Publishing again from this project replaces them, and nothing else. The chip now reads published, matches.',
      do: async (d) => {
        await d.click(t(d, 'pp-publish'));
        await expectText(d, t(d, 'pp-status'), /Published PP\/FP\/OBG to the well registry/, 'published');
        await expectText(d, t(d, 'pp-publish-state'), /Published, matches/, 'chip');
        await d.highlight(t(d, 'pp-publish-state')); await d.sleep(2000); await d.unhighlight();
        await d.click(t(d, 'pp-save-project'));
        await d.sleep(1500);
      } },
    { id: 'wdm', chapter: 'In the registry', chapterSub: 'Well Data Manager',
      say: 'Well data opens the well in Well Data Manager. The three curves sit beside the logs loaded from the LAS file, marked computed, and their source says which app wrote them, its pipeline version and the day.',
      do: async (d) => {
        await d.click(t(d, 'pp-open-wdm'));
        await t(d, 'wdm-logs-table').waitFor({ timeout: 90000 });
        await d.sleep(2500);
        const row = t(d, 'wdm-log-row').filter({ has: d.page.getByTestId('wdm-log-origin-PP') }).first();
        await row.scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'wdm-log-source-PP'), /Pore Pressure Studio, pp-1\.1\.0/, 'source');
        await d.highlight(t(d, 'wdm-log-source-PP')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'csv', chapter: 'Prognosis CSV', chapterSub: 'The table for the well plan',
      say: 'Back in the studio, Prognosis CSV downloads the profile in the units on screen, pounds per gallon and feet, with equivalent mud weight columns and the reviewer block in its header: the table a well plan or a mud programme starts from.',
      do: async (d, shared) => {
        await openStudio(d, shared);
        await t(d, 'pp-prognosis-chart').waitFor({ timeout: 120000 });
        await units(d, { pressure: 'ppg', ref: 'md' });
        await d.click(t(d, 'pp-export-csv'));
        await expectText(d, t(d, 'pp-status'), /Prognosis CSV in ppg and ft downloaded/, 'csv');
        await d.highlight(t(d, 'pp-status')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'pdf', chapter: 'The report', chapterSub: 'For a reviewer to sign',
      say: 'The PDF is the report a reviewer signs: well, field and analyst, typed in the dock, the build, units and datum, the method, the trend, the calibration, the window and seats, the prognosis plot, and the table. Then the curves on the well, the CSV and the PDF all say the same thing.',
      do: async (d) => {
        await dockTo(d, 'pp-param-field');
        await act(d, true).type(t(d, 'pp-param-field'), 'Ekene');
        await act(d, true).type(t(d, 'pp-param-analyst'), 'Petrolord Demo');
        await d.click(t(d, 'pp-apply-params'));
        await d.sleep(800);
        await d.click(t(d, 'pp-export-pdf'));
        await expectText(d, t(d, 'pp-status'), /Prognosis PDF downloaded/, 'pdf');
        await d.highlight(t(d, 'pp-status')); await d.sleep(2500); await d.unhighlight();
      } },
  ],
};
