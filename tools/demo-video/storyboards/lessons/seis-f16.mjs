// Seismolord lesson F16: into ReservoirCalc Pro (Ekene kit v4, EKENE3D-v4-full.sgy).
// The hanging-wall top Ekene Sand from lesson B5 ("Lesson Ekene correlation")
// gridded in depth with a quick GRV readout above the 5,036 ft contact
// (35,370 acre-ft, no spill check), then Send to ReservoirCalc Pro, which
// publishes "Lesson Ekene correlation (depth ft)" to the registry. In
// ReservoirCalc Pro (an unsaved workspace; nothing is saved there) it is the
// top, the demo's "Ekene Sand Base (depth ft)" is read as the base, and Trap
// only gives 15,305 acre-ft over 895 acres. Figures from the 2026-10-12 probe.
import { login, expectText, openSeismolord, setVisible, closeWindow, deleteSurface, FULL } from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const TOP = 'Lesson Ekene correlation (depth ft)';
const BASE = 'Ekene Sand Base (depth ft)';
const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
const sel = (d, label) => dialog(d).locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('select');
const card = (d, nm, btn) => d.page.getByText(nm, { exact: true }).first().locator(`xpath=ancestor::*[.//button[contains(normalize-space(),"${btn}")]][1]`);

async function importSurface(d, nm, onCamera = true) {
  const click = (l) => (onCamera ? d.click(l) : l.click());
  await click(t(d, 'rcp-import-open'));
  await dialog(d).waitFor();
  await d.sleep(800);
  const use = dialog(d).getByText(nm, { exact: true }).first().locator('xpath=ancestor::*[.//button[normalize-space()="Use"]][1]').getByRole('button', { name: 'Use' });
  await click(use);
  await d.sleep(600);
  await click(dialog(d).getByRole('button', { name: 'Import Surface' }));
  await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(800);
}

