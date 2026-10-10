// QI lesson E14: AVO at the wells. The AVO volumes of lesson E13 are computed
// off camera in setup. Figures from the 2026-10-10 runs (ties re-committed
// after #977): scale 1.72e3 from 4 wells, class agrees at 4 of them; model
// against seismic A, B: Ekene-1 0.253, -0.618 / 0.284, -0.625 (misfit 0.031);
// Ekene-2 0.243 / 0.291 (0.051); Ekene-3 0.267, -0.72 / 0.274, -0.728 (0.009);
// Ekene-4 0.286, -0.568 / 0.308, -0.521 (0.051); Ekene-9 no published gather.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';
import { clearProductVolumes } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const pick = async (d, id, name) => {
  const opts = await d.page.getByTestId(id).locator('option').allInnerTexts();
  await d.page.getByTestId(id).selectOption({ label: opts.find((o) => o.includes(name)) });
};

export default {
  id: 'lesson-qi-e14',
  ...qiLessonMeta(14, 'E', 'AVO at the wells: *is the seismic telling the truth?*', 'Comparing intercept and gradient from the seismic with the rock physics model at every well'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await clearProductVolumes(d, shared);
    await lessonProject(d, shared);
    await d.page.getByTestId('qi-tab-avo').click(); await d.sleep(2000);
    for (const [k, n, a] of [[0, 'near', 10], [1, 'mid', 20], [2, 'far', 30]]) {
      await pick(d, `qi-avo-stack-${k}`, n);
      await d.page.getByTestId(`qi-avo-angle-${k}`).fill(String(a));
    }
    await d.page.getByTestId('qi-avo-run').click();
    await d.page.locator('[data-testid="qi-avo-runs"] >> text=Ready: open in Seismolord').first().waitFor({ timeout: 1800000 });
    await d.sleep(2000);
    await d.page.getByTestId('qi-avo-wells').scrollIntoViewIfNeeded();
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 14', chapterSub: 'Module E · AVO on the seismic',
      say: 'Last lesson made intercept and gradient volumes. They look convincing, but an attribute volume is a hypothesis until it is checked where we know the answer: at the wells. If the seismic\'s intercept and gradient at a well match what the rock physics predicts there, we can believe them between the wells.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 14', title: 'AVO at the wells',
        body: '<ul><li>An attribute volume is a hypothesis</li><li>Check it where the answer is known</li><li>Model against seismic, well by well</li></ul>' }) },
    { id: 'how', chapter: 'What is compared', chapterSub: 'Model, seismic, one scale',
      say: 'On one side, the gather Rock Physics Studio published for each well, with its modelled intercept and gradient at the zone top. On the other, the AVO volumes at that well\'s trace, at the zone-top time, taking the event within eight milliseconds. Seismic amplitudes are in arbitrary units, so one scale converts them to reflectivity, fitted over all the wells together.',
      do: async (d) => d.slide({ eyebrow: 'What is compared', title: 'Model against seismic', body: '<ul><li><b>Model</b>: the published gather, at the zone top</li><li><b>Seismic</b>: the AVO volumes at the well, within 8 ms</li><li><b>One scale</b> for every well</li></ul>' }) },
    { id: 'run', chapter: 'The comparison', chapterSub: 'QI Studio · AVO · At the wells',
      say: 'Compare at the wells. One scale of seventeen hundred and twenty ties the volumes to reflectivity, and the AVO class agrees at all four wells.',
      sub: 'Compare at the wells. One scale of 1,720 ties the volumes to reflectivity, and the AVO class agrees at all four wells.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-avo-wells-run');
        await t(d, 'qi-avo-wells-table').waitFor({ timeout: 900000 });
        await expectText(d, 'qi-avo-wells-summary', /Scale 1\.72e\+3 from 4 wells; the AVO class agrees at 4 of them/, 'summary');
        await t(d, 'qi-avo-wells-summary').scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight('qi-avo-wells-summary');
      } },
    { id: 'table',
      say: 'Well by well: on Ekene three the seismic lands almost on the model, a misfit of point zero zero nine. On Ekene one, two and four the intercepts are a little higher on the seismic, by up to point zero five, and the gradients agree within a similar amount. All four are class one, as modelled.',
      sub: 'Well by well: on Ekene-3 the seismic lands almost on the model, a misfit of 0.009. On Ekene-1, Ekene-2 and Ekene-4 the intercepts are a little higher on the seismic, by up to 0.05, and the gradients agree within a similar amount. All four are class I, as modelled.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'qi-avo-wells-table', /Ekene-1\s*0\.253, -0\.618\s*0\.284, -0\.625[\s\S]*Ekene-3[\s\S]*0\.009/, 'wells table');
        await t(d, 'qi-avo-wells-table').scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight('qi-avo-wells-table');
      } },
    { id: 'e9',
      say: 'Ekene nine has no published gather. Without density there was no rock physics model to publish, so it cannot be checked here. That gap was flagged back in lesson two.',
      sub: 'Ekene-9 has no published gather. Without density there was no rock physics model to publish, so it cannot be checked here. That gap was flagged back in lesson two.',
      do: async (d) => { await d.unhighlight(); await d.highlight(d.page.getByText('No gather has been published for this well.').first()); } },
    { id: 'chart', chapter: 'On the crossplot', chapterSub: 'Intercept against gradient',
      say: 'On the intercept-gradient crossplot, each well\'s model point and its scaled seismic point sit side by side. Close pairs mean the seismic honours the rock physics at that well. The fluid-substituted model points show where the same wells would plot with brine: that separation is what an AVO anomaly between the wells has to exceed.',
      do: async (d) => {
        await d.unhighlight();
        await d.page.locator('[data-testid="qi-avo-wells"] .recharts-wrapper').first().scrollIntoViewIfNeeded(); await d.sleep(800);
      } },
    { id: 'disagree', chapter: 'When they disagree', chapterSub: 'What to suspect',
      say: 'When a well disagrees, suspect three things in this order. The tie: an event a few milliseconds off reads the wrong part of the wavelet. Tuning: a thin sand mixes its top and base reflections. And the model: the wrong fluid, the wrong pressure, or rock physics calibrated on another facies. One scale for all wells matters here; a scale per well would hide exactly these problems.',
      do: async (d) => d.slide({ eyebrow: 'When they disagree', title: 'Tie, tuning, model', body: '<ul><li><b>Tie</b>: a few ms off reads the wrong lobe</li><li><b>Tuning</b>: top and base interfere</li><li><b>Model</b>: fluid, pressure, facies</li><li>One scale for all wells keeps problems visible</li></ul>' }) },
    { id: 'next',
      say: 'Module F goes from reflections to rock properties: impedance inversion, then the simultaneous inversion, then porosity and facies, and finally the prospects.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'Module F: inversion and the decision', body: '<ul><li>Post-stack inversion</li><li>Simultaneous inversion</li><li>Properties and prospects</li></ul>' }) },
  ],
};
