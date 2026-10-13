// Well Design with Petrolord, Lesson A1: sites and slots. The studio's
// tree and tabs, a new site for the Ekene Alpha platform (the kit's site
// card, 07-well-design/ekene-alpha-site.csv): the CRS picker, the north
// reference, the platform origin and a slot template, and the site menu.
import {
  login, expectText, openStudio, deleteSites, ALL_VIDEO_SITES, createSite, addSlots, confirmSite, treeRow, treeMenu, dialog, tab,
  wdsLessonMeta, SLOTS,
} from './wds-common.mjs';

const SITE = 'Lesson A1: Ekene Alpha';

export default {
  id: 'lesson-wds-a1',
  ...wdsLessonMeta(1, 'A', 'Sites *and slots*', 'The workspace, a coordinate system, the platform origin and the slot template'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteSites(d, shared, ALL_VIDEO_SITES);
    await openStudio(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'tabs', chapter: 'Well Design Studio', chapterSub: 'The workspace',
      say: 'Well Design Studio is laid out like the plan it builds. On the left, a tree: sites, the wellbores on each site, and the designs under each wellbore. On the right, the work in the order you do it: the design itself, the targets, actual surveys, anti-collision, the report pack, and the other drilling apps that read the plan.',
      do: async (d) => {
        await d.moveTo(d.page.getByText('SITES').first());
        await d.sleep(2500);
        for (const name of ['Design', 'Targets', 'Surveys', 'Anti-Collision', 'Reports', 'Apps']) {
          await d.moveTo(tab(d, name));
          await d.sleep(1400);
        }
      } },
    { id: 'site', chapter: 'A new site', chapterSub: 'The platform',
      say: 'Everything hangs off a site: a platform, a pad or a location. It carries what every well drilled from it shares. The Ekene site card in the kit gives the platform, Ekene Alpha.',
      do: async (d) => {
        await d.click(d.page.getByTitle('New site'));
        await dialog(d).getByText('Site name').waitFor();
        await d.sleep(1500);
        await d.type(dialog(d).locator('input').first(), SITE);
        await d.sleep(800);
      } },
    { id: 'crs', chapter: 'The coordinate system', chapterSub: 'Where the wells are on the earth',
      say: 'The coordinate reference system is not decoration. It places the wells on the earth, drives the magnetic lookup for every wellbore, and lines the platform up with the seismic and the registry wells. The picker opens on the Nigerian systems first, Minna belts onshore and the U. T. M. zones offshore. Ekene is mapped in W. G. S. eighty four, U. T. M. zone thirty two north.',
      sub: 'The coordinate reference system is not decoration. It places the wells on the earth, drives the magnetic lookup for every wellbore, and lines the platform up with the seismic and the registry wells. The picker opens on the Nigerian systems first, Minna belts onshore and the UTM zones offshore. Ekene is mapped in WGS 84 / UTM zone 32N.',
      do: async (d) => {
        const dlg = dialog(d);
        await d.click(dlg.getByRole('button').filter({ hasText: /CRS|Select|EPSG|coordinate/i }).first());
        await d.sleep(3500);
        await d.type(d.page.getByPlaceholder(/Search name, EPSG/), '32632');
        await d.sleep(1200);
        await d.click(d.page.getByTestId('crs-search-results').getByRole('button', { name: /32632/ }).first());
        await d.sleep(1000);
      } },
    { id: 'origin', chapter: 'Origin and north', chapterSub: 'Grid north, the platform centre',
      say: 'Grid north is the north of the map, and it is what the studio stores and computes in. The origin is the platform centre: four hundred and one thousand seven hundred east, five hundred and twenty one thousand six hundred north, in metres, the same frame as every target and registry well.',
      sub: 'Grid north is the north of the map, and it is what the studio stores and computes in. The origin is the platform centre: 401,700 E, 521,600 N, in metres, the same frame as every target and registry well.',
      do: async (d) => {
        const dlg = dialog(d);
        await d.moveTo(dlg.getByText('North reference').first());
        await d.sleep(1500);
        const nums = dlg.locator('input[type=number]');
        await d.type(nums.nth(0), '401700');
        await d.type(nums.nth(1), '521600');
        await d.sleep(800);
      } },
    { id: 'slots', chapter: 'Slots', chapterSub: 'Wellheads on the platform',
      say: 'Then the slot template: each slot is an offset from the origin, east and north, in metres. Ekene Alpha has two rows of slots two and a half metres apart. A wellbore takes its wellhead from a slot, so the spacing set here is the spacing anti-collision will check.',
      sub: 'Then the slot template: each slot is an offset from the origin, east and north, in metres. Ekene Alpha has two rows of slots 2.5 m apart. A wellbore takes its wellhead from a slot, so the spacing set here is the spacing anti-collision will check.',
      do: async (d) => {
        await addSlots(d, SLOTS.slice(0, 2), { onCamera: true });
        await addSlots(d, SLOTS.slice(2));
        await d.sleep(1500);
        await confirmSite(d, { onCamera: true });
      } },
    { id: 'tree', chapter: 'The site menu', chapterSub: 'Wellbores, edits and sharing',
      say: 'The site is in the tree, and the breadcrumb and the coordinate system badge follow it. Its menu adds wellbores, edits the site, and shares it with the organisation, so colleagues see the same platform, its targets and its plans.',
      do: async (d) => {
        await d.highlight(treeRow(d, SITE));
        await d.sleep(2000);
        await d.unhighlight();
        await d.moveTo(d.page.getByText('EPSG:32632').first());
        await d.sleep(1500);
        const row = treeRow(d, SITE);
        await row.hover();
        await d.sleep(300);
        await d.click(row.locator('button[aria-haspopup=menu]').first());
        await d.sleep(4500);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson two',
      say: 'A site with its coordinate system, its origin and its slots. Next, a wellbore on one of those slots, and the three norths.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