export default {
  id: 'lesson-seis-f16',
  ...seisLessonMeta(16, 'F', 'Into *ReservoirCalc Pro*', 'A gross rock volume from a Seismolord surface, with no file in between'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteSurface(d, TOP); // an earlier take's lesson surface only
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 16', chapterSub: 'Module F · Delivery',
      say: 'The usual route from seismic to a volume is an export, an email and an import, with a chance to get the sign or the unit wrong at each step. In the Suite the surface goes straight to ReservoirCalc Pro. This lesson sends the top of the Ekene Sand and measures the trap.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 16', title: 'Into ReservoirCalc Pro',
        body: '<ul><li>A quick GRV in Seismolord</li><li>Send to ReservoirCalc Pro</li><li>Top, base, contact and spill</li></ul>' }) },
    { id: 'grid', chapter: 'A quick readout', chapterSub: 'GRV above a contact',
      say: 'In the export dialog we take the top Ekene Sand from lesson five, the hanging wall picked on the right event, in depth. With a contact of five thousand and thirty six feet, Seismolord gives a quick gross rock volume, here thirty five thousand three hundred and seventy acre feet: everything in the grid above the contact, with no check of where the trap spills.',
      sub: 'In the export dialog we take the top Ekene Sand from lesson 5, the hanging wall picked on the right event, in depth. With a contact of 5,036 ft, Seismolord gives a quick gross rock volume, here 35,370 acre-feet: everything in the grid above the contact, with no check of where the trap spills.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(tab(d, 'Export'));
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: /^Export…/ }).first());
        await dialog(d).waitFor();
        await d.sleep(800);
        await d.select(sel(d, 'Horizon'), { label: 'Lesson Ekene correlation' });
        await d.select(sel(d, 'Export'), { value: 'surface' });
        await d.select(sel(d, 'Domain'), { value: 'depth' });
        await d.sleep(500);
        await d.type(dialog(d).getByPlaceholder('-6200'), '-5036');
        await d.click(dialog(d).getByRole('button', { name: /Send to ReservoirCalc Pro/ }));
      },
      wait: async (d) => {
        await dialog(d).getByText(/sent to ReservoirCalc Pro/).waitFor({ timeout: 300000 });
        await d.sleep(800);
      },
      waitLabel: 'Seconds later' },
    { id: 'sent',
      say: 'Send to ReservoirCalc Pro gridded the surface and published it to the registry, named for the horizon and the domain.',
      do: async (d) => {
        const res = dialog(d).getByText(/^File:/).locator('..');
        await expectText(d, res, /sent to ReservoirCalc Pro[\s\S]*GRV:\s*35,370 acre-ft/, 'sent and GRV');
        await d.highlight(res);
      } },
    { id: 'rcp', chapter: 'In ReservoirCalc Pro', chapterSub: 'Top and base from the registry',
      say: 'In ReservoirCalc Pro, the Surfaces method. The import dialog lists the registry\'s surfaces. Our surface is the top. For the base we take the Ekene Sand Base published in the sales demo.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.page.goto(`${shared.baseUrl}${RCP}`, { waitUntil: 'domcontentloaded' });
        await d.page.locator('label[for="im-surfaces"]').waitFor({ timeout: 60000 });
        await d.sleep(2500);
        await d.click(d.page.locator('label[for="im-surfaces"]'));
        await d.sleep(600);
        await d.click('rcp-tab-surfaces');
        await d.sleep(600);
        await importSurface(d, TOP);
        await d.click(card(d, TOP, 'Set Top').getByRole('button', { name: /Set Top/ }));
        await d.sleep(800);
      },
      wait: async (d) => {
        await importSurface(d, BASE, false);
        await card(d, BASE, 'Set Base').getByRole('button', { name: /Set Base/ }).click();
        await d.sleep(1000);
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(800);
      },
      waitLabel: 'Seconds later' },
    { id: 'contact', chapter: 'Contact and spill', chapterSub: 'Trap only',
      say: 'The contact is the same five thousand and thirty six feet below sea level, written negative, as the registry stores depth. Trap only counts the closure around the crest and fills it at most to its spill point.',
      sub: 'The contact is the same 5,036 ft below sea level, written negative, as the registry stores depth. Trap only counts the closure around the crest and fills it at most to its spill point.',
      do: async (d) => {
        await d.click('rcp-tab-geometry');
        await d.sleep(800);
        const owc = d.page.getByLabel(/OWC/).first();
        await d.click(owc);
        await owc.fill('');
        await d.page.keyboard.type('-5036', { delay: 90 });
        await d.page.keyboard.press('Enter');
        await d.sleep(800);
        const spill = t(d, 'rcp-fill-to-spill').locator('input');
        if (!(await spill.isChecked())) await d.click(spill);
        await d.highlight(t(d, 'rcp-fill-to-spill'));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'volume', chapter: 'The trap', chapterSub: 'Between top and base, inside the closure',
      say: 'Recalculate. Between the top and the base, inside the closure, the gross rock volume is fifteen thousand three hundred and five acre feet over eight hundred and ninety five acres: well under the quick readout, because the sand has a base and the trap a spill point. The oil in place needs the rock properties, which the sales demo takes from the published Petrophysics zone.',
      sub: 'Recalculate. Between the top and the base, inside the closure, the gross rock volume is 15,305 acre-feet over 895 acres: well under the quick readout, because the sand has a base and the trap a spill point. The oil in place needs the rock properties, which the sales demo takes from the published Petrophysics zone.',
      do: async (d) => {
        await d.page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
        await d.sleep(600);
        await d.click(d.page.getByRole('button', { name: /Recalculate/ }));
        await d.sleep(5000);
        const body = d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
        await expectText(d, body, /Bulk Vol:\s*15,305 Ac-ft[\s\S]*HC Area:\s*895 acres/, 'trap volume');
        await d.highlight(body);
      } },
    { id: 'next',
      say: 'Next lesson, projects, sharing and sessions: working on one survey as a team.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Projects, sharing and sessions', body: '<ul><li>Sharing with your organisation</li><li>Who did what: history</li><li>Sessions and bookmarks</li></ul>' });
      } },
  ],
};
