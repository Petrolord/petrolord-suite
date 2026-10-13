// Volumetrics with Petrolord, Lesson A1: the workspace and the four methods.
// The three panels, project settings and units, a Simple estimate built from
// the Ekene booking (418 acres of oil area, 43.2 ft average gross thickness
// above the contact, NTG 0.80, porosity 0.20, Sw 0.35, Bo 1.20) that
// reproduces the booked 12.14 MM stb, the volumetric chain from rock to
// oil, units, and the other three methods.
import {
  login, expectText, openRcp, stoiip, t, dialog, fieldByLabel, rcpLessonMeta,
} from './rcp-common.mjs';

const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
const panel = (d, name) => d.page.getByText(name, { exact: true }).first();
const unitField = (d, label) => d.page.locator(`div:has(> label:text-is("${label}")) input`).first();

export default {
  id: 'lesson-rcp-a1',
  ...rcpLessonMeta(1, 'A', 'The workspace and the *four methods*', 'Panels, units, a Simple estimate and the volumetric chain from rock to oil'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'panels', chapter: 'The workspace', chapterSub: 'Inputs, structure and results',
      say: 'ReservoirCalc Pro has three panels. The inputs are on the left, the structure in the middle, and the results on the right. Every change to an input runs the deterministic case again.',
      do: async (d) => {
        await d.moveTo(panel(d, 'Project Settings'));
        await d.sleep(1800);
        await d.moveTo(panel(d, 'Visualization'));
        await d.sleep(1800);
        await d.moveTo(t(d, 'rcp-stooip'));
        await d.sleep(1800);
      } },
    { id: 'settings',
      say: 'Project settings hold the unit system, which starts from your Suite units, the mode, deterministic or probabilistic, and the fluid system. The field and analyst names go on every report.',
      do: async (d) => {
        await d.highlight(d.page.getByText('Project Settings', { exact: true }).locator('xpath=ancestor::*[contains(@class,"rounded")][1]'));
        await d.sleep(3500);
        await d.unhighlight();
        await d.type(d.page.getByPlaceholder('e.g. Keta'), 'Ekene');
        await d.type(d.page.getByPlaceholder('your name'), 'Lesson A1');
      } },
    { id: 'simple', chapter: 'The Simple method', chapterSub: 'Area times gross thickness',
      say: 'The Simple method is an area times a gross thickness. A fresh workspace starts from sample numbers, so type your own. For the Ekene Sand: four hundred and eighteen acres of oil area, and forty three point two feet of gross sand above the contact on average.',
      sub: 'The Simple method is an area times a gross thickness. A fresh workspace starts from sample numbers, so type your own. For the Ekene Sand: 418 acres of oil area, and 43.2 ft of gross sand above the contact on average.',
      do: async (d) => {
        await d.click('rcp-tab-geometry');
        await d.sleep(400);
        await d.type(unitField(d, 'Area'), '418');
        await d.type(unitField(d, 'Gross Thickness'), '43.2');
        await d.page.keyboard.press('Tab');
        await d.sleep(600);
      } },
    { id: 'petro',
      say: 'Then the net to gross, porosity and water saturation, and on the Fluid tab the formation volume factor: zero point eight, zero point two, zero point three five, and one point two reservoir barrels per stock tank barrel.',
      sub: 'Then the net-to-gross, porosity and water saturation, and on the Fluid tab the formation volume factor: 0.8, 0.2, 0.35, and 1.2 reservoir barrels per stock tank barrel.',
      do: async (d) => {
        const ntg = fieldByLabel(d, 'Net-to-Gross');
        await ntg.scrollIntoViewIfNeeded();
        await d.type(ntg, '0.8');
        await d.type(fieldByLabel(d, 'Porosity'), '0.2');
        await d.type(fieldByLabel(d, 'Water Saturation'), '0.35');
        await d.click(d.page.getByRole('tab', { name: 'Fluid' }));
        await d.sleep(500);
        await d.type(d.page.locator('div.space-y-1:has(> label:text-is("Formation Vol Factor (Bo)")) input').first(), '1.2');
        await d.page.keyboard.press('Tab');
        await stoiip(d);
      } },
    { id: 'result',
      say: 'Twelve point one four million stock tank barrels, the field\'s booked number, from two numbers for the rock. The Simple method has no structure, so the contacts on the Geo tab do not change it, and the app says so.',
      sub: 'Twelve point one four million stock tank barrels, the field\'s booked number, from two numbers for the rock. The Simple method has no structure, so the contacts on the Geo tab do not change it, and the app says so.',
      do: async (d) => {
        await expectText(d, card(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'simple volume');
        await d.highlight(card(d));
        await d.sleep(2000);
        await d.unhighlight();
        await d.click('rcp-tab-geometry');
        await d.sleep(500);
        const note = t(d, 'rcp-contact-simple');
        await note.scrollIntoViewIfNeeded();
        await d.highlight(note);
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'chain', chapter: 'Rock to oil', chapterSub: 'The volumetric chain',
      say: 'The results show the chain. Gross rock volume, eighteen thousand and fifty eight acre feet; times net to gross gives the net rock; times porosity the pore volume; times one minus the water saturation the hydrocarbon pore volume; and divided by the formation volume factor, the oil at stock tank conditions.',
      sub: 'The results show the chain. Gross rock volume, 18,058 acre-feet; times net-to-gross gives the net rock; times porosity the pore volume; times one minus the water saturation the hydrocarbon pore volume; and divided by the formation volume factor, the oil at stock tank conditions.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await dialog(d).getByText('Volumetric Chain').waitFor({ timeout: 30000 });
        await d.sleep(800);
        const chain = dialog(d).getByText('Volumetric Chain').locator('xpath=ancestor::*[contains(., "STOOIP = HCPV")][1]');
        await expectText(d, chain, /18,058 Ac-ft[\s\S]*× NTG 0\.80[\s\S]*× φ 0\.20[\s\S]*× \(1−Sw\) 0\.65/, 'volumetric chain');
        await d.highlight(chain);
        await d.sleep(5000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'units', chapter: 'Units', chapterSub: 'Values convert, they are never reread',
      say: 'Switch the system to metric and the inputs convert: the area becomes square kilometres and the thickness metres, so the volume stays the same oil, now in stock tank cubic metres. Switch back to field units for the rest of this series.',
      do: async (d) => {
        const sys = d.page.getByRole('combobox').filter({ hasText: 'Field' }).first();
        await d.click(sys);
        await d.click(d.page.getByRole('option', { name: 'Metric' }));
        await stoiip(d);
        await d.highlight(unitField(d, 'Area'));
        await d.sleep(2000);
        await d.moveTo(t(d, 'rcp-stooip'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.click(d.page.getByRole('combobox').filter({ hasText: 'Metric' }).first());
        await d.click(d.page.getByRole('option', { name: 'Field' }));
        await stoiip(d);
      } },
    { id: 'methods', chapter: 'Four methods', chapterSub: 'Simple, Hybrid, Surfaces and Area-depth',
      say: 'The other three methods put structure in. Hybrid takes a top surface and a constant gross thickness. Surfaces takes a top and a base map. Area-depth takes a table of area against depth. All three cut the rock at the contacts, which the next lessons use.',
      do: async (d) => {
        for (const m of ['hybrid', 'surfaces', 'areadepth']) {
          await d.click(d.page.locator(`label[for="im-${m}"]`));
          await d.sleep(2200);
        }
        await d.click(d.page.locator('label[for="im-simple"]'));
        await d.sleep(800);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Surfaces in',
      say: 'Next, the surfaces: from the registry and from files, and how to check what the import read.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
