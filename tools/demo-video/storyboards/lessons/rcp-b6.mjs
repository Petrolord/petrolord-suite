// Volumetrics with Petrolord, Lesson B6: saturation height.
// The booked case with one typed Sw (0.35, the value above the transition
// zone) against Sw from the capillary-pressure chain of the SCAL Studio
// project "Ekene Sand J-function" (Petrophysics lesson E18), with its
// free-water level: on Ekene's thin oil column most of the leg is in the
// transition zone, so the leg average is higher and the volume lower.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, rcpLessonMeta,
} from './rcp-common.mjs';

const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

export default {
  id: 'lesson-rcp-b6',
  ...rcpLessonMeta(6, 'B', 'Saturation *height*', 'Water saturation from the capillary pressure curve, against one typed value'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'One saturation, or many', chapterSub: 'The typed Sw',
      say: 'The booked case uses one water saturation for the whole oil leg: zero point three five, the value well above the contact, where the rock has drained to its irreducible water. Twelve point one four million barrels.',
      sub: 'The booked case uses one water saturation for the whole oil leg: 0.35, the value well above the contact, where the rock has drained to its irreducible water. 12.14 million barrels.',
      do: async (d) => {
        const sw = d.page.locator('div.space-y-1:has(> label:text-is("Water Saturation")) input').first();
        await sw.scrollIntoViewIfNeeded();
        await d.highlight(sw);
        await d.sleep(2000);
        await d.unhighlight();
        await expectText(d, card(d), /12\.14 MM/, 'booked volume');
      } },
    { id: 'shm', chapter: 'Sw from saturation height', chapterSub: 'The SCAL Studio J function',
      say: 'Near the contact the rock holds more water: the capillary pressure curve says how much at each height above the free water level. Choose saturation height, and pick the Ekene Sand J function fitted in SCAL Studio. The free water level comes with it: five thousand and forty six point four feet, just below the contact.',
      sub: 'Near the contact the rock holds more water: the capillary pressure curve says how much at each height above the free-water level. Choose saturation height, and pick the Ekene Sand J function fitted in SCAL Studio. The free-water level comes with it: 5,046.4 ft, just below the contact.',
      do: async (d) => {
        const src = t(d, 'rcp-sw-source');
        await src.scrollIntoViewIfNeeded();
        await d.select(src, 'shm');
        await t(d, 'rcp-shm-project').waitFor({ timeout: 30000 });
        await d.sleep(800);
        await d.select(t(d, 'rcp-shm-project'), { label: 'Ekene Sand J-function' });
        await d.sleep(2000);
        const fwl = t(d, 'rcp-shm-fwl');
        await d.highlight(fwl);
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'result', chapter: 'The leg average', chapterSub: 'Thin column, high Sw',
      say: 'Sw is taken at each depth from its height above the free water level, and averaged over the leg with the rock at that depth: zero point five three four. The Ekene oil column is thin, so much of it is transition zone, and the volume falls to eight point seven zero million barrels.',
      sub: 'Sw is taken at each depth from its height above the free-water level, and averaged over the leg with the rock at that depth: 0.534. The Ekene oil column is thin, so much of it is transition zone, and the volume falls to 8.70 million barrels.',
      do: async (d) => {
        await stoiip(d);
        await expectText(d, t(d, 'rcp-shm-result'), /oil leg 0\.534/, 'leg Sw');
        await d.highlight(t(d, 'rcp-shm-result'));
        await d.sleep(2000);
        await d.unhighlight();
        await expectText(d, card(d), /8\.70 MM/, 'shm volume');
        await d.highlight(card(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'which', chapter: 'Which to book', chapterSub: 'A question the reviewer will ask',
      say: 'Which is right is a question the reviewer will ask. A typed saturation is the crest value applied everywhere; the saturation height function follows the rock and the contact, and the logs in Ekene one and Ekene three, low on the structure, read high water for the same reason. The results say which one a run used.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await d.sleep(1500);
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        const u = t(d, 'rcp-shm-used');
        await u.waitFor({ timeout: 30000 });
        await d.highlight(u);
        await d.sleep(3500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'mc',
      say: 'Saturation height drives the deterministic case. A Monte Carlo run keeps its own range for Sw, which can be set from these two values.',
      do: async (d) => {
        await d.select(t(d, 'rcp-sw-source'), 'typed');
        await stoiip(d);
        await expectText(d, card(d), /12\.14 MM/, 'back to the booked volume');
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Fluids',
      say: 'Next, the fluids: the formation volume factor, solution gas, and a gas cap.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
