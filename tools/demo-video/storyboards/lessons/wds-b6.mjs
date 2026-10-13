// Well Design with Petrolord, Lesson B6: horizontal landing. The kit's T2
// (07-well-design/ekene-11-targets.csv: 402430 E, 521870 N, 1932.36 m
// TVDSS, the landing point of the horizontal option) as the heel, and a toe
// 400 m further on the same bearing and 20 m deeper (the episode script's
// example), so the lateral runs down the heel-to-toe line at about 87 deg.
// Appended to a vertical hold to the kickoff.
import {
  login, expectText, lessonSite, newTarget, confirmTarget, pick, dialog, t, tab, wdsLessonMeta,
} from './wds-common.mjs';

const SITE = 'Lesson B6: Ekene Alpha';
export const T2 = { name: 'T2 Oboro heel', e: '402430', n: '521870', tvdss: '6339.8' };
export const TOE = { name: 'T2 toe', e: '402762.8', n: '522092', tvdss: '6405.4' };
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const segLen = (d, n) => d.page.getByText(`#${n}`, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]').locator('input[type=number]').first();

export default {
  id: 'lesson-wds-b6',
  ...wdsLessonMeta(6, 'B', 'Horizontal *landing*', 'A heel, a toe, and a landing attitude taken from the line between them'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, {
      extra: async (dd) => {
        for (const tg of [T2, TOE]) { await newTarget(dd, tg); await confirmTarget(dd); }
      },
    });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'targets', chapter: 'Heel and toe', chapterSub: 'Two targets',
      say: 'The horizontal option for Ekene eleven lands at T2, near the base of the Oboro Sand, six thousand three hundred and thirty nine point eight feet subsea. A second target, the toe, sits four hundred metres further on the same bearing and twenty metres deeper, following the dip.',
      sub: 'The horizontal option for Ekene-11 lands at T2, near the base of the Oboro Sand, 6,339.8 ft subsea. A second target, the toe, sits 400 m further on the same bearing and 20 m deeper, following the dip.',
      do: async (d) => {
        await d.click(tab(d, 'Targets'));
        await d.sleep(1500);
        await d.highlight(d.page.locator('tr', { hasText: T2.name }).first());
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight(d.page.locator('tr', { hasText: TOE.name }).first());
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'kop', chapter: 'Down to the kickoff', chapterSub: 'Then append',
      say: 'Horizontal landing appends from the end of the design, so the design first goes vertically to the kickoff: one hold of thirteen hundred and twelve feet.',
      sub: 'Horizontal landing appends from the end of the design, so the design first goes vertically to the kickoff: one hold of 1,312 ft.',
      do: async (d) => {
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1200);
        const f = segLen(d, 1);
        await d.type(f, '1312.3');
        await f.press('Tab');
        await d.sleep(1500);
      } },
    { id: 'landing', chapter: 'The landing', chapterSub: 'Attitude from heel to toe',
      say: 'In Design methods, horizontal landing takes the heel and, optionally, the toe. With both, the dialog shows the attitude it will land with before you solve: fifty six point three degrees from heel to toe over thirteen hundred and twelve feet, and with the toe sixty six feet deeper, eighty seven point one degrees of inclination to stay on that line.',
      sub: 'In Design methods, horizontal landing takes the heel and, optionally, the toe. With both, the dialog shows the attitude it will land with before you solve: 56.3° from heel to toe over 1,312 ft, and with the toe 66 ft deeper, 87.1° of inclination to stay on that line.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Design methods/ }));
        const sd = dialog(d);
        await sd.getByText('Method').first().waitFor();
        await d.sleep(600);
        await pick(d, sd.getByRole('combobox').first(), 'Horizontal landing (curve-hold-curve)', { onCamera: true });
        await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${T2.name}`), { onCamera: true });
        await pick(d, sd.getByTestId('solver-toe-trigger'), new RegExp(`^${TOE.name}`), { onCamera: true });
        await d.sleep(800);
        await expectText(d, sd.getByTestId('solver-alignment'), /Heel to toe: 56\.3 deg over 1312 ft[\s\S]*66 ft deeper than the heel[\s\S]*87\.1 deg inclination/, 'alignment');
        await d.highlight(sd.getByTestId('solver-alignment'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'override',
      say: 'Laterals are not all flat. Leave the override blank and the well runs straight down the heel to toe line. Type eighty nine or ninety one to force the nose up or down instead.',
      do: async (d) => {
        const sd = dialog(d);
        await d.moveTo(sd.getByTestId('solver-landinc'));
        await d.sleep(3000);
        await d.click(sd.getByTestId('solver-apply'));
        await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'result', chapter: 'Landed', chapterSub: 'Curve, hold, curve',
      say: 'Curve, hold, curve, landed at T2 on that attitude: seven thousand five hundred and twenty feet of hole, six thousand four hundred and twenty two feet true vertical depth, two thousand five hundred and thirty eight feet out, eighty seven point one degrees, and a maximum dogleg of three degrees per hundred feet.',
      sub: 'Curve, hold, curve, landed at T2 on that attitude: 7,520 ft of hole, 6,422 ft true vertical depth, 2,538 ft out, 87.1°, and a maximum dogleg of 3.00° per 100 ft.',
      do: async (d) => {
        await expectText(d, kpis(d), /Total MD\s*7520[\s\S]*6422[\s\S]*Displacement\s*2538[\s\S]*Max Inc\s*87\.1[\s\S]*Max DLS\s*3\.00/i, 'landing KPIs');
        await d.highlight(kpis(d));
        await d.sleep(3500);
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Plots', exact: true }).first());
        await d.sleep(2500);
        await d.highlight(t(d, 'section-view-chart'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson seven',
      say: 'A landing set by two targets. Next, the plan editor, and what Save really means.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
