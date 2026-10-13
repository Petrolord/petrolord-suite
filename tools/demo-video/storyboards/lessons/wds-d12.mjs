// Well Design with Petrolord, Lesson D12: the report pack. Ekene-11
// (kickoff 500 ft) with its saved separation scan: the wall plot, the survey
// listing and the anti-collision report, each a PDF drawn in the browser
// from the saved trajectory, shown here page one by page one.
import {
  login, expectText, lessonSite, pickOffsets, runScan, t, tab, wdsLessonMeta, pdfPageDataUrl, download,
} from './wds-common.mjs';

const SITE = 'Lesson D12: Ekene Alpha';

async function showPdf(d, button, name, caption) {
  const file = await download(d, button, name);
  const img = pdfPageDataUrl(file, { width: 1500 });
  await d.slide({ eyebrow: 'Report pack', title: caption, body: `<img src="${img}" style="max-height:760px;max-width:1500px;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.45)"/>` });
}

export default {
  id: 'lesson-wds-d12',
  ...wdsLessonMeta(12, 'D', 'The *report pack*', 'The wall plot, the survey listing and the anti-collision report, from the saved plan'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { pad: true, kop: '500' });
    await tab(d, 'Anti-Collision').click();
    await pickOffsets(d, /^Ekene-(8|9|10|12)\b/);
    await runScan(d);
    await d.page.getByRole('button', { name: /Save run/ }).first().click();
    await d.sleep(3000);
    await tab(d, 'Reports').click();
    await d.sleep(2500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'tab', chapter: 'The Reports tab', chapterSub: 'From the saved trajectory',
      say: 'The Reports tab draws three P. D. F. documents in the browser, all from the saved trajectory and never from an unsaved edit, with the uncertainty from the same error model as the plots.',
      sub: 'The Reports tab draws three PDF documents in the browser, all from the saved trajectory and never from an unsaved edit, with the uncertainty from the same error model as the plots.',
      do: async (d) => {
        await d.sleep(1500);
        await d.highlight(d.page.getByText(/Reports render from the design/).first());
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'wall', chapter: 'The wall plot', chapterSub: 'The page people pin up',
      say: 'The wall plot is the page people pin up: one landscape sheet with the well header, the plan and section views at true scale with the ellipses of uncertainty, the key stations and the targets, drawn as vectors so they stay sharp at any print size.',
      do: async (d) => {
        await showPdf(d, t(d, 'report-wallplot'), 'wallplot.pdf', 'Wall plot: Ekene-11');
        await d.sleep(7000);
        await d.hideSlide();
      } },
    { id: 'listing', chapter: 'The survey listing', chapterSub: 'Every station',
      say: 'The survey listing is the full station table in feet: measured depth, inclination, grid azimuth, true vertical depth, subsea depth, the offsets, dogleg and vertical section, with the header and a summary at total depth.',
      do: async (d) => {
        await showPdf(d, t(d, 'report-listing'), 'listing.pdf', 'Survey listing: Ekene-11');
        await d.sleep(6000);
        await d.hideSlide();
      } },
    { id: 'ac', chapter: 'The anti-collision report', chapterSub: 'From the saved scan',
      say: 'And the anti-collision report is built from a saved scan: the rule and its parameters, the minimum separation factor against each neighbour, the ladder, and every station below the review threshold, here none. It is the evidence the plan was checked, exactly as it was checked.',
      do: async (d) => {
        await showPdf(d, t(d, 'report-ac'), 'ac.pdf', 'Anti-collision report: Ekene-11');
        await d.sleep(7000);
        await d.hideSlide();
      } },
    { id: 'end', chapter: 'Well Design with Petrolord', chapterSub: 'Twelve lessons',
      say: 'That completes the series: a platform and its norths, targets from the geology, the solvers, the uncertainty, the neighbours, the surveys, the pressures and the reports, all on the Ekene field. The data for every lesson is in the Ekene kit linked below.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
