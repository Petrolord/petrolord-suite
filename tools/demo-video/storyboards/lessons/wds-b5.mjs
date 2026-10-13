// Well Design with Petrolord, Lesson B5: the other solvers on T1. An
// S-profile (build, hold, drop back to vertical through the Oboro Sand),
// a curve to target from the end of a vertical hold (the dogleg one arc
// would need), and Point (the shortest way onto a point at a given dogleg).
import {
  login, expectText, lessonSite, createDesign, selectDesign, solveJ, pick, dialog, t, tab, wdsLessonMeta, T1,
} from './wds-common.mjs';

const SITE = 'Lesson B5: Ekene Alpha';
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const toast = (d) => d.page.getByText('Solve complete').last().locator('xpath=..');

async function openMethod(d, label) {
  await d.click(d.page.getByRole('button', { name: /Design methods/ }));
  const sd = dialog(d);
  await sd.getByText('Method').first().waitFor();
  await d.sleep(600);
  await pick(d, sd.getByRole('combobox').first(), label, { onCamera: true });
  await d.sleep(500);
  return sd;
}
const field = (sd, label) => sd.getByText(label, { exact: true }).locator('..').locator('input').first();
async function solve(d, sd) {
  await d.click(sd.getByTestId('solver-apply'));
  await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
  await d.sleep(2000);
}

export default {
  id: 'lesson-wds-b5',
  ...wdsLessonMeta(5, 'B', 'S-profile, curve to target *and Point*', 'Three more solvers on the same target, and the question each answers'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 's', chapter: 'The S-profile', chapterSub: 'Build, hold, drop',
      say: 'The S-profile builds, holds, and then drops toward a final inclination while still hitting the target. A drop back to vertical puts the well straight down through the reservoir, which a log analyst and a completion engineer both like. Kick off at thirteen hundred and twelve feet, build and drop at two point five four, and come back to vertical.',
      sub: 'The S-profile builds, holds, and then drops toward a final inclination while still hitting the target. A drop back to vertical puts the well straight down through the reservoir, which a log analyst and a completion engineer both like. Kick off at 1,312 ft, build and drop at 2.54, and come back to vertical.',
      do: async (d) => {
        await d.sleep(1200);
        const sd = await openMethod(d, 'S-profile (build, hold, drop)');
        await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${T1.name}`), { onCamera: true });
        await d.type(field(sd, 'KOP (ft)'), '1312.3');
        await d.type(field(sd, 'Build rate (deg/100ft)'), '2.54');
        await d.type(field(sd, 'Drop rate (deg/100ft)'), '2.54');
        await d.type(field(sd, 'Final inclination (deg)'), '0');
        await d.sleep(600);
        await solve(d, sd);
      } },
    { id: 'sres',
      say: 'Six thousand six hundred and forty nine feet of hole, twenty six feet more than the build and hold, and a steeper tangent, twenty five point two degrees, to make room for the drop. The inclination plot shows the build, the hold, and the drop back to vertical above the target.',
      sub: '6,649 ft of hole, 26 ft more than the build and hold, and a steeper tangent, 25.2°, to make room for the drop. The inclination plot shows the build, the hold, and the drop back to vertical above the target.',
      do: async (d) => {
        await expectText(d, kpis(d), /Total MD\s*6649[\s\S]*6268[\s\S]*Max Inc\s*25\.2/i, 'S-profile KPIs');
        await d.click(d.page.getByRole('button', { name: 'Plots', exact: true }).first());
        await d.sleep(1500);
        await d.highlight(kpis(d));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'curve', chapter: 'Curve to target', chapterSub: 'Is it drillable from here?',
      say: 'Curve to target answers a quicker question: from the end of the design as it stands, what single arc reaches the target, and at what dogleg? A second design starts as a vertical hold of one thousand feet.',
      sub: 'Curve to target answers a quicker question: from the end of the design as it stands, what single arc reaches the target, and at what dogleg? A second design starts as a vertical hold of 1,000 ft.',
      do: async (d) => {
        await createDesign(d, 'Ekene-11', 'Plan 2', { onCamera: true });
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1500);
        const sd = await openMethod(d, 'Curve to target (single arc)');
        await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${T1.name}`), { onCamera: true });
        await d.sleep(800);
        await solve(d, sd);
      } },
    { id: 'cres',
      say: 'One arc, from a thousand feet straight onto T1: a dogleg of nought point six eight degrees per hundred feet, building all the way to thirty eight point eight degrees at the target, in six thousand six hundred and ninety three feet of hole. Gentle, so the idea is drillable, and the steepest of the three at the reservoir.',
      sub: 'One arc, from 1,000 ft straight onto T1: a dogleg of 0.68° per 100 ft, building all the way to 38.8° at the target, in 6,693 ft of hole. Gentle, so the idea is drillable, and the steepest of the three at the reservoir.',
      do: async (d) => {
        await expectText(d, kpis(d), /Total MD\s*6693[\s\S]*Max Inc\s*38\.8[\s\S]*Max DLS\s*0\.68/i, 'curve KPIs');
        await d.highlight(d.page.getByText('#2', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'));
        await d.sleep(3000);
        await d.unhighlight();
        await d.highlight(kpis(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'point', chapter: 'Point', chapterSub: 'Land exactly on a point',
      say: 'Point lands exactly on a point from the end of the design at the dogleg you allow, with a curve and then a tangent hold if it needs one. From the same thousand foot hold, at two point five four degrees per hundred feet.',
      sub: 'Point lands exactly on a point from the end of the design at the dogleg you allow, with a curve and then a tangent hold if it needs one. From the same 1,000 ft hold, at 2.54° per 100 ft.',
      do: async (d) => {
        await d.click(t(d, 'segments-undo'));
        await d.sleep(1500);
        const sd = await openMethod(d, 'Point (land exactly on a point)');
        await pick(d, sd.getByTestId('solver-target-trigger'), new RegExp(`^${T1.name}`), { onCamera: true });
        await d.type(sd.getByTestId('solver-point-dls'), '2.54');
        await d.sleep(800);
        await solve(d, sd);
      } },
    { id: 'pres',
      say: 'A curve at two point five four from the end of the thousand foot hold, then a tangent at twenty point nine degrees onto the point: six thousand six hundred and one feet of hole, the shortest of the four, because it leaves vertical the earliest.',
      sub: 'A curve at 2.54 from the end of the 1,000 ft hold, then a tangent at 20.9° onto the point: 6,601 ft of hole, the shortest of the four, because it leaves vertical the earliest.',
      do: async (d) => {
        await expectText(d, d.page.getByText(/^segments$/i).first().locator('xpath=ancestor::div[2]'), /Point: curve, then tangent hold to the point/, 'point segments');
        await expectText(d, kpis(d), /Total MD\s*6601[\s\S]*Max Inc\s*20\.9/i, 'point KPIs');
        await d.highlight(kpis(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson six',
      say: 'Four ways onto the same target, each answering a different question. Next, the horizontal option: landing on T2 along the Oboro Sand.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
