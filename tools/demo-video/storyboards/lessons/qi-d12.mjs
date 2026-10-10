// QI lesson D12: incidence angle from an RMS velocity, angle ranges, the
// usable angle and angle stacks (Ekene kit v3 gathers; the gather store of 13
// bins of 200 m is already built). Figures from the 2026-10-10 qi-02 dry runs:
// three stacks of 4096 traces; usable angle Q10 = Q50 = Q90 = 32.8 degrees.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';
import { clearAngleStacks, RMS_VELOCITY } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'lesson-qi-d12',
  ...qiLessonMeta(12, 'D', 'Angles from velocity, *and angle stacks*', 'Turning offset into incidence angle with an RMS velocity, choosing angle ranges, and the usable angle'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
    await clearAngleStacks(d);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 12', chapterSub: 'Module D · From gathers to angle stacks',
      say: 'AVO is a change of amplitude with incidence angle, but a gather is sorted by offset: the distance from source to receiver. The same offset is a large angle in the shallow section and a small one deep down. So before stacking by angle, every sample of every offset needs its angle, and that takes a velocity.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 12', title: 'Angles from velocity',
        body: '<ul><li>Gathers come by <b>offset</b>; AVO wants <b>angle</b></li><li>One offset: wide angle shallow, narrow angle deep</li><li>The link is the velocity</li></ul>' }) },
    { id: 'walden', chapter: 'Offset to angle', chapterSub: 'Walden (1991)',
      say: 'QI Studio uses Walden\'s straight-ray relation. The RMS velocity sets the ray\'s path down to the reflector, and the interval velocity, from Dix\'s equation, bends it at the reflector itself. At a given offset the angle falls with time, because the reflector is deeper.',
      do: async (d) => d.slide({ eyebrow: 'Offset to angle', title: 'Walden\'s relation', formula: 'sin θ = (V_int / V_rms) · x / √(x² + (V_rms · t₀)²)',
        body: '<ul><li><b>x</b> offset, <b>t₀</b> zero-offset two-way time</li><li><b>V_rms</b> from the velocity table</li><li><b>V_int</b> by Dix, between table rows</li></ul>' }) },
    { id: 'velocity', chapter: 'The velocity', chapterSub: 'QI Studio · Prestack',
      say: 'The velocity is a table of time and R M S velocity, one row per line, as it comes from processing. We paste the Ekene kit\'s table: fifteen hundred metres per second at the seabed, rising to about twenty four hundred through the reservoir section.',
      sub: 'The velocity is a table of time and RMS velocity, one row per line, as it comes from processing. We paste the Ekene kit\'s table: 1,500 m/s at the seabed, rising to about 2,400 m/s through the reservoir section.',
      do: async (d) => {
        await d.hideSlide();
        await d.highlight('qi-pre-vel');
        await d.type('qi-pre-vel', RMS_VELOCITY, { delay: 8 });
      } },
    { id: 'ranges', chapter: 'Angle ranges', chapterSub: 'Near, mid and far',
      say: 'Then the ranges. Five to fifteen degrees for the near stack, fifteen to twenty five for the mid, and twenty five to thirty five for the far. Equal widths keep the stacks\' noise comparable. Each stack is later given its mean angle, ten, twenty and thirty, for AVO and inversion.',
      do: async (d) => {
        await d.unhighlight();
        const R = [['near', 5, 15], ['mid', 15, 25], ['far', 25, 35]];
        for (const [k, [n, a, b]] of R.entries()) {
          await d.type(d.page.getByLabel(`Range ${k + 1} name`), n, { delay: 30 });
          await d.type(d.page.getByLabel(`Range ${k + 1} from`), String(a), { delay: 30 });
          await d.type(d.page.getByLabel(`Range ${k + 1} to`), String(b), { delay: 30 });
        }
      } },
    { id: 'usable', chapter: 'The usable angle', chapterSub: 'How far the data reaches',
      say: 'Not every angle exists at every depth. The far offset of the survey, twenty five hundred metres, limits the widest angle reached, and the processing mute removes the most stretched traces. The usable angle is the widest angle that still has data at a CDP, here with at least one trace. A far stack that asks for more than the data has is partly empty.',
      do: async (d) => {
        await d.highlight(d.page.getByText('Least fold for the usable angle').first());
      } },
    { id: 'stack', chapter: 'Making the stacks', chapterSub: 'On the seismic worker',
      say: 'Make angle stacks runs on the seismic worker across the whole gather store.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.locator('[data-testid^="qi-pre-stack-"]').first());
      },
      wait: async (d) => {
        await d.page.locator('[data-testid="qi-pre-stores"] .text-pl-success-text').last().waitFor({ timeout: 900000 });
        await d.page.locator('[data-testid^="qi-pre-convert-"]').nth(2).waitFor({ timeout: 120000 });
      },
      waitLabel: 'Minutes later' },
    { id: 'result',
      say: 'Three stacks of four thousand and ninety six traces each. The usable angle is thirty three degrees at every CDP, so the far stack has full coverage up to about thirty three of its thirty five degrees. Its effective mean angle is a little under thirty, worth remembering when we give it its angle for AVO.',
      sub: 'Three stacks of 4,096 traces each. The usable angle is 33 degrees at every CDP, so the far stack has full coverage up to about 33 of its 35 degrees. Its effective mean angle is a little under 30, worth remembering when we give it its angle for AVO.',
      do: async (d) => {
        const res = d.page.locator('[data-testid^="qi-pre-result-"]').last();
        await expectText(d, res, /near 5 to 15 degrees \(4096 traces\)[\s\S]*far 25 to 35 degrees \(4096 traces\)[\s\S]*Q50 3[23]\.\d/, 'angle stacks');
        await d.highlight(res);
      } },
    { id: 'convert',
      say: 'Each stack can be converted into a Seismolord volume, to view, to tie, and to feed AVO and inversion. In the Ekene project the full-survey near, mid and far stacks are already loaded, so we leave these as they are.',
      do: async (d) => { await d.unhighlight(); await d.highlight('qi-pre-stacks'); } },
    { id: 'next',
      say: 'Module E puts the angle stacks to work: intercept, gradient and fluid factor volumes from the near, mid and far stacks.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Module E: AVO on the seismic', body: '<ul><li>Intercept and gradient volumes</li><li>The fluid factor</li><li>Checked at the wells</li></ul>' });
      } },
  ],
};
