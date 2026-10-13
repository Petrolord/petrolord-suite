// Volumetrics with Petrolord, Lesson A4: area-depth tables and areas of
// interest. The booked top and base measured into an area against depth
// table (with the base from the base surface, #1041), the volume from the
// table beside the Surfaces volume, the spill field, and an area of
// interest drawn on the map that clips the volume to the northern crest.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, rcpLessonMeta,
} from './rcp-common.mjs';

const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
const AOI = 'Lesson northern crest';
// UTM 32N corners of the area of interest (the north half of the crest)
const RING = [[400700, 521700], [402300, 521700], [402300, 522750], [400700, 522750]];

/** World coordinates to page pixels on the RCP 2D map (its canvas carries the transform). */
async function mapToScreen(d) {
  const cv = t(d, 'rcp-map-canvas');
  const a = await cv.evaluate((e) => ({ scale: +e.dataset.scale, cx: +e.dataset.cx, cy: +e.dataset.cy, vw: +e.dataset.vw, vh: +e.dataset.vh }));
  const b = await cv.boundingBox();
  return ([x, y]) => ({ x: b.x + a.vw / 2 + (x - a.cx) * a.scale, y: b.y + a.vh / 2 - (y - a.cy) * a.scale });
}

export default {
  id: 'lesson-rcp-a4',
  ...rcpLessonMeta(4, 'A', 'Area-depth tables and *areas of interest*', 'The structure as a table, and the volume inside a polygon'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await d.page.getByRole('tab', { name: 'Fluid' }).click();
    await d.page.locator('div.space-y-1:has(> label:text-is("Formation Vol Factor (Bo)")) input').first().fill('1.2');
    await d.page.keyboard.press('Tab');
    await t(d, 'rcp-tab-geometry').click();
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Area against depth', chapterSub: 'The structure as a table',
      say: 'The booked case on the two maps holds twelve point one four million barrels. Many reserves teams carry the structure as a table instead: the area enclosed by the top and by the base at each depth. ReservoirCalc Pro reads such a table, and builds one from the maps.',
      sub: 'The booked case on the two maps holds 12.14 million barrels. Many reserves teams carry the structure as a table instead: the area enclosed by the top and by the base at each depth. ReservoirCalc Pro reads such a table, and builds one from the maps.',
      do: async (d) => {
        await expectText(d, card(d), /12\.14 MM/, 'booked volume');
        await d.highlight(card(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'table',
      say: 'Switch to the Area depth method and press From the top surface. With a base surface chosen, the base areas come from it: forty levels, from the crest to the deepest base.',
      sub: 'Switch to the Area-depth method and press From the top surface. With a base surface chosen, the base areas come from it: forty levels, from the crest to the deepest base.',
      do: async (d) => {
        await d.click(d.page.locator('label[for="im-areadepth"]'));
        await d.sleep(800);
        await d.click('rcp-ad-from-surface');
        await d.sleep(800);
        await expectText(d, 'rcp-ad-msg', /Measured 40 levels from "Ekene Sand top \(6-well map\)" and "Ekene Sand base \(6-well map\)" as the base/, 'table message');
        await d.highlight('rcp-ad-msg');
        await d.sleep(2000);
        await d.unhighlight();
        const tb = t(d, 'rcp-ad-table');
        await tb.scrollIntoViewIfNeeded();
        await d.highlight(tb);
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'volume',
      say: 'The contact cuts the table just as it cuts the maps: twelve point one nine million barrels, within half a percent of the map volume, from forty rows. Export CSV writes the table for anyone who carries structures that way.',
      do: async (d) => {
        await stoiip(d);
        await expectText(d, t(d, 'rcp-stooip'), /12\.19 MM/, 'table volume');
        await d.highlight(card(d));
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight('rcp-ad-export');
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'spill',
      say: 'A table has no map to find a spill point, so type it if you know it. A contact below it is then taken at the spill.',
      do: async (d) => {
        const sp = t(d, 'rcp-ad-spill');
        await sp.scrollIntoViewIfNeeded();
        await d.highlight(sp.locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'aoi', chapter: 'Areas of interest', chapterSub: 'A polygon that clips the volume',
      say: 'Back on the Surfaces method, an area of interest clips the volume to a polygon: a licence, a fault block, or the part one well drains. Draw it on the map, a click at each corner, then Finish and name it.',
      do: async (d) => {
        await d.click(d.page.locator('label[for="im-surfaces"]'));
        await stoiip(d);
        await d.click('rcp-tab-aoi');
        await d.sleep(600);
        await d.click(d.page.getByRole('button', { name: /Draw New Polygon/ }));
        await d.sleep(600);
        const toScreen = await mapToScreen(d);
        for (const p of RING) {
          const s = toScreen(p);
          await d.moveTo(s, { ms: 600 });
          await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [s.x, s.y]);
          await d.page.mouse.click(s.x, s.y);
          await d.sleep(500);
        }
        await d.click(d.page.getByRole('button', { name: /Finish/ }));
        await dialog(d).waitFor();
        await d.type(dialog(d).locator('input').first(), AOI);
        await d.click(dialog(d).getByRole('button', { name: 'Save Area' }));
        await d.sleep(800);
      } },
    { id: 'clip',
      say: 'Once it is active, only the rock inside counts: six point four seven million barrels over two hundred and four acres. Press Active to clear it. Lesson five turns to the rock properties.',
      do: async (d) => {
        const row = t(d, `rcp-aoi-row-${AOI}`).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
        await stoiip(d);
        await expectText(d, card(d), /6\.47 MM[\s\S]*HC Area:\s*204 acres/, 'clipped volume');
        await d.highlight(card(d));
        await d.sleep(3000);
        await d.unhighlight();
        await d.click(row.getByRole('button', { name: 'Active' }));
        await stoiip(d);
        await stoiip(d);
      } },
  ],
};
