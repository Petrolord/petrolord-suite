// QI lesson C10: the ties in QI Studio, the field wavelet, and tie issues.
// Figures from the 2026-10-10 probe (lesson project, ties re-committed after
// #977): Ekene-1 0.60, Ekene-2 0.49, Ekene-3 0.57, Ekene-4 0.52 windowed mean
// correlation, bulk shift 0.0, statistical wavelets 25.4 to 27.5 Hz zero phase;
// every wavelet fits the average at 1.00 with no shift; 6 tie issues: Ekene-2
// poor (high), Ekene-1/3/4 fair (medium), Ekene-8 and Ekene-9 untied.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const issue = (d, text) => d.page.locator('tr').filter({ hasText: text }).first();

export default {
  id: 'lesson-qi-c10',
  ...qiLessonMeta(10, 'C', 'The field wavelet: *every tie in one place*', 'QI Studio gathers the committed ties, compares their wavelets, averages them, and turns weak ties into issues'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 10', chapterSub: 'Module C · Tying the wells',
      say: 'Each well is tied in Seismolord. QI Studio does not re-tie them; it reads every committed tie with its QC record, so the study can see at a glance which wells it can trust, and build one wavelet for the whole field.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 10', title: 'The field wavelet',
        body: '<ul><li>Every committed tie, with its QC</li><li>The wavelets compared and averaged</li><li>Weak ties become issues</li></ul>' }) },
    { id: 'table', chapter: 'The ties', chapterSub: 'QI Studio · Well ties',
      say: 'The well ties tab. Ekene one to four are tied with no bulk shift, each with its statistical wavelet, between twenty five and twenty seven and a half hertz, zero phase. Ekene eight and Ekene nine have no committed tie.',
      sub: 'The well ties tab. Ekene-1 to Ekene-4 are tied with no bulk shift, each with its statistical wavelet, between 25 and 27.5 Hz, zero phase. Ekene-8 and Ekene-9 have no committed tie.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-tab-ties');
        await expectText(d, 'qi-ties-table', /Ekene-1\s*0\.60[\s\S]*0\.0[\s\S]*Ekene-4\s*0\.52[\s\S]*Ekene-9\s*No tie committed/, 'ties table');
        await d.highlight('qi-ties-table');
      } },
    { id: 'corr',
      say: 'The mean correlation is measured in windows down the whole well, which is harder than a single correlation over the zone. Point six on Ekene one, point four nine on Ekene two. On field data, above point seven is good, point five to point seven is fair, and below that needs another look.',
      sub: 'The mean correlation is measured in windows down the whole well, which is harder than a single correlation over the zone. 0.60 on Ekene-1, 0.49 on Ekene-2. On field data, above 0.7 is good, 0.5 to 0.7 is fair, and below that needs another look.',
      do: async (d) => { await d.highlight(d.page.locator('[data-testid="qi-ties-table"] tr').filter({ hasText: 'Ekene-2' }).first()); } },
    { id: 'wavelets', chapter: 'One wavelet', chapterSub: 'Compared, aligned, averaged',
      say: 'The four wavelets are resampled to four milliseconds, aligned by cross-correlation and scaled to unit energy, then averaged. Each fits the average perfectly with no shift needed: the field has one consistent wavelet. That average is the field wavelet the inversions use.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'qi-ties-similarity', /Ekene-1\s*1\.00\s*0\.0[\s\S]*Ekene-4\s*1\.00\s*0\.0/, 'wavelet similarity');
        await t(d, 'qi-ties-wavelets').scrollIntoViewIfNeeded(); await d.sleep(600);
      } },
    { id: 'disagree',
      say: 'When wavelets disagree, in phase or in frequency, that is information: a well with a stretched sonic, a different processing vintage, or a tie that absorbed a timing error. A bad wavelet in the average spreads its error to every well, so the comparison is worth reading before the average is used.',
      do: async (d) => { await d.unhighlight(); await d.highlight('qi-ties-similarity'); } },
    { id: 'issues', chapter: 'Tie issues', chapterSub: 'Into the register',
      say: 'Add tie issues puts the tie QC into the study\'s register. Six of them: Ekene two is a poor tie, high severity; Ekene one, three and four are fair; Ekene eight and nine have none.',
      sub: 'Add tie issues puts the tie QC into the study\'s register. Six of them: Ekene-2 is a poor tie, high severity; Ekene-1, Ekene-3 and Ekene-4 are fair; Ekene-8 and Ekene-9 have none.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-ties-issues');
        await d.click('qi-tab-issues');
        await expectText(d, issue(d, 'Ekene-2: poor tie'), /Mean windowed correlation 0\.49/, 'poor tie issue');
        await d.highlight(issue(d, 'Ekene-2: poor tie'));
      } },
    { id: 'remedy',
      say: 'The remedy points back to lesson eight: a wavelet extracted from the well, with its phase measured, lifted Ekene two\'s windowed correlation from about point five to point six. The register keeps that work visible until someone resolves it.',
      do: async (d) => { await d.unhighlight(); await d.highlight(issue(d, 'Ekene-4: fair tie')); } },
    { id: 'next',
      say: 'With the wells tied and a field wavelet in hand, Module D turns to the prestack gathers.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Next', title: 'Module D: from gathers to angle stacks', body: '<ul><li>Gathers on the worker</li><li>Prestack QC</li><li>Angles and angle stacks</li></ul>' }); } },
  ],
};
