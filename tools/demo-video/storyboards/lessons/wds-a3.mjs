// Well Design with Petrolord, Lesson A3: targets. T1 typed from the kit's
// target table (07-well-design/ekene-11-targets.csv: 402250 E, 521750 N,
// 1885.36 m TVDSS), the same point taken from the Oboro Sand top map with
// the 8 m stand-off, and a target from a formation top in a registry well
// (Oboro Sand in Ekene-8). Absolute site coordinates, the source column,
// and the map view.
import {
  login, expectText, openStudio, deleteSites, createSite, addSlots, confirmSite, createWellbore, confirmWellbore,
  createDesign, newTarget, confirmTarget, targetFromSurface, confirmPick, dialog, pick, t, tab, wdsLessonMeta, SLOTS, T1,
} from './wds-common.mjs';

const SITE = 'Lesson A3: Ekene Alpha';
const row = (d, name) => d.page.locator('tr', { hasText: name }).first();

export default {
  id: 'lesson-wds-a3',
  ...wdsLessonMeta(3, 'A', 'Targets *from the registry*', 'Typed, from a mapped surface with a stand-off, and from a formation top'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteSites(d, shared, /^Lesson A3/);
    await createSite(d, SITE);
    await addSlots(d, SLOTS);
    await confirmSite(d);
    await createWellbore(d, SITE, 'Ekene-11', { slot: 'S5' });
    await confirmWellbore(d);
    await createDesign(d, 'Ekene-11', 'Plan 1');
    await tab(d, 'Targets').click();
    await d.sleep(2000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'typed', chapter: 'A target by hand', chapterSub: 'From the kit\'s target table',
      say: 'Targets belong to the site, so every wellbore on the platform can aim at them. The simplest is typed. The Ekene target table gives T1 in the Oboro Sand: four hundred and two thousand two hundred and fifty east, five hundred and twenty one thousand seven hundred and fifty north, and one thousand eight hundred and eighty five point three six metres subsea, six thousand one hundred and eighty five point six feet.',
      sub: 'Targets belong to the site, so every wellbore on the platform can aim at them. The simplest is typed. The Ekene target table gives T1 in the Oboro Sand: 402,250 E, 521,750 N, and 1,885.36 m subsea, 6,185.6 ft.',
      do: async (d) => {
        await newTarget(d, { name: 'T1 typed', e: T1.e, n: T1.n, tvdss: '6185.6', onCamera: true });
        await d.sleep(800);
        await confirmTarget(d, { onCamera: true });
      } },
    { id: 'frame', chapter: 'One frame', chapterSub: 'Absolute coordinates',
      say: 'Eastings and northings are absolute, in the site\'s coordinate system, the same frame as the platform origin. You type where the target is, and the plan view and the solvers work out how far it is from each wellhead.',
      do: async (d) => {
        await d.highlight(row(d, 'T1 typed'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'surface', chapter: 'From a surface', chapterSub: 'The Oboro Sand top map',
      say: 'Better, take it from the geology. From surface samples a depth surface in the registry at a location. The Oboro Sand top map at T1 reads six thousand one hundred and fifty nine point three feet subsea, and T1 sits eight metres, twenty six point two feet, inside the sand. Depth below the pick sets that stand-off.',
      sub: 'Better, take it from the geology. From surface samples a depth surface in the registry at a location. The Oboro Sand top map at T1 reads 6,159.3 ft subsea, and T1 sits 8 m, 26.2 ft, inside the sand. Depth below the pick sets that stand-off.',
      do: async (d) => {
        await targetFromSurface(d, { surface: 'WDS demo: Oboro Sand top', x: T1.e, y: T1.n, below: '26.2', name: 'T1 Oboro Sand', onCamera: true });
        await d.sleep(800);
        await d.highlight(dialog(d).getByTestId('wd-pick-below'));
        await d.sleep(1500);
        await d.unhighlight();
        await confirmPick(d, { onCamera: true });
      } },
    { id: 'compare',
      say: 'Six thousand one hundred and eighty five point five feet, a tenth of a foot from the typed value, and the source column says it came from the Oboro Sand map, twenty six point two feet below. If the map is replaced later, this target will know.',
      sub: 'Six thousand one hundred and eighty five point five feet, 0.1 ft from the typed value, and the source column says it came from the Oboro Sand map, 26.2 ft below. If the map is replaced later, this target will know.',
      do: async (d) => {
        await expectText(d, row(d, 'T1 Oboro Sand'), /6185\.5[\s\S]*Surface: WDS demo: Oboro Sand top, 26\.2 ft below/, 'T1 from map');
        await d.highlight(row(d, 'T1 Oboro Sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'top', chapter: 'From a top', chapterSub: 'Where a well crossed the sand',
      say: 'From top takes a formation top picked in a registry well, and puts the target where that well crossed it. Ekene eight, from this platform, crossed the Oboro Sand at two thousand and thirty nine metres measured depth. The target lands at that point of its deviated path.',
      sub: 'From top takes a formation top picked in a registry well, and puts the target where that well crossed it. Ekene-8, from this platform, crossed the Oboro Sand at 2,039 m measured depth. The target lands at that point of its deviated path.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'From top', exact: true }));
        const dlg = dialog(d);
        await dlg.getByTestId('wd-pick-well').waitFor({ timeout: 60000 });
        await d.sleep(1000);
        await pick(d, dlg.getByTestId('wd-pick-well'), /^Ekene-8 /, { onCamera: true });
        await pick(d, dlg.getByTestId('wd-pick-top'), /^Oboro Sand \(/, { onCamera: true });
        await d.type(dlg.getByTestId('wd-pick-name'), 'Oboro Sand at Ekene-8');
        await d.sleep(600);
        await d.click(dlg.getByTestId('wd-pick-create'));
        await d.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'toprow',
      say: 'It sits where Ekene eight crossed the top: four hundred and two thousand and fifty east, five hundred and twenty two thousand one hundred and fifty north, six thousand one hundred and thirty one feet subsea, fifty four feet shallower than T1. The source names the top and the well, so if the correlation moves the top, this target will know too.',
      sub: 'It sits where Ekene-8 crossed the top: 402,050 E, 522,150 N, 6,131.0 ft subsea, 54 ft shallower than T1. The source names the top and the well, so if the correlation moves the top, this target will know too.',
      do: async (d) => {
        await expectText(d, row(d, 'Oboro Sand at Ekene-8'), /402050\.0\s*522150\.0\s*6131\.0[\s\S]*Top: Oboro Sand in Ekene-8/, 'top target');
        await d.highlight(row(d, 'Oboro Sand at Ekene-8'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'map', chapter: 'On the plan view', chapterSub: 'Targets around the wellhead',
      say: 'On the Design tab, the plan view draws the targets around Ekene eleven\'s wellhead, at true scale. Ekene eight reached the Oboro Sand north-north-east of the platform, and T1 lies to the east-north-east.',
      sub: 'On the Design tab, the plan view draws the targets around Ekene-11\'s wellhead, at true scale. Ekene-8 reached the Oboro Sand north-north-east of the platform, and T1 lies to the east-north-east.',
      do: async (d) => {
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1000);
        await d.click(d.page.getByRole('button', { name: 'Plots', exact: true }).first());
        await d.sleep(2000);
        await d.highlight(t(d, 'plan-view-chart'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Module B',
      say: 'Targets typed, from a map and from a well, in one frame with their sources. Module B solves the trajectory to them.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
