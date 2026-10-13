// Well Design with Petrolord, Lesson D11: the mud window and the casing
// seats. Ekene-11 (kickoff 500 ft) has no logs, so the prognosis comes from
// Ekene-8 on the same platform, published from Pore Pressure Studio
// (seed/wds_ppfg.mjs) and applied by subsea depth. Pressures as ppg, g/cc
// and MPa; the trip and kick margins; the bottom-up casing seats on
// Ekene-11's own measured depth; a wider trip margin moves them.
import { login, expectText, lessonSite, t, wdsLessonMeta } from './wds-common.mjs';

const SITE = 'Lesson D11: Ekene Alpha';
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();

export default {
  id: 'lesson-wds-d11',
  ...wdsLessonMeta(11, 'D', 'The mud window and *the casing seats*', 'A prognosis from the platform\'s own well, hung on the plan by subsea depth'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { kop: '500' });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Pressures for a well with no logs', chapterSub: 'Borrow the platform\'s prognosis',
      say: 'A planned well has no logs, so it has no pressure prognosis of its own. Ekene eight, drilled from the same platform, has one: Pore Pressure Studio computed it from Ekene eight\'s sonic and density, and published pore pressure, fracture pressure and overburden to the well registry. Pressure at a given depth below sea level is the same rock, so the mud window applies it to Ekene eleven by subsea depth.',
      sub: 'A planned well has no logs, so it has no pressure prognosis of its own. Ekene-8, drilled from the same platform, has one: Pore Pressure Studio computed it from Ekene-8\'s sonic and density, and published pore pressure, fracture pressure and overburden to the well registry. Pressure at a given depth below sea level is the same rock, so the mud window applies it to Ekene-11 by subsea depth.',
      do: async (d) => {
        await d.sleep(1200);
        await d.click(view(d, 'PPFG'));
        await t(d, 'mud-window-panel').waitFor({ timeout: 60000 });
        await d.sleep(2500);
        await d.highlight(t(d, 'wd-ppfg-source'));
        await d.sleep(3000);
        await d.unhighlight();
        await d.highlight(t(d, 'mud-window-source'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'window', chapter: 'The window', chapterSub: 'Between pore and fracture pressure',
      say: 'Pore pressure in red, fracture pressure in blue, overburden dashed, and the safe window shaded between them, as an equivalent mud weight in pounds per gallon against true vertical depth below the rotary table. Normally pressured to about four thousand feet, then the ramp into the overpressured Ogbia shale.',
      sub: 'Pore pressure in red, fracture pressure in blue, overburden dashed, and the safe window shaded between them, as an equivalent mud weight in ppg against true vertical depth below the rotary table. Normally pressured to about 4,000 ft, then the ramp into the overpressured Ogbia shale.',
      do: async (d) => {
        await d.highlight(t(d, 'mud-window-panel'));
        await d.sleep(6000);
        await d.unhighlight();
        await d.click(t(d, 'mud-window-mode-emw'));
        await d.sleep(1800);
        await d.click(t(d, 'mud-window-mode-mpa'));
        await d.sleep(1800);
        await d.click(t(d, 'mud-window-mode-ppg'));
        await d.sleep(1000);
      } },
    { id: 'seats', chapter: 'Casing seats', chapterSub: 'Bottom up, on this trajectory',
      say: 'The casing seats are chosen from the bottom up. The mud weight is the pore pressure plus a trip margin, and it must stay below the fracture pressure less a kick margin. Where it cannot, a shoe goes in. With half a pound of each: three shoes, at least one thousand four hundred and thirty two, four thousand four hundred and seventy eight, and five thousand three hundred and fifty eight feet true vertical depth, with their measured depths on Ekene eleven.',
      sub: 'The casing seats are chosen from the bottom up. The mud weight is the pore pressure plus a trip margin, and it must stay below the fracture pressure less a kick margin. Where it cannot, a shoe goes in. With 0.5 ppg of each: three shoes, at least 1,432, 4,478 and 5,358 ft true vertical depth, with their measured depths on Ekene-11.',
      do: async (d) => {
        await expectText(d, t(d, 'mud-window-seats'), /shoe 1 at least TVD 1432 ft[\s\S]*shoe 2 at least TVD 4478 ft[\s\S]*shoe 3 at least TVD 5358 ft/, 'seats 0.5');
        await d.highlight(t(d, 'mud-window-seats'));
        await d.sleep(6000);
        await d.unhighlight();
      } },
    { id: 'margins',
      say: 'The margins are a choice. With a trip margin of nought point three pounds per gallon the lighter mud holds for longer, and the shallow shoe is no longer needed: two shoes, at least four thousand four hundred and one and five thousand three hundred and forty six feet true vertical depth.',
      sub: 'The margins are a choice. With a trip margin of 0.3 ppg the lighter mud holds for longer, and the shallow shoe is no longer needed: two shoes, at least 4,401 and 5,346 ft true vertical depth.',
      do: async (d) => {
        await d.type(t(d, 'mud-window-trip'), '0.3');
        await d.sleep(2000);
        await expectText(d, t(d, 'mud-window-seats'), /shoe 1 at least TVD 4401 ft \(MD 4597\)[\s\S]*shoe 2 at least TVD 5346 ft \(MD 5596\)/, 'seats 0.3');
        await d.highlight(t(d, 'mud-window-seats'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson twelve',
      say: 'The pressures on the path you will drill, and where the casing must go. Last, the report pack.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
