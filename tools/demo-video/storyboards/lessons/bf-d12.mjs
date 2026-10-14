// Basin Modelling with Petrolord, Lesson D12: hand-offs and the report.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, seedModel, t, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson D12: East kitchen';
export default {
  id: 'lesson-bf-d12',
  ...bfLessonMeta(12, 'D', 'Hand-offs *and the report*', 'Prospect Risking, the pressure profile, the PDF report and the CSV'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await seedModel(shared, 'kitchen-run', NAME);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'pressure', chapter: 'Pressure', chapterSub: 'Compaction disequilibrium',
      say: 'The model also estimates pore pressure from burial: where a shale is buried faster than its water can escape, pressure builds above hydrostatic. The Pressure tab shows the profile today, and sends it to Pore Pressure Studio as a reference for the well design.',
      do: async (d) => { await resultsTab(d, 'pressure', { onCamera: true }); await d.sleep(6000); } },
    { id: 'report', chapter: 'The report', chapterSub: 'For the reviewer',
      say: 'Export makes the reviewer report: every input, the deposition and step, the erosion, the calibration with its misfit, the present day by layer, the traps and their charge, and the burial, maturity and events plots. The field and analyst go on its header.',
      do: async (d) => {
        await d.click(t(d, 'bf-export'));
        await t(d, 'bf-report-field').waitFor();
        await d.type(t(d, 'bf-report-field'), 'Ekene');
        await d.type(t(d, 'bf-report-analyst'), 'Basin team');
        await d.sleep(3000);
        await d.page.keyboard.press('Escape');
        await d.sleep(800);
      } },
    { id: 'csv', chapter: 'The data', chapterSub: 'Every layer at every age',
      say: 'The CSV on the Analysis tab writes every layer at every age, in SI and in the display units, for any other tool.',
      do: async (d) => {
        await d.click(t(d, 'bf-tab-results'));
        await t(d, 'bf-results-csv').waitFor();
        await d.sleep(800);
        await d.highlight(t(d, 'bf-results-csv')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'rcp', chapter: 'Prospect Risking', chapterSub: 'The charge factor in Pg',
      say: 'On the Timing tab each trap can be sent to Prospect Risking in ReservoirCalc Pro. Ekene arrives with its fetch area, age, efficiency and source, compared with its twelve point one four million barrels in place, and a charge factor of zero point nine to apply to the prospect\'s chance of success. The prospect keeps the record of where it came from, and Risked Reserves Valuation names the basin model beside it. That closes the series: a well dated and calibrated, a kitchen matured, traps charged, and the numbers carried into the prospect.',
      sub: 'On the Timing tab each trap can be sent to Prospect Risking in ReservoirCalc Pro. Ekene arrives with its fetch area, age, efficiency and source, compared with its 12.14 MMstb in place, and a charge factor of 0.9 to apply to the prospect\'s chance of success. The prospect keeps the record of where it came from, and Risked Reserves Valuation names the basin model beside it. That closes the series: a well dated and calibrated, a kitchen matured, traps charged, and the numbers carried into the prospect.',
      do: async (d) => {
        await resultsTab(d, 'timing', { onCamera: true });
        await t(d, 'bf-trap-result-0').scrollIntoViewIfNeeded();
        await d.click(t(d, 'bf-trap-send-0'));
        await t(d, 'rcp-bf-charge').waitFor({ timeout: 60000 });
        await expectText(d, 'rcp-bf-charge-result', /Suggested charge factor 0\.9/, 'rcp');
        await d.highlight(t(d, 'rcp-bf-charge')); await d.sleep(6000); await d.unhighlight();
      } },
  ],
};
