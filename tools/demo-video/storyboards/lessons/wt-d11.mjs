// Well Testing with Petrolord, Lesson D11: the report. Ekene-5 after its
// match: identification, the report tab's sections, and the PDF.
import { expectText, setupTest, tab, kpi, fill, pick, scrollMain, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-d11',
  ...wtLessonMeta(11, 'D', 'The report', 'Identification, inputs with sources, every method and its limits, and the PDF'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson D11: Ekene-5 report', test: 'e5', tabName: 'Match' });
    await pick(d, 'Reservoir model', /Homogeneous \+ sealing fault/);
    await d.page.getByRole('button', { name: /Auto-fit model/ }).click();
    await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
    await tab(d, 'Data');
  },
  steps: [
    { id: 'ident', chapter: 'Identification', chapterSub: 'Which well, which test',
      say: 'A report starts by saying what it is about. On the Data tab: the well, Ekene-5; the field, Ekene; the analyst; the zone, the Ekene Sand; and the dates of the test.',
      do: async (d) => {
        await fill(d, [[/^Well name/, 'Ekene-5'], [/^Field/, 'Ekene'], [/^Analyst/, 'Petrolord Demo'], [/^Zone or sand/, 'Ekene Sand']], { onCamera: true, pause: 300 });
        await d.sleep(800);
      } },
    { id: 'tab', chapter: 'The Report tab', chapterSub: 'What a reviewer needs',
      say: 'The Report tab holds the headline values with where they came from, then the gauge and pressure basis, the skin components, the model match with its confidence intervals, the straight-line analyses, and a cross-check that sets every method side by side.',
      do: async (d) => {
        await tab(d, 'Report', { onCamera: true });
        for (const y of [0, 600, 1200, 1800]) { await scrollMain(d, y, { ms: 1200 }); await d.sleep(1500); }
      } },
    { id: 'cross', chapter: 'Cross-check', chapterSub: 'Methods side by side',
      say: 'Here the regression reads two hundred and twenty five millidarcies, the Horner line two hundred and seventeen and the MDH line the same. Agreement supports the answer; a spread points at the window or the model.',
      do: async (d) => {
        const c = t(d, 'wts-report-crosscheck'); await c.scrollIntoViewIfNeeded();
        await d.highlight(c); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'limits', chapter: 'Limits', chapterSub: 'What the method assumes',
      say: 'Further down: every input with its source, the flow and shut-in periods, the method and its limits, and every gauge reading used or left out. A report that states its assumptions can be checked.',
      do: async (d) => { for (const y of [2600, 3400, 4200]) { await scrollMain(d, y, { ms: 1200 }); await d.sleep(1600); } } },
    { id: 'pdf', chapter: 'The PDF', chapterSub: 'Six figures',
      say: 'Export P. D. F. writes the same report with six vector figures: the overview, the log-log with the match, the semilog line with its window, the history match and, when they apply, the square root of time and rate transient plots.',
      do: async (d) => {
        await scrollMain(d, 0, { ms: 1000 });
        const b = d.page.getByRole('button', { name: /Export PDF report/i });
        const dl = d.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
        await d.click(b); await dl; await d.sleep(2500);
      } },
  ],
};
