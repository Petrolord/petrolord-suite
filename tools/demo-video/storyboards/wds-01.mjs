// Well Design Studio, demo 1: from the map to a well path (Ekene kit v4).
// A site for the Ekene Alpha platform, the Ekene-11 wellbore on its slot
// with the magnetic field looked up live, the target T1 taken from the
// Oboro Sand top map 26.2 ft (8 m) into the sand, a build and hold solved
// to it, the KPI strip, the plan, section and 3D views, and Save.
// `expectText` steps stop the take if the screen disagrees with the
// narration (LENIENT=1 logs instead, for writing).
import {
  login, expectText, openStudio, deleteSites, createSite, addSlots, confirmSite, createWellbore, confirmWellbore,
  createDesign, targetFromSurface, confirmPick, solveJ, saveDesign, ALL_VIDEO_SITES, t, tab, dialog, SLOTS, T1,
} from './wds-common.mjs';

const SITE = 'WDS demo: Ekene Alpha';
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();

export default {
  id: 'wds-01',
  app: 'Well Design Studio',
  eyebrow: 'Well Design Studio · 1 of 3',
  title: 'From the map to *a well path*',
  subtitle: 'A platform, a wellbore that knows its north, a target from the Oboro Sand map and a build and hold to it',
  outroTitle: 'Well design *with Petrolord*',
  outroSub: 'Well Design Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteSites(d, shared, ALL_VIDEO_SITES);
    await openStudio(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Well Design Studio', chapterSub: 'The next well on Ekene',
      say: 'Well Design Studio plans the next well: where it starts, how it builds angle, where it lands, and how close it comes to everything already in the ground. Ekene\'s next well is Ekene eleven, from the Ekene Alpha platform to the Oboro Sand. Everything hangs off a site, so we start there.',
      sub: 'Well Design Studio plans the next well: where it starts, how it builds angle, where it lands, and how close it comes to everything already in the ground. Ekene\'s next well is Ekene-11, from the Ekene Alpha platform to the Oboro Sand. Everything hangs off a site, so we start there.',
      do: async (d) => {
        await d.sleep(2500);
        await d.click(d.page.getByTitle('New site'));
        await dialog(d).getByText('Site name').waitFor();
        await d.sleep(600);
      } },
    { id: 'site', chapter: 'The site', chapterSub: 'Coordinates, origin and slots',
      say: 'The site is the platform. It carries the coordinate system the whole field is mapped in, W. G. S. eighty four, U. T. M. zone thirty two north, the platform origin, and the slots, two and a half metres apart. Every wellbore on the platform takes its wellhead from a slot.',
      sub: 'The site is the platform. It carries the coordinate system the whole field is mapped in, WGS 84 / UTM zone 32N, the platform origin, and the slots, 2.5 m apart. Every wellbore on the platform takes its wellhead from a slot.',
      do: async (d) => {
        await createSite(d, SITE, { onCamera: true, open: false });
        await addSlots(d, SLOTS);
        await d.sleep(1200);
        await confirmSite(d, { onCamera: true });
      } },
    { id: 'wellbore', chapter: 'The wellbore', chapterSub: 'Slot, datum and north',
      say: 'Then the wellbore: Ekene eleven, on slot five, planned in feet. The kelly bushing is eighty two feet above sea level in thirty five metres of water, one hundred and fifteen feet. As the slot is chosen, the dialog works out the grid convergence, seven hundredths of a degree, and looks up the magnetic field from the World Magnetic Model: a declination of nought point four six degrees west. Azimuths in grid, true or magnetic north all convert through them.',
      sub: 'Then the wellbore: Ekene-11, on slot S5, planned in feet. The kelly bushing is 82 ft above sea level in 35 m of water, 115 ft. As the slot is chosen, the dialog works out the grid convergence, 0.07°, and looks up the magnetic field from the World Magnetic Model: a declination of 0.46° west. Azimuths in grid, true or magnetic north all convert through them.',
      do: async (d) => {
        await createWellbore(d, SITE, 'Ekene-11', { onCamera: true, slot: 'S5' });
        await d.sleep(800);
        await expectText(d, dialog(d), /convergence at wellhead: 0\.0729 deg[\s\S]*Declination \(WMM-2025\): -0\.4627 deg/, 'magnetics');
        const mag = t(d, 'wellbore-declination').locator('xpath=..');
        await d.highlight(mag);
        await d.sleep(3500);
        await d.unhighlight();
        await confirmWellbore(d, { onCamera: true });
      } },
    { id: 'target', chapter: 'The target', chapterSub: 'From the Oboro Sand map',
      say: 'Now the target. The geologists published the Oboro Sand top map to the registry. From surface samples it at the target location, and the well should land twenty six point two feet, eight metres, inside the sand.',
      sub: 'Now the target. The geologists published the Oboro Sand top map to the registry. From surface samples it at the target location, and the well should land 26.2 ft, 8 m, inside the sand.',
      do: async (d) => {
        await d.click(tab(d, 'Targets'));
        await d.sleep(1500);
        await targetFromSurface(d, { surface: 'WDS demo: Oboro Sand top', x: T1.e, y: T1.n, below: '26.2', name: T1.name, onCamera: true });
        await d.sleep(800);
        await confirmPick(d, { onCamera: true });
      } },
    { id: 'targetrow',
      say: 'T1 is at six thousand one hundred and eighty five point five feet subsea, and the row says where it came from: the Oboro Sand map, so if the map is ever replaced, this target will know.',
      sub: 'T1 is at 6,185.5 ft subsea, and the row says where it came from: the Oboro Sand map, so if the map is ever replaced, this target will know.',
      do: async (d) => {
        const row = d.page.locator('tr', { hasText: T1.name }).first();
        await expectText(d, row, /6185\.5/, 'T1 TVDSS');
        await d.highlight(row);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'design', chapter: 'The trajectory', chapterSub: 'Build and hold',
      say: 'A design under the wellbore holds the trajectory. Design methods offers six solvers. Build and hold is the classic: vertical to the kickoff, one build, then a straight tangent onto the target. We kick off at thirteen hundred and twelve feet and build at two and a half degrees per hundred feet.',
      sub: 'A design under the wellbore holds the trajectory. Design methods offers six solvers. Build and hold is the classic: vertical to the kickoff, one build, then a straight tangent onto the target. We kick off at 1,312 ft and build at 2.54° per 100 ft.',
      do: async (d) => {
        await createDesign(d, 'Ekene-11', 'Plan 1', { onCamera: true });
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1200);
        await solveJ(d, T1.name, { kop: '1312.3', rate: '2.54', onCamera: true });
      } },
    { id: 'kpis', chapter: 'Reading the design', chapterSub: 'The KPI strip',
      say: 'Solved. Six thousand six hundred and twenty three feet of hole to reach the target at six thousand two hundred and sixty eight feet true vertical depth, one thousand eight hundred and fifty five feet out from the platform, holding twenty two point four degrees on an azimuth of seventy four point seven.',
      sub: 'Solved. 6,623 ft of hole to reach the target at 6,268 ft true vertical depth, 1,855 ft out from the platform, holding 22.4° on an azimuth of 74.7°.',
      do: async (d) => {
        await expectText(d, kpis(d), /Total MD\s*6623[\s\S]*6268[\s\S]*Displacement\s*1855[\s\S]*Max Inc\s*22\.4/i, 'KPIs');
        await d.highlight(kpis(d));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'plots', chapter: 'Four views', chapterSub: 'Plan, section, inclination, dogleg',
      say: 'Plots puts the plan view, the section, the inclination and the dogleg severity side by side. The plan view is a true map, so north is never stretched against east, and the section is drawn at true scale, so a gentle build looks gentle.',
      do: async (d) => {
        await d.click(view(d, 'Plots'));
        await d.sleep(2500);
        await d.highlight(t(d, 'plan-view-chart'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: '3d',
      say: 'And the three D view puts the whole well in a cube, with the target where the map put it.',
      do: async (d) => {
        await d.click(view(d, '3D'));
        await t(d, 'wp-cube-view').waitFor({ timeout: 30000 });
        await d.sleep(4500);
      } },
    { id: 'save', chapter: 'Save', chapterSub: 'The saved trajectory is the authority',
      say: 'Save writes the segments and every computed station. Anti-collision, the reports, the exports and the other drilling apps all read the saved trajectory, never the editor, so nothing downstream sees a change until it is saved.',
      do: async (d) => {
        await d.click(view(d, 'Section'));
        await d.sleep(1200);
        await saveDesign(d, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'next', chapter: 'Map to well path', chapterSub: 'One map, one target, one plan',
      say: 'A platform, a wellbore that knows which north it speaks, and a target taken straight from the geologists\' map. Next: who else is down there, and how close Ekene eleven comes to its neighbours.',
      sub: 'A platform, a wellbore that knows which north it speaks, and a target taken straight from the geologists\' map. Next: who else is down there, and how close Ekene-11 comes to its neighbours.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
