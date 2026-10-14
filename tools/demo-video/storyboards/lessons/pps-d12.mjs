// Pore Pressure with Petrolord, Lesson D12: the prognosis downstream. Well
// Design Studio's mud window on a planned well beside Ekene-1, Prognosis from
// an offset by subsea depth, reviewing the design against the prognosis, and,
// after a republish, the notice and Keep current values. Site "PPS lesson D12:
// Ekene West" (the Well Design Studio lesson setups only clear "Lesson ...").
import {
  expectText, setupStudio, demoOnePrognosis, importKitFile, buildWestSite, openWestWindow, openStudio, pickWell, setParams, dockTo, t, WELL, WEST, ppsLessonMeta,
} from '../pps-common.mjs';

const W = { ...WEST, site: 'PPS lesson D12: Ekene West' };

export default {
  id: 'lesson-pps-d12',
  ...ppsLessonMeta(12, 'D', 'The prognosis *downstream*', 'Well Design Studio\'s mud window, an offset by subsea depth, and a plan that notices when the prognosis changes'),
  async setup(d, shared) {
    await setupStudio(d, shared);
    await buildWestSite(d, shared, W);
    await openStudio(d, shared);
    await pickWell(d, WELL);
    await demoOnePrognosis(d);
    await importKitFile(d, 'ekene-mdt-pressures.csv');
    await t(d, 'pp-fit-calibration').click();
    await t(d, 'pp-status').filter({ hasText: 'Fitted n' }).waitFor({ timeout: 60000 });
    await importKitFile(d, 'ekene-lot-fit.csv');
    await t(d, 'pp-fit-lot').click(); await d.sleep(1500);
    await t(d, 'pp-publish').click();
    await t(d, 'pp-publish-state').filter({ hasText: 'Published, matches' }).waitFor({ timeout: 60000 });
    await t(d, 'pp-save-project').click(); await d.sleep(2000);
    await openWestWindow(d, shared, { w: W });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'window', chapter: 'Well Design Studio', chapterSub: 'The mud window on a planned well',
      say: 'Ekene West-1 is a planned well beside Ekene-1, with no logs of its own. Its section view carries the mud window: pore and fracture pressure as mud weights against its own true vertical depth, with the trip and kick margins and the casing seats.',
      do: async (d) => {
        await d.highlight(t(d, 'mud-window-panel')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'from', chapter: 'Prognosis from', chapterSub: 'An offset, by subsea depth',
      say: 'Prognosis from lists every registry well with a published prognosis, nearest first. The copy of Ekene-1 sits at the same wellhead, zero feet away; Ekene-8, on the Ekene Alpha platform, is three thousand and twenty five feet away. An offset prognosis is applied at equal subsea depth, which is how pressure carries between neighbours.',
      do: async (d) => {
        await expectText(d, t(d, 'wd-ppfg-source'), /PPS demo: Ekene-1 \(offset, 0 ft away, by TVDSS\)[\s\S]*Ekene-8 \(offset, 3,025 ft away, by TVDSS\)/, 'list');
        await d.highlight(t(d, 'wd-ppfg-source')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'record', chapter: 'Review against it', chapterSub: 'The plan remembers',
      say: 'Until the design records which prognosis it was checked against, a republish would go unnoticed, and the panel says so. Review against this prognosis records it, with the seats as they stand.',
      do: async (d) => {
        await expectText(d, t(d, 'wd-ppfg-review'), /Not recorded with this design yet/, 'not recorded');
        await d.highlight(t(d, 'wd-ppfg-review')); await d.sleep(2500); await d.unhighlight();
        await d.click(t(d, 'wd-ppfg-record'));
        await expectText(d, t(d, 'wd-ppfg-reviewed'), /reviewed against the prognosis on PPS demo: Ekene-1/, 'recorded');
        await d.highlight(t(d, 'wd-ppfg-reviewed')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'change', chapter: 'A republish', chapterSub: 'In Pore Pressure Studio',
      say: 'Back in Pore Pressure Studio, the interpreted line is narrowed to one hundred feet. The chip turns to unpublished changes, and Publish sends the new prognosis to the registry.',
      do: async (d, shared) => {
        await openStudio(d, shared);
        await t(d, 'pp-prognosis-chart').waitFor({ timeout: 120000 });
        await d.sleep(1500);
        await dockTo(d, 'pp-line-window');
        await setParams(d, { 'pp-line-window': '100' }, { onCamera: true });
        await expectText(d, t(d, 'pp-publish-state'), /Unpublished changes/, 'stale');
        await d.highlight(t(d, 'pp-publish-state')); await d.sleep(1500); await d.unhighlight();
        await d.click(t(d, 'pp-publish'));
        await expectText(d, t(d, 'pp-publish-state'), /Published, matches/, 'republished');
        await d.click(t(d, 'pp-save-project'));
        await d.sleep(1200);
      } },
    { id: 'notice', chapter: 'The notice', chapterSub: 'What moved on this trajectory',
      say: 'Ekene West-1 now opens with a notice: the prognosis changed after the design was reviewed against it, when, and what moved on its trajectory: both shoes a little deeper, the first from three thousand nine hundred and forty nine to four thousand two hundred and thirteen feet true vertical depth, the second from four thousand nine hundred and thirteen to five thousand three hundred and twenty three.',
      do: async (d, shared) => {
        await openWestWindow(d, shared, { onCamera: true, w: W });
        await expectText(d, t(d, 'wd-ppfg-source-changed'), /What moved: shoe 1 at least TVD 3,949 ft to 4,213 ft; shoe 2 at least TVD 4,913 ft to 5,323 ft/, 'what moved');
        await d.highlight(t(d, 'wd-ppfg-source-changed')); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'keep', chapter: 'Keep current values', chapterSub: 'A decision, recorded',
      say: 'Here the engineer decides the design stands as it is for now. Keep current values records that this version of the prognosis was seen and set aside, so the notice clears until the prognosis changes again. Either way, the decision is on the record.',
      do: async (d) => {
        await d.click(t(d, 'wd-ppfg-source-changed-keep'));
        await d.sleep(2500);
        await d.highlight(t(d, 'wd-ppfg-review')); await d.sleep(3000); await d.unhighlight();
      } },
  ],
};
