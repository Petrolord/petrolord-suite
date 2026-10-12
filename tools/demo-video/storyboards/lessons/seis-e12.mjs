// Seismolord lesson E12: attributes along a horizon (Ekene kit v4, EKENE3D-v4-full.sgy).
// The framework's Ekene Sand in the Map window as structure, then the
// amplitude at the pick and the RMS amplitude in a ±5 sample window: the oil
// leg dims the top of the sand over the crest. Then an interval RMS between
// the Ekene Sand and its base, saved as an attribute surface ("Ekene Sand
// (Interval RMS)", removed again by the next take's setup), and stratal
// slices explained. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, setVisible, closeWindow, deleteSurface, explorerRow, FULL,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const SURF = 'Ekene Sand (Interval RMS)';
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
const mapCanvas = (d) => d.page.locator('[data-testid="window-map"] canvas').first();
const layerSel = (d) => d.page.locator('select[title^="Mapped layer"]');
const attrSel = (d) => d.page.locator('select[title^="Mapped attribute"]');

async function openMap(d) {
  await d.click(d.page.getByRole('button', { name: /Windows/ }));
  await d.sleep(600);
  await d.click(d.page.getByText('Map', { exact: true }).last());
  await d.sleep(600);
  await d.page.keyboard.press('Escape');
  await mapCanvas(d).waitFor();
  await d.sleep(1500);
}

export default {
  id: 'lesson-seis-e12',
  ...seisLessonMeta(12, 'E', 'Attributes *along a horizon*', 'Amplitude and RMS at the pick, interval attributes between two horizons, and stratal slices'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteSurface(d, SURF);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await setVisible(d, 'Ekene Sand', true);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 12', chapterSub: 'Module E · Attributes and maps',
      say: 'A horizon is more than a surface. Along it, the seismic amplitude carries information about the rock and the fluid. This lesson reads amplitude along the top of the Ekene Sand, between the sand\'s top and base, and explains stratal slices.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 12', title: 'Attributes along a horizon',
        body: '<ul><li>Amplitude at the pick</li><li>RMS in a window</li><li>Interval attributes between two horizons</li><li>Stratal slices</li></ul>' }) },
    { id: 'structure', chapter: 'The surface', chapterSub: 'Structure first',
      say: 'The framework\'s Ekene Sand in the Map window, as structure: the rollover closing against the growth fault, contoured in milliseconds.',
      do: async (d) => {
        await d.hideSlide();
        await openMap(d);
        await d.select(layerSel(d), { label: 'Ekene Sand' });
        await d.sleep(2500);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.62, y: b.y + b.height * 0.48 }, { ms: 1200 });
      } },
    { id: 'amplitude', chapter: 'Amplitude at the pick', chapterSub: 'One value per trace',
      say: 'Mapped attribute, Amplitude: the seismic value exactly at each pick. Over the crest the amplitude is lower, in blue and green. On this field the oil leg dims the top of the sand, so the dim area should follow the structure, and roughly it does: a sign the amplitude is telling us about the fluid.',
      do: async (d) => {
        await d.select(attrSel(d), { label: 'Amplitude' });
        await d.sleep(6000);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.55, y: b.y + b.height * 0.6 }, { ms: 1200 });
        await d.sleep(800);
        await d.moveTo({ x: b.x + b.width * 0.72, y: b.y + b.height * 0.25 }, { ms: 1400 });
      } },
    { id: 'rms', chapter: 'RMS in a window', chapterSub: 'Less sensitive to the exact pick',
      say: 'A single sample is sensitive to the exact pick. RMS amplitude averages the energy in a window around it, here five samples either side, twenty milliseconds. The pattern is the same and steadier: dim over the crest, brighter on the flanks.',
      do: async (d) => {
        await d.select(attrSel(d), { label: 'RMS amplitude' });
        await d.sleep(800);
        const win = d.page.locator('select[title^="Extraction half-window"]');
        await d.select(win, { value: '5' });
        await d.sleep(6000);
        await expectText(d, win.locator('option:checked'), /±5/, 'window ±5');
        await d.highlight(win);
      } },
    { id: 'interval', chapter: 'Between two horizons', chapterSub: 'Interval RMS, top to base',
      say: 'Interval attributes run over every sample between two horizons, here from the top of the Ekene Sand to its base: the whole reservoir in one map. They are made in the export dialog. Attribute, Interval RMS, second horizon Ekene Sand Base, and Save as surface keeps the map in the explorer.',
      do: async (d) => {
        await d.unhighlight();
        await d.select(attrSel(d), { label: 'Structure' });
        await d.click(tab(d, 'Export'));
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: /^Export…/ }).first());
        await dialog(d).waitFor();
        await d.sleep(1000);
        const sel = (label) => dialog(d).locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('select');
        await d.select(sel('Horizon'), { label: 'Ekene Sand' });
        await d.select(sel('Export'), { value: 'amplitude' });
        await d.sleep(500);
        await d.select(sel('Attribute'), { value: 'interval_rms' });
        await d.sleep(500);
        await d.select(sel('Second horizon'), { label: 'Ekene Sand Base' });
        await d.sleep(800);
        await d.click(dialog(d).getByRole('button', { name: 'Save as surface' }));
      },
      wait: async (d) => {
        await dialog(d).getByText(/saved as attribute surface/).waitFor({ timeout: 300000 });
        await d.sleep(1000);
      },
      waitLabel: 'Seconds later' },
    { id: 'show', chapter: 'The interval map', chapterSub: 'The whole sand in one view',
      say: 'Ekene Sand, interval R M S, is now a surface in the explorer, and in the Map window it shows the energy of the whole sand between its top and base.',
      sub: 'Ekene Sand, interval RMS, is now a surface in the explorer, and in the Map window it shows the energy of the whole sand between its top and base.',
      do: async (d) => {
        await d.page.keyboard.press('Escape');
        await d.sleep(800);
        await expectText(d, explorerRow(d, SURF), new RegExp(SURF.replace(/[()]/g, '\\$&')), 'saved surface');
        await d.highlight(explorerRow(d, SURF));
        await d.sleep(1500);
        await d.unhighlight();
        await setVisible(d, SURF, true, { onCamera: true });
        await d.sleep(800);
        await d.click(d.page.locator('button[title="Show Map"]')).catch(() => {});
        await d.sleep(800);
        await d.select(layerSel(d), { label: SURF });
        await d.sleep(3000);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.6, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'stratal', chapter: 'Stratal slices', chapterSub: 'Following the layering',
      say: 'A stratal slice reads the amplitude part of the way from one horizon to another, a quarter, a half, at every trace. Where the beds thicken toward a growth fault, a time slice cuts across them; a stratal slice follows them. It is the same export dialog, with Stratal slice and a fraction.',
      do: async (d) => d.slide({ eyebrow: 'Stratal slices', title: 'Proportional between two horizons',
        body: '<ul><li>0 on the first horizon, 1 on the second</li><li>Follows thickening into the growth fault</li><li>Export, Attribute, Stratal slice</li></ul>' }) },
    { id: 'next',
      say: 'Next lesson, volume attributes: variance, spectral decomposition and co-rendering.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next', title: 'Volume attributes', body: '<ul><li>Computing an attribute volume</li><li>Spectral decomposition</li><li>Co-rendering</li></ul>' });
        await setVisible(d, SURF, false);
        await setVisible(d, 'Ekene Sand', false);
        await closeWindow(d, 'Map');
        await tab(d, 'Home').click().catch(() => {});
      } },
  ],
};
