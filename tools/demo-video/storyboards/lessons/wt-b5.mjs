// Well Testing with Petrolord, Lesson B5: flow regimes and the radius of
// investigation. Ekene-5 (storage, radial flow, a rise) against Ekene-1
// (radial flow to the end of the test).
import { expectText, setupTest, tab, kpi, t, wtLessonMeta, deleteProjects, openStudio, newProject, pick, fill, importGauge, INPUTS, FILES } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-b5',
  ...wtLessonMeta(5, 'B', 'Flow regimes and *how far a test sees*', 'Storage, radial flow, a boundary, and the radius of investigation'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson B5: Ekene-1 regimes', test: 'e1' });
    await deleteProjects(shared, ['Lesson B5: Ekene-5 regimes']);
    await newProject(d, 'Lesson B5: Ekene-5 regimes');
    await pick(d, 'Test type', 'Pressure buildup');
    // a new project starts from the workspace on screen: clear Ekene-1's typed flowing pressure
    await fill(d, [[/^Flowing pressure at shut-in/, '']]);
    await fill(d, INPUTS.e5.setup); await importGauge(d, FILES.e5); await fill(d, INPUTS.e5.reservoir); await fill(d, INPUTS.e5.completion);
    await tab(d, 'Diagnostics');
  },
  steps: [
    { id: 'storage', chapter: 'Wellbore storage', chapterSub: 'The unit slope',
      say: 'Right after a shut-in the reservoir keeps flowing into the wellbore while the well fills and compresses. Pressure change and derivative climb together on a slope of one. That part of the test describes the wellbore, so it says nothing about the rock.',
      do: async (d) => { await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.15, dy: 0.62 }); await d.sleep(3500); } },
    { id: 'hump', chapter: 'The hump', chapterSub: 'Storage meeting skin',
      say: 'The hump is the hand-over from storage to the reservoir. Its height grows with the skin, so a big hump is the first hint of a damaged well.',
      do: async (d) => { await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.28, dy: 0.38 }); await d.sleep(3000); } },
    { id: 'radial', chapter: 'Radial flow', chapterSub: 'The flat derivative',
      say: 'Then the derivative flattens: infinite-acting radial flow, from zero point eight two to six point one eight hours. Every straight-line method needs this part, and the studio lists where it is.',
      do: async (d) => {
        const r = d.page.locator('div.rounded-md', { hasText: /^Radial flow/ }).first();
        await expectText(d, r, /0\.821 to 6\.18 hr/, 'radial');
        await r.scrollIntoViewIfNeeded(); await d.highlight(r); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'rise', chapter: 'A boundary', chapterSub: 'The derivative rises',
      say: 'After six hours the derivative rises: the pressure has met something it cannot pass. A single sealing fault takes it to twice the plateau, the dashed line; a closed tank sends it up a unit slope; a gas cap or aquifer pulls it down.',
      do: async (d) => {
        const r = d.page.getByText(/Derivative rising after radial flow/).first();
        await r.scrollIntoViewIfNeeded(); await d.highlight(r); await d.sleep(2500); await d.unhighlight();
        await d.page.locator('.recharts-surface').first().scrollIntoViewIfNeeded();
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.85, dy: 0.62 }); await d.sleep(2500);
      } },
    { id: 'ri', chapter: 'Radius of investigation', chapterSub: 'How far the test has seen',
      say: 'The radius of investigation, the square root of k t over nine hundred and forty eight phi mu c t, says how far the pressure has reached. At the end of radial flow it is five hundred and fifty six feet: the boundary is at about that distance. The fault in this earth model is five hundred and thirty three feet away.',
      do: async (d) => {
        await expectText(d, t(d, 'wts-ri-note'), /556 ft at the end of radial flow/, 'ri');
        await d.page.locator('.recharts-surface').first().evaluate(() => {});
        await t(d, 'wts-ri-note').scrollIntoViewIfNeeded(); await d.highlight(t(d, 'wts-ri-note')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'ekene1', chapter: 'No boundary seen', chapterSub: 'Ekene-1, three days',
      say: 'Ekene-1\'s three-day buildup stays flat to the end: radial flow out to one thousand nine hundred and twenty three feet with no boundary in sight. A flat derivative to the end says only that nothing lies within that radius, never that nothing lies beyond it.',
      do: async (d) => {
        await d.click(d.page.getByLabel('Project').first()); await d.sleep(600);
        await d.click(d.page.getByRole('option', { name: 'Lesson B5: Ekene-1 regimes' })); await d.sleep(3000);
        await expectText(d, t(d, 'wts-ri-note'), /1,923 ft by the end of the test/, 'ri e1');
        await d.highlight(t(d, 'wts-ri-note')); await d.sleep(3500); await d.unhighlight();
      } },
  ],
};
