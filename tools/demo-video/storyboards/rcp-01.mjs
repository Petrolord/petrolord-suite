// ReservoirCalc Pro, demo 1: from interpretation to volumes (Ekene kit v4).
// The Ekene Sand top and base maps from the shared registry, the contact at
// 5,036 ft TVDSS, the open map and Trap only, the zone averages Petrophysics
// Studio published, and the booked case of 12.14 MM stb.
// Registry rows: seed/rcp.mjs. `expectText` steps stop the take if the
// screen disagrees with the narration (LENIENT=1 logs instead, for writing).
import {
  login, expectText, openRcp, importRegistrySurface, surfaceCard, setContact, setTrapOnly, fieldByLabel, stoiip,
  t, dialog, TOP, BASE, OWC_FT,
} from './rcp-common.mjs';

const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
const settled = async (d) => { await stoiip(d); };

export default {
  id: 'rcp-01',
  app: 'ReservoirCalc Pro',
  eyebrow: 'ReservoirCalc Pro · 1 of 3',
  title: 'From interpretation to *volumes*',
  subtitle: 'The Ekene Sand top and base from the registry, the contact, the zone averages and the booked volume',
  outroTitle: 'Volumetrics *with Petrolord*',
  outroSub: 'ReservoirCalc Pro · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'ReservoirCalc Pro', chapterSub: 'From the interpretation to a volume',
      say: 'ReservoirCalc Pro turns an interpretation into a volume. The Ekene Sand has been mapped from the six development wells, and its top and base are in the shared registry. We use the Surfaces method, so the rock volume comes from the two maps.',
      do: async (d) => {
        await d.sleep(2500);
        await d.click(d.page.locator('label[for="im-surfaces"]'));
        await d.sleep(800);
      } },
    { id: 'top', chapter: 'Surfaces from the registry', chapterSub: 'Top and base of the Ekene Sand',
      say: 'Import lists what Mapping and Surface Studio published. Before anything is used, the dialog says what it read: two hundred and one live nodes, depths in metres as elevations below sea level, and the coordinate system of the field.',
      sub: 'Import lists what Mapping & Surface Studio published. Before anything is used, the dialog says what it read: 201 live nodes, depths in metres as elevations below sea level, and the coordinate system of the field.',
      do: async (d) => {
        await d.click('rcp-tab-surfaces');
        await d.click(t(d, 'rcp-import-open'));
        await dialog(d).waitFor();
        await d.sleep(800);
        await d.click(t(d, `rcp-registry-use-${TOP}`));
        await t(d, 'rcp-import-ready').waitFor({ timeout: 60000 });
        await expectText(d, t(d, 'rcp-import-ready'), /201 live nodes · depth m, elevation \(negative below datum\) · XY m · EPSG:32632/, 'what the import read');
        await d.highlight(t(d, 'rcp-import-ready'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(t(d, 'rcp-import-confirm'));
        await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
      },
      wait: async (d) => {
        await importRegistrySurface(d, BASE);
        await surfaceCard(d, TOP).getByRole('button', { name: /Set Top/ }).click();
        await surfaceCard(d, BASE).getByRole('button', { name: /Set Base/ }).click();
        await settled(d);
      },
      waitLabel: 'Seconds later' },
    { id: 'crest',
      say: 'The base comes in the same way, and each is set as the top or the base. The crest of the sand is at four thousand nine hundred and seventy feet below sea level.',
      sub: 'The base comes in the same way, and each is set as the top or the base. The crest of the sand is at 4,970 ft below sea level.',
      do: async (d) => {
        await expectText(d, t(d, `rcp-surface-maxz-${TOP}`), /^-4970\.0 ft$/, 'crest of the top surface');
        await d.highlight(surfaceCard(d, TOP));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'previews', chapter: 'The structure', chapterSub: 'Map and 3D previews',
      say: 'The map and the three D preview show the trap: a dome high on the north side of the field, mapped as far as the outer wells, with the contact plane cutting it.',
      sub: 'The map and the 3D preview show the trap: a dome high on the north side of the field, mapped as far as the outer wells, with the contact plane cutting it.',
      do: async (d) => {
        const c = d.page.locator('canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.4 });
        await d.sleep(3000);
      } },
    { id: 'contact', chapter: 'The contact', chapterSub: 'Oil down to 5,036 ft TVDSS',
      say: 'The oil water contact is at five thousand and thirty six feet true vertical depth sub sea, where Ekene one logs the water at five thousand one hundred and eighteen feet measured from the rig floor.',
      sub: 'The oil-water contact is at 5,036 ft TVDSS, where Ekene-1 logs the water at 5,118 ft measured from the rig floor.',
      do: async (d) => {
        await d.click('rcp-tab-geometry');
        await d.sleep(600);
        await setContact(d, OWC_FT, { onCamera: true });
        await d.highlight(d.page.locator('#owc-input'));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'trap',
      say: 'Trap only fills the crest to its spill point. This map stops at the outer wells, so the trap spills at the map edge only a few feet below the crest, and the app says the closure is open. We count the oil down to the contact inside the mapped area instead: a minimum, and the run says so.',
      do: async (d) => {
        await setTrapOnly(d, true, { onCamera: true });
        await settled(d);
        await d.highlight(t(d, 'rcp-fill-to-spill'));
        await d.sleep(3500);
        await d.unhighlight();
        await setTrapOnly(d, false, { onCamera: true });
        await settled(d);
      } },
    { id: 'zone', chapter: 'Rock properties', chapterSub: 'Zone averages from Petrophysics Studio',
      say: 'The rock properties come from the zones Petrophysics Studio published. Net to gross is net reservoir over gross from all four wells, zero point nine four eight, because the maps already stop the oil at the contact. Porosity and water saturation come from the two wells with pay: zero point one nine one and zero point four four two.',
      sub: 'The rock properties come from the zones Petrophysics Studio published. Net-to-gross is net reservoir over gross from all four wells, 0.948, because the maps already stop the oil at the contact. Porosity and water saturation come from the two wells with pay: 0.191 and 0.442.',
      do: async (d) => {
        await d.click('rcp-tab-registry');
        await d.sleep(1500);
        await d.select(t(d, 'rcp-reg-zone'), { label: 'Ekene Sand (4 of 5 wells published)' });
        await d.sleep(1500);
        await expectText(d, 'rcp-reg-preview', /porosity 0\.191, Sw 0\.442, NTG 0\.948 \(net reservoir\)/, 'zone averages');
        await d.highlight('rcp-reg-preview');
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('rcp-reg-apply-zone');
        await settled(d);
      } },
    { id: 'logvolume',
      say: 'On those averages the Ekene Sand holds VOLA million stock tank barrels.',
      sub: 'On those averages the Ekene Sand holds VOLA million stock tank barrels.',
      do: async (d) => {
        await expectText(d, t(d, 'rcp-stooip'), /VOLA MM/, 'volume on the registry averages');
        await d.highlight(t(d, 'rcp-stooip'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'booked', chapter: 'The booked case', chapterSub: 'The values the team signed off',
      say: 'Ekene one and Ekene three sit low on the structure, so their oil leg is mostly transition zone. The field is booked on the values the team signed off: net to gross zero point eight with the field cutoffs, porosity zero point two checked against core, and a water saturation of zero point three five from the capillary pressure curve above the transition zone.',
      do: async (d) => {
        await d.click('rcp-tab-geometry');
        await d.sleep(600);
        const ntg = fieldByLabel(d, 'Net-to-Gross');
        await ntg.scrollIntoViewIfNeeded();
        await d.type(ntg, '0.8');
        await d.type(fieldByLabel(d, 'Porosity'), '0.2');
        await d.type(fieldByLabel(d, 'Water Saturation'), '0.35');
        await d.page.keyboard.press('Tab');
        await settled(d);
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Booked STOIIP',
      say: 'The gross rock volume above the contact is eighteen thousand and fifty eight acre feet over four hundred and eighteen acres, and the stock tank oil initially in place is twelve point one four million barrels, the field\'s booked number.',
      sub: 'The gross rock volume above the contact is 18,058 acre-feet over 418 acres, and the stock tank oil initially in place is 12.14 million barrels, the field\'s booked number.',
      do: async (d) => {
        await expectText(d, card(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'booked volume');
        await d.highlight(card(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'report', chapter: 'The report', chapterSub: 'From rock to oil',
      say: 'The results keep the whole chain from rock to oil, the two surfaces by name, the contact, and the note that the map is open, so a reviewer sees what the number rests on.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await d.sleep(2500);
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        await d.sleep(1500);
        await expectText(d, dialog(d), /Ekene Sand top \(6-well map\)/, 'surface named in the report');
        await d.sleep(3000);
      } },
    { id: 'next', chapter: 'Interpretation to volume', chapterSub: 'One registry, no files in between',
      say: 'Maps from Mapping, zones from Petrophysics, and a volume a reviewer can trace. That is volumetrics with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
