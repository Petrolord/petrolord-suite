// QI lesson E13: AVO volumes from the near, mid and far stacks, stack matching,
// and the fluid factor in Seismolord. Figures from the 2026-10-10 probes (kit
// v3): matching to the near stack: mid shift 0.0 ms, phase 1 deg, scale 1.195;
// far shift 0.2 ms, phase 4 deg, scale 1.205 (the far stack is weaker because
// the top Ekene dims with angle: genuine AVO, so the matched stacks are not
// used). The fluid factor is strongest on the Oboro gas sand (about 1570 ms);
// the Ekene oil top (about 1290 ms) is a faint event.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';
import { clearProductVolumes } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const pick = async (d, id, name) => {
  const opts = await t(d, id).locator('option').allInnerTexts();
  await d.select(id, { label: opts.find((o) => o.includes(name)) });
};

export default {
  id: 'lesson-qi-e13',
  ...qiLessonMeta(13, 'E', 'AVO volumes: *intercept, gradient and the fluid factor*', 'From near, mid and far stacks to AVO attribute volumes, and what to check before trusting them'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await clearProductVolumes(d, shared);
    await lessonProject(d, shared);
    await d.page.getByTestId('qi-tab-avo').click();
    await d.sleep(2000);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 13', chapterSub: 'Module E · AVO on the seismic',
      say: 'In Module B we modelled what the top of the Ekene Sand should do with angle. Now we measure it on the seismic, at every sample of the survey. From three angle stacks we fit an intercept and a gradient, and combine them into attributes that respond to fluid.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 13', title: 'AVO volumes',
        body: '<ul><li>A Shuey fit at every sample: <b>A</b> and <b>B</b></li><li>The <b>fluid factor</b>: off the mudrock trend</li><li>Checked before trusted</li></ul>' }) },
    { id: 'ff', chapter: 'The fluid factor', chapterSub: 'Smith and Gidlow (1987)',
      say: 'Brine-saturated rocks follow the mudrock line, a near-linear relation between Vp and Vs. The fluid factor measures how far a reflection departs from it, using Gardner\'s density and a background Vs over Vp. On the mudrock trend it is near zero; gas pushes it strongly negative.',
      do: async (d) => d.slide({ eyebrow: 'The fluid factor', title: 'Smith-Gidlow', formula: 'ΔF = ΔVp/Vp − 1.16 (Vs/Vp) ΔVs/Vs',
        body: '<ul><li>Zero on the mudrock line</li><li>Strongly negative for gas</li><li>Needs a background Vs/Vp: 0.5 by default</li></ul>' }) },
    { id: 'stacks', chapter: 'The stacks', chapterSub: 'QI Studio · AVO',
      say: 'We choose the near, mid and far stacks, with their mean angles of ten, twenty and thirty degrees.',
      do: async (d) => {
        await d.hideSlide();
        for (const [k, n, a] of [[0, 'near', 10], [1, 'mid', 20], [2, 'far', 30]]) {
          await pick(d, `qi-avo-stack-${k}`, n);
          await d.type(`qi-avo-angle-${k}`, String(a), { delay: 40 });
        }
      } },
    { id: 'match', chapter: 'Are the stacks balanced?', chapterSub: 'Match the stacks',
      say: 'AVO compares amplitudes between stacks, so the stacks must agree in time, phase and overall level. Match the stacks measures one operator per stack against a reference, over about three hundred traces across the survey. We match the mid and far stacks to the near.',
      do: async (d) => {
        await pick(d, 'qi-avo-match-ref', 'near');
        await d.click('qi-avo-match-run');
      },
      wait: async (d) => { await t(d, 'qi-avo-match-table').waitFor({ timeout: 1200000 }); await d.sleep(1000); },
      waitLabel: 'Minutes later' },
    { id: 'matchread',
      say: 'Read the table before using the result. The time shifts are nothing, a fifth of a millisecond at most, and the phase differences are a few degrees: the stacks are aligned. The scale says the mid and far stacks are twenty percent weaker than the near. Here that is not a processing artefact. The top of the Ekene Sand dims with angle; that is the AVO itself. Boosting the far stack would erase the signal, so we keep the original stacks.',
      do: async (d) => {
        await expectText(d, 'qi-avo-match-table', /EKENE3D-mid\.sgy\s*0\.0\s*1\s*1\.195[\s\S]*EKENE3D-far\.sgy\s*0\.2\s*4\s*1\.205/, 'match table');
        await d.highlight('qi-avo-match-table');
      } },
    { id: 'when',
      say: 'When would you use the matched stacks? On field data where the partial stacks were processed separately, with different gains or a time shift between them. The survey-wide operator removes that imbalance while keeping the differences from place to place that AVO reads.',
      do: async (d) => { await d.unhighlight(); } },
    { id: 'run', chapter: 'Computing the volumes', chapterSub: 'On the seismic worker',
      say: 'Compute the AVO volumes. The worker fits the intercept and gradient at every sample and writes them, with the fluid factor, as Seismolord volumes.',
      do: async (d) => { await d.click('qi-avo-run'); },
      wait: async (d) => { await d.page.locator('[data-testid="qi-avo-runs"] >> text=Ready: open in Seismolord').first().waitFor({ timeout: 1800000 }); },
      waitLabel: 'Minutes later' },
    { id: 'open', chapter: 'In Seismolord', chapterSub: 'The fluid factor section',
      say: 'Opened in Seismolord, here is the fluid factor on inline ten sixty four. The strongest response, near fifteen hundred and seventy milliseconds, is the Oboro Sand: gas. The top of the Ekene Sand, near twelve hundred and ninety, is a faint event. That is just what the rock physics said: gas is easy, oil is subtle.',
      sub: 'Opened in Seismolord, here is the fluid factor on inline 1064. The strongest response, near 1570 ms, is the Oboro Sand: gas. The top of the Ekene Sand, near 1290 ms, is a faint event. That is just what the rock physics said: gas is easy, oil is subtle.',
      do: async (d) => {
        await d.highlight('qi-avo-runs');
        await d.sleep(1500);
        await d.unhighlight();
        await d.click(d.page.locator('[data-testid="qi-avo-runs"] >> text=Ready: open in Seismolord').first());
        await t(d, 'sl-start-toggle').waitFor({ timeout: 120000 }); await d.sleep(5000);
        if (await t(d, 'sl-tour-skip').count()) await t(d, 'sl-tour-skip').click();
        await d.click(d.page.locator('text=/Fluid factor$/ >> visible=true').first());
        await d.sleep(6000);
      } },
    { id: 'next',
      say: 'An attribute volume is only a hypothesis until it is checked at the wells. The next lesson compares the AVO volumes with the rock physics model at every well.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'AVO at the wells', body: '<ul><li>Model against seismic at each well</li><li>One scale over all wells</li><li>Does the class agree?</li></ul>' }) },
  ],
};
