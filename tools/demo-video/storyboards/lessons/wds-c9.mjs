// Well Design with Petrolord, Lesson C9: anti-collision. Ekene-11 (kickoff
// 500 ft) against the Ekene Alpha neighbours: Ekene-8 and Ekene-9 from the
// registry, Ekene-10 and Ekene-12 scanned on their definitive surveys. The
// SPE-187073 rule and its parameters, the scan, the ladder in SF and
// distance, the traveling cylinder, and the saved run.
import { login, expectText, lessonSite, pickOffsets, runScan, t, tab, wdsLessonMeta } from './wds-common.mjs';

const SITE = 'Lesson C9: Ekene Alpha';
const btn = (d, name) => d.page.getByRole('button', { name, exact: true }).first();

export default {
  id: 'lesson-wds-c9',
  ...wdsLessonMeta(9, 'C', 'Anti-*collision*', 'The separation rule, the scan, the ladder, the traveling cylinder and the saved run'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { pad: true, kop: '500' });
    await tab(d, 'Anti-Collision').click();
    await d.sleep(3000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'offsets', chapter: 'The offsets', chapterSub: 'Registry wells and this site\'s surveys',
      say: 'The scan takes the saved plan as the reference, and the offsets to scan against. Ekene ten and Ekene twelve are this site\'s drilled wells, scanned on their definitive surveys, not their old plans. Ekene eight and Ekene nine come from the well registry. The other Ekene wells are a kilometre away; tick only the platform.',
      sub: 'The scan takes the saved plan as the reference, and the offsets to scan against. Ekene-10 and Ekene-12 are this site\'s drilled wells, scanned on their definitive surveys, not their old plans. Ekene-8 and Ekene-9 come from the well registry. The other Ekene wells are a kilometre away; tick only the platform.',
      do: async (d) => {
        await d.sleep(1000);
        await pickOffsets(d, /^Ekene-(8|9|10|12)\b/, { onCamera: true });
        await d.highlight(d.page.getByText(/Offset wells \(4 selected\)/).first().locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'rule', chapter: 'The separation rule', chapterSub: 'SPE-187073',
      say: 'The rule shows every number in it. k, three and a half combined standard deviations of clearance. A bit position allowance of half a metre, shown here as one point six four feet, and a surface margin of nought point nine eight feet for what nobody models. The hole radii, because the rule measures edge to edge. And the thresholds: review below one point five, no-go below one.',
      sub: 'The rule shows every number in it. k, 3.5 combined standard deviations of clearance. A bit position allowance of 0.5 m, shown here as 1.64 ft, and a surface margin of 0.98 ft for what nobody models. The hole radii, because the rule measures edge to edge. And the thresholds: review below 1.5, no-go below 1.',
      do: async (d) => {
        await d.highlight(d.page.getByText(/Separation rule/i).first().locator('xpath=..'));
        await d.sleep(8000);
        await d.unhighlight();
      } },
    { id: 'run', chapter: 'The scan', chapterSub: 'Closest approach to each neighbour',
      say: 'Run it. For every station the engine finds the closest point on each offset, on the arcs themselves, projects both wells\' uncertainty onto the line between them, and computes the separation factor. All four are clear. The closest is Ekene eight and Ekene nine at the kickoff, one point eight five.',
      sub: 'Run it. For every station the engine finds the closest point on each offset, on the arcs themselves, projects both wells\' uncertainty onto the line between them, and computes the separation factor. All four are clear. The closest is Ekene-8 and Ekene-9 at the kickoff, 1.85.',
      do: async (d) => {
        await runScan(d, { onCamera: true });
        await expectText(d, d.page.locator('body'), /CLEAR\s*Ekene-9 \(registry\)\s*min SF 1\.85 at MD 500 ft/i, 'clear 1.85');
        await d.highlight(d.page.getByText(/min SF 1\.85/).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'distance', chapter: 'The ladder', chapterSub: 'SF and distance',
      say: 'The ladder shows the separation factor down the whole well. Distance mode shows the same scan in feet: the centre to centre distance to each neighbour, solid, and dashed, the minimum allowable separation, the distance at which the factor would fall to one. That is the number a directional driller can steer against.',
      do: async (d) => {
        await d.sleep(2500);
        await d.click(btn(d, 'Distance'));
        await d.sleep(5000);
        await d.click(btn(d, 'SF'));
        await d.sleep(1000);
      } },
    { id: 'tc', chapter: 'The traveling cylinder', chapterSub: 'Looking down the hole',
      say: 'The traveling cylinder puts the neighbours around Ekene eleven as you look down it, by direction and distance: highside, relative to the top of the hole, or north. Every neighbour falls away from the centre as Ekene eleven heads east.',
      sub: 'The traveling cylinder puts the neighbours around Ekene-11 as you look down it, by direction and distance: highside, relative to the top of the hole, or north. Every neighbour falls away from the centre as Ekene-11 heads east.',
      do: async (d) => {
        await d.click(btn(d, 'North'));
        await d.sleep(3500);
        await d.click(btn(d, 'Highside'));
        await d.sleep(2000);
      } },
    { id: 'save', chapter: 'The saved run', chapterSub: 'Evidence that it was checked',
      say: 'Save run stores the scan with the design, as it was computed. It is the evidence that the plan was checked, the input to the anti-collision report, and it never changes when the plan does: change the plan, and you scan and save again.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Save run/ }).first());
        await d.sleep(2500);
        await d.highlight(d.page.getByText(/Run history/).first().locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson ten',
      say: 'Clearance, by the industry rule, saved as evidence. Next, the actual surveys that a plan turns into.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
