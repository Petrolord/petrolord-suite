// Volumetrics with Petrolord, Lesson A3: contacts, closure and spill.
// On the seismic depth maps of the Ekene Sand (Seismolord demo 3, a closed
// rollover inside the 3D survey) with the booked rock properties: a contact
// above the spill cuts the trap; a contact below it is filled to the spill
// with Trap only, or runs off the map without it (an open closure, a
// minimum); the STOIIP-against-contact curve; and why the booked six-well
// map, which stops at the outer wells, runs with Trap only off.
import {
  login, expectText, openRcp, importRegistrySurface, surfaceCard, setContact, setTrapOnly, fieldByLabel, stoiip,
  t, dialog, TOP, BASE, rcpLessonMeta,
} from './rcp-common.mjs';

const STOP = 'Ekene Sand (depth ft)';
const SBASE = 'Ekene Sand Base (depth ft)';
const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

async function openDetailed(d) {
  await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
  await dialog(d).getByText('Detailed', { exact: true }).waitFor({ timeout: 30000 });
  await d.click(dialog(d).getByText('Detailed', { exact: true }));
  await d.sleep(1500);
}
async function useAsTopBase(d, top, base) {
  await surfaceCard(d, top).getByRole('button', { name: /Set Top/ }).click();
  await surfaceCard(d, base).getByRole('button', { name: /Set Base/ }).click();
  await stoiip(d);
}

export default {
  id: 'lesson-rcp-a3',
  ...rcpLessonMeta(3, 'A', 'Contacts, closure *and spill*', 'Trap only, the spill point, an open closure, and the volume against the contact'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await d.page.locator('label[for="im-surfaces"]').click();
    await t(d, 'rcp-tab-geometry').click();
    await fieldByLabel(d, 'Net-to-Gross').fill('0.8');
    await fieldByLabel(d, 'Water Saturation').fill('0.35');
    await d.page.keyboard.press('Tab');
    await t(d, 'rcp-tab-surfaces').click();
    for (const nm of [STOP, SBASE, TOP, BASE]) await importRegistrySurface(d, nm);
    await useAsTopBase(d, STOP, SBASE);
    await t(d, 'rcp-tab-geometry').click();
    await setContact(d, '-5036.1');
    await setTrapOnly(d, true);
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Where the oil stops', chapterSub: 'The contact and the trap',
      say: 'The rock volume is the part of the reservoir above the contact, inside the trap. These are the Seismolord depth maps of the Ekene Sand top and base: the rollover closes inside the survey. The contact is five thousand and thirty six feet below sea level, and Trap only is on.',
      sub: 'The rock volume is the part of the reservoir above the contact, inside the trap. These are the Seismolord depth maps of the Ekene Sand top and base: the rollover closes inside the survey. The contact is 5,036 ft below sea level, and Trap only is on.',
      do: async (d) => {
        await d.highlight(t(d, 'rcp-fill-to-spill'));
        await d.sleep(2500);
        await d.unhighlight();
        const c = d.page.locator('canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.45 }, { ms: 900 });
        await d.sleep(1500);
      } },
    { id: 'above', chapter: 'Above the spill', chapterSub: 'The contact cuts the trap',
      say: 'Trap only finds the crest\'s closure and its spill point, the deepest contour that still closes. The contact is above the spill, so the trap is cut at the contact: thirty four thousand four hundred and eleven acre feet of rock over eight hundred and eighteen acres, twenty three point one four million barrels.',
      sub: 'Trap only finds the crest\'s closure and its spill point, the deepest contour that still closes. The contact is above the spill, so the trap is cut at the contact: 34,411 acre-feet of rock over 818 acres, 23.14 million barrels.',
      do: async (d) => {
        await expectText(d, card(d), /23\.14 MM[\s\S]*Bulk Vol:\s*34,411 Ac-ft[\s\S]*HC Area:\s*818 acres/, 'volume above the spill');
        await d.highlight(card(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'below', chapter: 'Below the spill', chapterSub: 'Filled to spill',
      say: 'Put the contact at five thousand three hundred feet, below the spill. The trap cannot hold oil deeper than its spill point, so it is filled to the spill, at five thousand and fifty six feet, and the run says so.',
      sub: 'Put the contact at 5,300 ft, below the spill. The trap cannot hold oil deeper than its spill point, so it is filled to the spill, at 5,056 ft, and the run says so.',
      do: async (d) => {
        await setContact(d, '-5300', { onCamera: true });
        await stoiip(d);
        await openDetailed(d);
        const w = dialog(d).getByText(/Filled to spill: the contact is below the spill point at -5,056 ft TVDSS/).first();
        await expectText(d, w, /-5,056 ft/, 'filled to spill warning');
        await d.highlight(w);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'sweep',
      say: 'The curve of oil against the contact shows it: the volume grows as the contact deepens, and stops growing at the spill.',
      do: async (d) => {
        const ch = dialog(d).getByText('STOIIP against the contact').first();
        await ch.scrollIntoViewIfNeeded();
        await d.highlight(ch.locator('xpath=ancestor::*[contains(., "OWC, TVDSS ft")][1]'));
        await d.sleep(4000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'open', chapter: 'An open closure', chapterSub: 'Without Trap only',
      say: 'Untick Trap only, and every cell above the contact counts, across the spill and out to the edge of the map. The volume jumps to two hundred and fourteen point four million barrels, and the run calls it what it is: an open closure, and only a minimum.',
      sub: 'Untick Trap only, and every cell above the contact counts, across the spill and out to the edge of the map. The volume jumps to 214.40 million barrels, and the run calls it what it is: an open closure, and only a minimum.',
      do: async (d) => {
        await setTrapOnly(d, false, { onCamera: true });
        await stoiip(d);
        await expectText(d, t(d, 'rcp-stooip'), /214\.40 MM/, 'open volume');
        await openDetailed(d);
        const w = dialog(d).getByText(/Open closure: the hydrocarbon column reaches the edge of the mapped surface/).first();
        await w.waitFor({ timeout: 30000 });
        await d.highlight(w);
        await d.sleep(3500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'booked', chapter: 'The booked map', chapterSub: 'A map that stops at the wells',
      say: 'The booked six well map is different. It stops at the outer wells, so its crest spills at the map edge, a few feet down. With Trap only, almost nothing is left. That is why the booked case runs with Trap only off, at the contact, inside the mapped area, and is reported as a minimum.',
      do: async (d) => {
        await setContact(d, '-5036.1', { onCamera: true });
        await d.click('rcp-tab-surfaces');
        await d.sleep(500);
        await d.click(surfaceCard(d, TOP).getByRole('button', { name: /Set Top/ }));
        await d.click(surfaceCard(d, BASE).getByRole('button', { name: /Set Base/ }));
        await d.click('rcp-tab-geometry');
        await d.sleep(500);
        await setTrapOnly(d, true, { onCamera: true });
        await stoiip(d);
        await d.highlight(card(d));
        await d.sleep(2500);
        await d.unhighlight();
        await setTrapOnly(d, false, { onCamera: true });
        await stoiip(d);
        await expectText(d, card(d), /Bulk Vol:\s*18,058 Ac-ft/, 'booked GRV');
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Area-depth tables and areas of interest',
      say: 'Next, two other ways to give the structure: an area against depth table, and an area of interest drawn on the map.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
