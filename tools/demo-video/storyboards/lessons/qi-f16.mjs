// QI lesson F16: simultaneous (prestack) inversion of the near, mid and far
// stacks for AI, SI and density, angle wavelets, and blind wells per parameter.
// Figures from the 2026-10-10 dry run after #983 (lesson project, Ekene-8
// included): angle wavelets 24.2 / 24.6 / 25.5 Hz, -2 / -3 / -5 deg, synthetic
// against stack 0.73 to 0.92 on Ekene-1..4, about 0.5 on Ekene-8 (untied);
// blind (field wavelet) AI 6.3 to 7.9 percent, SI 11.4 to 16.1 (Ekene-8 25.5),
// density 6.5 to 8.4 with correlation 0.41 to 0.50.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const pick = async (d, id, name) => {
  const opts = await t(d, id).locator('option').allInnerTexts();
  await d.select(id, { label: opts.find((o) => o.includes(name)) });
};

export default {
  id: 'lesson-qi-f16',
  ...qiLessonMeta(16, 'F', 'Simultaneous inversion: *AI, SI and density at once*', 'Inverting near, mid and far stacks together, wavelets by angle, and which parameters the seismic can really resolve'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
    await d.page.getByTestId('qi-tab-simultaneous').click(); await d.sleep(2500);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 16', chapterSub: 'Module F · Inversion and the decision',
      say: 'Post-stack inversion gives one property, acoustic impedance. But the rock physics showed that oil moves Vp over Vs as much as impedance, and Vp over Vs needs shear. A simultaneous inversion uses the angle stacks to solve for acoustic impedance, shear impedance and density together.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 16', title: 'Simultaneous inversion',
        body: '<ul><li>Near, mid and far stacks together</li><li>AI, SI and density at once</li><li>Vp/Vs, the fluid indicator, follows</li></ul>' }) },
    { id: 'fatti', chapter: 'The physics', chapterSub: 'Fatti three-term',
      say: 'Fatti\'s form of the reflection coefficient splits it into three terms: the acoustic impedance contrast, which dominates at every angle; the shear impedance contrast, which grows with angle; and the density contrast, which only matters at the far angles. That is why density is the hardest to resolve, and why the far stack must reach past twenty five degrees.',
      do: async (d) => d.slide({ eyebrow: 'The physics', title: 'Three terms, three parameters', formula: 'R(θ) ≈ ½(1+tan²θ)·ΔAI/AI − 4K²sin²θ·ΔSI/SI − ½(tan²θ − 4K²sin²θ)·Δρ/ρ',
        body: '<ul><li>AI: every angle</li><li>SI: grows with angle</li><li>Density: far angles only</li></ul>' }) },
    { id: 'stacks', chapter: 'The stacks', chapterSub: 'QI Studio · Simultaneous',
      say: 'Near, mid and far stacks, at ten, twenty and thirty degrees, and the field wavelet. Read the wells: four with sonic, shear and density in time; Ekene nine sits out without density.',
      sub: 'Near, mid and far stacks, at 10, 20 and 30 degrees, and the field wavelet. Read the wells: four with sonic, shear and density in time; Ekene-9 sits out without density.',
      do: async (d) => {
        await d.hideSlide();
        for (const [k, n, a] of [[0, 'near', 10], [1, 'mid', 20], [2, 'far', 30]]) {
          await pick(d, `qi-sim-stack-${k}`, n);
          await d.type(`qi-sim-angle-${k}`, String(a), { delay: 40 });
        }
        await d.click('qi-sim-read');
        await t(d, 'qi-sim-wells').waitFor({ timeout: 300000 });
        await expectText(d, 'qi-sim-wells', /Ekene-9\s*No density curve/, 'wells');
        await t(d, 'qi-sim-wells').scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.highlight('qi-sim-wells');
      } },
    { id: 'aw', chapter: 'Wavelets by angle', chapterSub: 'One per stack',
      say: 'Angle wavelets from the wells extracts one wavelet per stack, by least squares against each well\'s reflectivity at that angle. All three peak near twenty five hertz, within a few degrees of zero phase. On the four tied wells each synthetic matches its stack at point seven to point nine, a little lower at the far angle where the signal is weaker. Ekene eight, deviated and never tied, manages only about point five: a tie is its first remedy. The field wavelet does as well here, so we keep it.',
      sub: 'Angle wavelets from the wells extracts one wavelet per stack, by least squares against each well\'s reflectivity at that angle. All three peak near 25 Hz, within a few degrees of zero phase. On the four tied wells each synthetic matches its stack at 0.7 to 0.9, a little lower at the far angle where the signal is weaker. Ekene-8, deviated and never tied, manages only about 0.5: a tie is its first remedy. The field wavelet does as well here, so we keep it.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-sim-aw');
        await t(d, 'qi-sim-aw-table').waitFor({ timeout: 900000 }); await d.sleep(1000);
        await expectText(d, 'qi-sim-aw-table', /10\s*24\.\d\s*-\d[\s\S]*30\s*2[45]\.\d\s*-\d/, 'angle wavelets');
        await t(d, 'qi-sim-aw-table').scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.highlight('qi-sim-aw-table');
      } },
    { id: 'blind', chapter: 'Blind wells', chapterSub: 'Per parameter',
      say: 'The blind-well check again, now for all three parameters.',
      do: async (d) => {
        await d.unhighlight();
        const box = t(d, 'qi-sim-use-aw'); if (await box.count() && await box.isChecked()) await d.click(box);
        await d.click('qi-sim-blind');
      },
      wait: async (d) => { await t(d, 'qi-sim-blind-table').waitFor({ timeout: 1800000 }); await d.sleep(1000); },
      waitLabel: 'Minutes later' },
    { id: 'blindread',
      say: 'Acoustic impedance is predicted within six to eight percent, as it was from the full stack. Shear impedance within eleven to sixteen on the tied wells, and twenty five on Ekene eight, the well that was never tied. Density errors look small, seven or eight percent, but its correlation with the log is about point five or less: the seismic barely resolves density from stacks that end near thirty degrees. Report density as a trend, and trust acoustic impedance and Vp over Vs.',
      sub: 'Acoustic impedance is predicted within 6 to 8 percent, as it was from the full stack. Shear impedance within 11 to 16 percent on the tied wells, and 25 percent on Ekene-8, the well that was never tied. Density errors look small, 7 or 8 percent, but its correlation with the log is about 0.5 or less: the seismic barely resolves density from stacks that end near 30 degrees. Report density as a trend, and trust acoustic impedance and Vp/Vs.',
      do: async (d) => {
        await expectText(d, 'qi-sim-blind-table', /Ekene-1\s*[67]\.\d[\s\S]*Ekene-8\s*[67]\.\d\s*2\d\.\d/, 'blind table');
        await t(d, 'qi-sim-blind-table').scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.highlight('qi-sim-blind-table');
      } },
    { id: 'run', chapter: 'Inverting the survey', chapterSub: 'Four volumes',
      say: 'Invert the stacks writes four volumes to Seismolord: acoustic impedance, shear impedance, density and Vp over Vs.',
      sub: 'Invert the stacks writes four volumes to Seismolord: acoustic impedance, shear impedance, density and Vp/Vs.',
      do: async (d) => { await d.unhighlight(); await d.click('qi-sim-run'); },
      wait: async (d) => { await d.page.locator('[data-testid="qi-sim-runs"] >> text=Ready: open in Seismolord').first().waitFor({ timeout: 1800000 }); },
      waitLabel: 'Minutes later' },
    { id: 'ready',
      say: 'Ready, with the settings and the blind table kept in the project for the report.',
      do: async (d) => { await d.highlight('qi-sim-runs'); } },
    { id: 'next',
      say: 'Next, the impedance turns into porosity, and we read the checks that say whether to believe it.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Next', title: 'Properties from impedance', body: '<ul><li>Porosity from AI</li><li>The leave-one-out check</li><li>Coverage of the uncertainty band</li></ul>' }); } },
  ],
};
