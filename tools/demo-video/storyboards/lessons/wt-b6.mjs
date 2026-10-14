// Well Testing with Petrolord, Lesson B6: the straight lines. Ekene-1:
// Horner on the radial flow (k, skin, p*), the window, MDH as a check, and
// why a short producing time breaks MDH.
import { expectText, setupTest, tab, kpi, fill, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-b6',
  ...wtLessonMeta(6, 'B', 'Horner, MDH and *p star*', 'Straight lines on the radial flow, the window, and what each line gives'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson B6: Ekene-1 straight lines', test: 'e1', tabName: 'Specialized' });
  },
  steps: [
    { id: 'horner', chapter: 'The Horner plot', chapterSub: 'Pressure against log of the time ratio',
      say: 'In radial flow the buildup pressure is a straight line against the log of Horner\'s time ratio, t p plus delta t over delta t. The slope m gives k h; the line at one hour gives the skin; and the line carried to a ratio of one, infinite shut-in time, gives p star.',
      do: async (d) => { await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.5, dy: 0.5 }); await d.sleep(4000); } },
    { id: 'auto', chapter: 'The window', chapterSub: 'Where the derivative is flat',
      say: 'With no window typed, the line sits on the radial flow the derivative found: two hundred and twenty three millidarcies and a skin of four point nine zero. The blue points are the fitted ones.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Permeability k'), /^223/, 'k auto');
        await expectText(d, kpi(d, 'Skin'), /^4\.90/, 'skin auto');
        await d.highlight(t(d, 'wts-semilog-auto')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'window', 
      say: 'The kit\'s episode uses the window from one hour to the end of the test. Typed in: two hundred and twenty five millidarcies, skin four point nine eight, and p star two thousand one hundred and twelve point three p. s. i., the February survey pressure. The rock is two hundred and fifty millidarcies; the test sees the permeability to oil, times the oil end point of zero point nine.',
      do: async (d) => {
        await fill(d, [[/^From/, '1'], [/^To/, '72']], { onCamera: true });
        await expectText(d, kpi(d, 'Permeability k'), /^225/, 'k');
        await expectText(d, kpi(d, 'Skin'), /^4\.98/, 'skin');
        await expectText(d, kpi(d, 'p\\*'), /^2112\.3/, 'pstar');
        await d.highlight(kpi(d, 'p\\*')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'mdh', chapter: 'MDH', chapterSub: 'Pressure against log delta t',
      say: 'Miller, Dyes and Hutchinson plot the buildup against log delta t alone. It gives the same k and skin while delta t is small beside t p, here seventy two hours beside sixty eight thousand, and no p star. The cross-check agrees.',
      do: async (d) => {
        await d.click(t(d, 'wts-semilog-kind-mdh')); await d.sleep(1500);
        const c = t(d, 'wts-mdh-buildup');
        await c.scrollIntoViewIfNeeded();
        await expectText(d, c, /225/, 'mdh k');
        await d.highlight(c); await d.sleep(3500); await d.unhighlight();
        await d.click(t(d, 'wts-semilog-kind-horner')); await d.sleep(800);
      } },
    { id: 'short', chapter: 'When MDH bends', chapterSub: 'A short flow period',
      say: 'After a short flow period, a drill stem test or a clean-up, delta t soon matches t p and the MDH line bends. The card says how far the window reaches into t p, and when it passes a tenth, trust Horner or the superposition line of Module D.',
      do: async (d) => { await d.highlight(t(d, 'wts-mdh-buildup')); await d.sleep(4000); await d.unhighlight(); } },
  ],
};
