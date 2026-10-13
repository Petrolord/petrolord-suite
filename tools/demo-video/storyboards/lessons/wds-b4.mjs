// Well Design with Petrolord, Lesson B4: build and hold, and the KPI strip.
// The Design methods dialog (replace and append methods), a build and hold
// from the surface to T1 (kickoff 1,312 ft, 2.54 deg/100 ft, the kit's
// Ekene-11 plan), the segments it writes, the KPI strip, a hand edit that
// moves the well off the target and the undo that puts it back.
import { login, expectText, lessonSite, pick, dialog, t, wdsLessonMeta, T1 } from './wds-common.mjs';

const SITE = 'Lesson B4: Ekene Alpha';
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const segLen = (d, n) => d.page.getByText(`#${n}`, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]').locator('input[type=number]').first();

export default {
  id: 'lesson-wds-b4',
  ...wdsLessonMeta(4, 'B', 'Build and hold, and *the KPI strip*', 'The design methods, a J to T1, the segments and what the strip says'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'methods', chapter: 'Design methods', chapterSub: 'Six solvers, two kinds',
      say: 'A new design is a single vertical hold. Design methods holds six solvers. Build and hold, the S-profile and the nudge replace the whole well from the surface. Curve to target, horizontal landing and Point append to the end of the design, so they can be chained: solve the top hole one way and land the well another.',
      do: async (d) => {
        await d.sleep(1500);
        await d.click(d.page.getByRole('button', { name: /Design methods/ }));
        const sd = dialog(d);
        await sd.getByText('Method').first().waitFor();
        await d.sleep(800);
        await d.click(sd.getByRole('combobox').first());
        await d.sleep(6500);
        await d.click(d.page.getByRole('option', { name: 'Build and hold (J)', exact: true }));
        await d.sleep(600);
      } },
    { id: 'j', chapter: 'Build and hold', chapterSub: 'Vertical, one build, a tangent',
      say: 'Build and hold is vertical to the kickoff, one build at a constant rate, then a straight tangent that lands on the target. The kit\'s Ekene eleven plan kicks off at four hundred metres, thirteen hundred and twelve feet, and builds at two and a half degrees per thirty metres, two point five four per hundred feet.',
      sub: 'Build and hold is vertical to the kickoff, one build at a constant rate, then a straight tangent that lands on the target. The kit\'s Ekene-11 plan kicks off at 400 m, 1,312 ft, and builds at 2.5° per 30 m, 2.54° per 100 ft.',
      do: async (d) => {
        const sd = dialog(d);
        await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${T1.name}`), { onCamera: true });
        await d.type(sd.getByTestId('solver-kop'), '1312.3');
        await d.type(sd.getByTestId('solver-buildrate'), '2.54');
        await d.sleep(500);
        await d.click(sd.getByTestId('solver-apply'));
        await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'segments', chapter: 'The segments', chapterSub: 'What the solver wrote',
      say: 'The solver writes three segments: a hold of thirteen hundred and twelve feet, a build of eight hundred and eighty feet at two point five four, and a tangent of four thousand four hundred and thirty feet. The toast gives the tangent: twenty two point five four degrees on an azimuth of seventy four point seven.',
      sub: 'The solver writes three segments: a hold of 1,312 ft, a build of 880 ft at 2.54, and a tangent of 4,430 ft. The toast gives the tangent: 22.54° on an azimuth of 74.7°.',
      do: async (d) => {
        for (const n of [1, 2, 3]) {
          const card = d.page.getByText(`#${n}`, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
          await d.highlight(card);
          await d.sleep(2000);
        }
        await d.unhighlight();
      } },
    { id: 'kpis', chapter: 'The KPI strip', chapterSub: 'The shape of the well',
      say: 'The strip gives the shape: six thousand six hundred and twenty three feet of hole, six thousand two hundred and sixty eight feet true vertical depth below the kelly bushing, one thousand eight hundred and fifty five feet of displacement, twenty two point four degrees maximum inclination, a maximum dogleg of two point five four, and the bottom hole in latitude and longitude.',
      sub: 'The strip gives the shape: 6,623 ft of hole, 6,268 ft true vertical depth below the kelly bushing, 1,855 ft of displacement, 22.4° maximum inclination, a maximum dogleg of 2.54, and the bottom hole in latitude and longitude.',
      do: async (d) => {
        await expectText(d, kpis(d), /Total MD\s*6623[\s\S]*6268[\s\S]*Displacement\s*1855[\s\S]*Max Inc\s*22\.4[\s\S]*Max DLS\s*2\.54/i, 'KPIs');
        await d.highlight(kpis(d));
        await d.sleep(6500);
        await d.unhighlight();
      } },
    { id: 'edit', chapter: 'By hand', chapterSub: 'A starting point',
      say: 'The segments stay editable: the solver gives a starting point. Lengthen the tangent by five hundred feet and the well runs past the target: seven thousand one hundred and twenty three feet of hole.',
      sub: 'The segments stay editable: the solver gives a starting point. Lengthen the tangent by 500 ft and the well runs past the target: 7,123 ft of hole.',
      do: async (d) => {
        const f = segLen(d, 3);
        const v = Number(await f.inputValue());
        await d.type(f, String(Math.round((v + 500) * 100) / 100));
        await f.press('Tab');
        await d.sleep(1500);
        await expectText(d, kpis(d), /Total MD\s*7123/i, 'edited');
        await d.highlight(kpis(d).getByText(/^Total MD/i).first().locator('xpath=..'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'undo',
      say: 'Undo puts it back. The segments list and the plan editor share one history, so a solve, a typed edit and a reordered segment all undo the same way.',
      do: async (d) => {
        await d.click(t(d, 'segments-undo'));
        await d.sleep(1500);
        await expectText(d, kpis(d), /Total MD\s*6623/i, 'undone');
        await d.highlight(kpis(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson five',
      say: 'Build and hold to T1. Next, the other solvers on the same target, and the question each one answers.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
