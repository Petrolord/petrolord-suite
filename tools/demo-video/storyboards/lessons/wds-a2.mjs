// Well Design with Petrolord, Lesson A2: wellbores and the three norths.
// Ekene-11 on slot S5: the datum in feet (KB 82 ft, water 115 ft), the
// depth unit, the azimuth reference (grid, true, magnetic), the grid
// convergence and the WMM2025 magnetic field looked up live, and a design.
import {
  login, expectText, openStudio, deleteSites, ALL_VIDEO_SITES, createSite, addSlots, confirmSite, createWellbore, confirmWellbore,
  createDesign, dialog, pick, t, tab, wdsLessonMeta, SLOTS,
} from './wds-common.mjs';

const SITE = 'Lesson A2: Ekene Alpha';

export default {
  id: 'lesson-wds-a2',
  ...wdsLessonMeta(2, 'A', 'Wellbores and *the three norths*', 'Slot, datum, depth unit, azimuth reference and the magnetic field'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteSites(d, shared, ALL_VIDEO_SITES);
    await createSite(d, SITE);
    await addSlots(d, SLOTS);
    await confirmSite(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'new', chapter: 'A wellbore', chapterSub: 'From the site menu',
      say: 'A wellbore is one hole from the platform. From the site menu, New wellbore. Ekene eleven goes on slot five, five metres east of the platform centre, so its wellhead comes from the slot.',
      sub: 'A wellbore is one hole from the platform. From the site menu, New wellbore. Ekene-11 goes on slot S5, 5 m east of the platform centre, so its wellhead comes from the slot.',
      do: async (d) => {
        await createWellbore(d, SITE, 'Ekene-11', { onCamera: true, slot: 'S5', kb: null, water: null, unit: null });
        await d.sleep(800);
      } },
    { id: 'datum', chapter: 'The datum', chapterSub: 'Depths from the kelly bushing',
      say: 'Depths are measured from the kelly bushing. Plan in feet, and the datum fields follow: the kelly bushing is eighty two feet above sea level, and the water is thirty five metres deep, one hundred and fifteen feet. Every subsea depth in the plan is the measured depth less eighty two feet.',
      sub: 'Depths are measured from the kelly bushing. Plan in feet, and the datum fields follow: the kelly bushing is 82 ft above sea level, and the water is 35 m deep, 115 ft. Every subsea depth in the plan is the measured depth less 82 ft.',
      do: async (d) => {
        const dlg = dialog(d);
        const unitTrigger = dlg.getByText('Depth unit', { exact: true }).locator('..').getByRole('combobox');
        if (!(await unitTrigger.innerText()).includes('Feet')) await pick(d, unitTrigger, 'Feet', { onCamera: true });
        await d.type(dlg.getByTestId('wellbore-kb-elev'), '82');
        await d.type(dlg.getByTestId('wellbore-water-depth'), '114.8');
        await d.sleep(800);
      } },
    { id: 'norths', chapter: 'Three norths', chapterSub: 'Grid, true and magnetic',
      say: 'Then the azimuth reference, which decides which north you type and read. Grid north is the map\'s. True north differs from it by the grid convergence, which depends on where you are in the projection. Magnetic north is what the measurement while drilling tool senses, and it differs from true north by the declination, which changes with place and time.',
      do: async (d) => {
        const dlg = dialog(d);
        const az = dlg.getByText('Azimuth reference', { exact: true }).locator('..').getByRole('combobox');
        await d.click(az);
        await d.sleep(5000);
        await d.click(d.page.getByRole('option', { name: 'Grid north', exact: true }));
        await d.sleep(600);
      } },
    { id: 'mag', chapter: 'The magnetic field', chapterSub: 'World Magnetic Model 2025',
      say: 'The dialog works both out for the wellhead as you go: a grid convergence of nought point nought seven three degrees, and from the World Magnetic Model twenty twenty five, a declination of nought point four six degrees west, a dip of seventeen point seven degrees and a total field of thirty two point nine five microtesla. Saving caches them on the wellbore.',
      sub: 'The dialog works both out for the wellhead as you go: a grid convergence of 0.073°, and from the World Magnetic Model 2025, a declination of 0.46° west, a dip of 17.7° and a total field of 32.95 µT. Saving caches them on the wellbore.',
      do: async (d) => {
        await expectText(d, dialog(d), /convergence at wellhead: 0\.0729 deg[\s\S]*Declination \(WMM-2025\): -0\.4627 deg[\s\S]*dip -17\.67 deg, field 32\.95 uT/, 'magnetics');
        await d.highlight(t(d, 'wellbore-declination').locator('xpath=..'));
        await d.sleep(6000);
        await d.unhighlight();
        await confirmWellbore(d, { onCamera: true });
      } },
    { id: 'design', chapter: 'Designs', chapterSub: 'Plans under a wellbore',
      say: 'Under the wellbore sit designs. One wellbore can carry several, a base case beside an alternative, or an original plan beside a sidetrack, without either overwriting the other. The design settings repeat the wellhead, the convergence, the declination and the kelly bushing, and every azimuth field says which north it is in.',
      do: async (d) => {
        await createDesign(d, 'Ekene-11', 'Plan 1', { onCamera: true });
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1200);
        const line = d.page.getByText(/^Wellhead 401705\.0 E/).first();
        await expectText(d, line, /convergence 0\.073 deg \| declination -0\.463 deg \| KB 82\.0 ft/, 'settings line');
        await d.highlight(line);
        await d.sleep(3500);
        await d.unhighlight();
        await d.highlight(d.page.getByText(/KO Azi \(deg grid\)/).first());
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson three',
      say: 'A wellbore that knows its datum and its north. Next, the targets it will drill to.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
