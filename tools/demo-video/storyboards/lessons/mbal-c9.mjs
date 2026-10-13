// Material Balance with Petrolord, Lesson C9: contacts through time (Ekene
// gas-cap scenario). The piston-front estimate, the geometry, what the
// contact areas do, and the animated section.
import {
  login, expectText, deleteCases, seedCase, setCarterTracy, setContacts, t, tab, GASCAP, GASCAP_FILE, mbalLessonMeta,
} from './mbal-common.mjs';

export default {
  id: 'lesson-mbal-c9',
  ...mbalLessonMeta(9, 'C', 'Contacts *through time*', 'Influx raises the oil-water contact, the gas cap lowers the gas-oil contact'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson C9/);
    await seedCase(d, shared, 'Lesson C9: gas-cap scenario', {
      file: GASCAP_FILE, fluid: 'Oil with gas cap', c: GASCAP.c, pvt: GASCAP.pvt, reservoir: 'Ekene Sand (gas-cap scenario)',
      before: (dd) => setCarterTracy(dd, GASCAP.ct),
    });
    await d.click(tab(d, 'Contacts'));
    await t(d, 'mbal-contacts-initialOwcFt').waitFor({ timeout: 60000 });
    await d.sleep(1500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'idea', chapter: 'Where did the water go?', chapterSub: 'A piston front',
      say: 'The run says how much water came in and how much the gas cap expanded. The Contacts tab turns those volumes into contact depths. The net influx, the water in less the water produced, is spread over the oil-water contact area, filling the pore space between the connate water and the residual oil. The gas cap expansion is spread the same way over the gas-oil contact area. It is a piston-front screening estimate, with no coning, and the tab says so.',
      do: async (d) => {
        await d.highlight(d.page.getByText('Contact geometry', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'));
        await d.sleep(7000);
        await d.unhighlight();
      } },
    { id: 'geometry', chapter: 'The geometry', chapterSub: 'Depths, areas and residuals',
      say: 'For the scenario: the gas-oil contact at four thousand nine hundred and fifty feet and the oil-water contact at five thousand and sixty, true vertical depth sub sea; one hundred and eighty acres at the oil-water contact and two hundred at the gas-oil contact; porosity nought point two two; residual oil nought point two five to water and nought point one five to gas. Save, and they are kept with the case and printed in the report.',
      sub: 'For the scenario: the gas-oil contact at 4,950 ft and the oil-water contact at 5,060 ft TVDSS; 180 acres at the oil-water contact and 200 at the gas-oil contact; porosity 0.22; residual oil 0.25 to water and 0.15 to gas. Save, and they are kept with the case and printed in the report.',
      do: async (d) => {
        await setContacts(d, GASCAP.contacts, { onCamera: true });
      } },
    { id: 'current',
      say: 'By the last survey the oil-water contact has risen to five thousand and thirty four point four feet, and the gas-oil contact has come down to four thousand nine hundred and seventy five point five, leaving fifty eight point nine feet of oil.',
      do: async (d) => {
        const cards = d.page.getByText('Current OWC').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
        await expectText(d, cards, /Current OWC\s*5034\.4 ft[\s\S]*Current GOC\s*4975\.5 ft[\s\S]*Remaining oil column\s*58\.9 ft/, 'current contacts');
        await d.highlight(cards);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'play', chapter: 'Through time', chapterSub: 'Press play',
      say: 'The section plays it through time. Water sweeps up from below, gas expands down from above, and the hatching marks the rock each has swept. On a survey date the contacts are the computed ones; between surveys they are interpolated.',
      do: async (d) => {
        const anim = t(d, 'mbal-contacts-anim');
        await anim.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await d.sleep(1200);
        await d.click('mbal-contacts-anim-reset');
        await d.sleep(600);
        await d.click('mbal-contacts-anim-play');
        await d.waitText('mbal-contacts-anim-play', /Play/, { timeout: 30000 });
      } },
    { id: 'slider', chapter: 'The slider', chapterSub: 'Any date',
      say: 'Drag the slider to any date to read the contacts, the pressure and the oil column then. The depths are true; the shape of the structure is a schematic.',
      do: async (d) => {
        const s = t(d, 'mbal-contacts-anim-slider');
        const b = await s.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.95, y: b.y + b.height / 2 });
        await d.page.mouse.down();
        for (let f = 0.95; f >= 0.45; f -= 0.05) { await d.page.mouse.move(b.x + b.width * f, b.y + b.height / 2, { steps: 4 }); await d.page.evaluate(([x, y]) => window.__demo.moveTo(x, y, 60), [b.x + b.width * f, b.y + b.height / 2]); await d.sleep(220); }
        await d.page.mouse.up();
        await d.sleep(1500);
        await d.highlight(t(d, 'mbal-contacts-anim-readout'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'area', chapter: 'What the area does', chapterSub: 'Twice the area, half the rise',
      say: 'The contact area matters as much as the volume. Double the oil-water contact area to three hundred and sixty acres, and play it again: the same influx raises the contact by half as much, twelve point eight feet.',
      do: async (d) => {
        const f = t(d, 'mbal-contacts-areaOwcAcres');
        await f.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        const inp = (await f.locator('input').count()) ? f.locator('input').first() : f;
        await d.type(inp, '360');
        await inp.press('Tab');
        await d.sleep(1200);
        const anim = t(d, 'mbal-contacts-anim');
        await anim.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.click('mbal-contacts-anim-play');
        await d.waitText('mbal-contacts-anim-play', /Play/, { timeout: 30000 });
        await expectText(d, 'mbal-contacts-anim-readout', /OWC risen by\s*12\.8 ft/, 'half the rise');
        await d.highlight(t(d, 'mbal-contacts-anim-readout'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'A gas reservoir',
      say: 'Next, Module D: a dry gas reservoir, and the p over z plot.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
