// Well Testing with Petrolord, Lesson A2: gauge data and quality control.
// Ekene-5's week-long record (seed/wt_assets.mjs): the gauge clock and the
// shut-in, the readings before it, the spike filter, thinning on the log axis.
import { expectText, setupTest, importGauge, fill, kpi, scrollMain, t, FILES, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-a2',
  ...wtLessonMeta(2, 'A', 'Gauge data and *quality control*', 'The gauge clock, the shut-in, spikes and how many points the analysis keeps'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson A2: Ekene-5 gauge', test: 'e5', gauge: false });
    await fill(d, [[/^Shut-in time on the gauge clock/, '']]);
  },
  steps: [
    { id: 'file', chapter: 'A real gauge record', chapterSub: 'Ekene-5, May 2024',
      say: 'A memory gauge records whatever happens while it is in the hole. This one, from Ekene-5, starts a day before the shut-in and runs for a week after it: one hundred and seventy readings, every half hour while the well flowed, then from ten seconds after the shut-in, closer together early and further apart later.',
      do: async (d) => {
        await importGauge(d, FILES.e5, { onCamera: true });
        await expectText(d, t(d, 'wts-import-mapping'), /170 readings loaded/, 'readings');
        await d.highlight(t(d, 'wts-import-mapping')); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'clock', chapter: 'Two clocks', chapterSub: 'Gauge time and test time',
      say: 'With the shut-in time blank, the studio takes hour zero of the file as the shut-in, which is wrong here: the first day is flow. The gauge clock and the test clock are different clocks, and the shut-in is where they meet.',
      do: async (d) => {
        await d.highlight(d.page.getByLabel(/^Shut-in time on the gauge clock/).first()); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'find', chapter: 'Finding the shut-in', chapterSub: 'The steepest change',
      say: 'The studio finds it from the record: the steepest rise in pressure, two point five three p. s. i. in the ten seconds after twenty four hours. The reading at twenty four hours becomes the flowing pressure at shut-in, two thousand and forty point zero, and the forty eight readings before it are set aside from the analysis and kept for the history plot.',
      do: async (d) => {
        await d.click(t(d, 'wts-find-start')); await d.sleep(1500);
        await expectText(d, t(d, 'wts-pwf-readout'), /2040\.0 psi, gauge reading at the shut-in/, 'pwf');
        await expectText(d, d.page.getByText(/readings before the shut-in/).first(), /48 readings before the shut-in \(gauge time 24 hr\) are excluded/, 'before');
        await d.highlight(d.page.getByText(/readings before the shut-in/).first()); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'overview', chapter: 'The overview', chapterSub: 'Flow, then buildup',
      say: 'The overview plots the whole record on the test clock with the rate. Check it every time: a gauge that stopped, a second shut-in, or a well reopened early all show here first.',
      do: async (d) => {
        const ov = d.page.getByText('Test overview').first();
        await ov.scrollIntoViewIfNeeded(); await d.sleep(3500);
        await scrollMain(d, 0);
      } },
    { id: 'thin', chapter: 'Points per decade', chapterSub: 'Thinning on the log axis',
      say: 'Of the one hundred and twenty one buildup readings the analysis keeps sixty one: fifteen per log cycle of time, evenly spread on the log axis the derivative is computed on. A dense gauge can log every second; thinning it this way keeps the early time and stops the late time swamping the fit.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Points used'), /^61/, 'used');
        await d.highlight(kpi(d, 'Points used')); await d.sleep(2000); await d.unhighlight();
        const ppd = d.page.getByLabel(/^Points per decade kept/).first();
        await ppd.scrollIntoViewIfNeeded(); await d.highlight(ppd); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'spikes', chapter: 'The spike filter', chapterSub: 'Outliers out, and counted',
      say: 'The spike filter removes single readings that jump away from their neighbours by more than six robust standard deviations. This record is clean, so it removes none; when it does, the report lists every reading left out and why.',
      do: async (d) => {
        const sw = d.page.getByText('Spike filter', { exact: true }).first();
        await sw.scrollIntoViewIfNeeded(); await d.highlight(sw); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
