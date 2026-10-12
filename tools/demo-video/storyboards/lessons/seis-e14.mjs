// Seismolord lesson E14: surfaces and the Map window (Ekene kit v4, EKENE3D-v4-full.sgy).
// Make surface grids the framework's Ekene Sand in two-way time, fault-aware
// against the two demo faults, saved as "Ekene Sand (TWT ms)" (a name no demo
// uses; removed again by the next take's setup), then read in the Map window:
// coverage and the fault gap, colour maps, contours and their interval, and
// the cursor readout. The demos' depth surfaces are never re-made here.
// Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, setVisible, closeWindow, deleteSurface, explorerItem, explorerRow, FULL,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const SURF = 'Ekene Sand (TWT ms)';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
const mapCanvas = (d) => d.page.locator('[data-testid="window-map"] canvas').first();
const layerSel = (d) => d.page.locator('select[title^="Mapped layer"]');

export default {
  id: 'lesson-seis-e14',
  ...seisLessonMeta(14, 'E', 'Surfaces and *the Map window*', 'Gridding a horizon into a surface, coverage and fault gaps, colour and contours'),
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
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 14', chapterSub: 'Module E · Attributes and maps',
      say: 'A horizon is a set of picks on the seismic lattice, with gaps where nothing was picked. A surface is a regular grid made from it, the form every mapping and volumetrics tool expects. This lesson grids the Ekene Sand and reads it in the Map window.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 14', title: 'Surfaces and the Map window',
        body: '<ul><li>Picks to a regular grid</li><li>Fault-aware gridding</li><li>Coverage and gaps</li><li>Colour and contours</li></ul>' }) },
    { id: 'make', chapter: 'Make surface', chapterSub: 'From the horizon',
      say: 'Right-click the Ekene Sand horizon, Make surface. We grid it in two way time, at the survey bin, with the two faults as barriers so the grid does not smear across the fault.',
      sub: 'Right-click the Ekene Sand horizon, Make surface. We grid it in two-way time, at the survey bin, with the two faults as barriers so the grid does not smear across the fault.',
      do: async (d) => {
        await d.hideSlide();
        await d.moveTo(explorerItem(d, 'Ekene Sand'));
        await explorerItem(d, 'Ekene Sand').click({ button: 'right' });
        await d.sleep(700);
        await d.click(d.page.getByText('Make surface…'));
        await t(d, 'sl-make-surface').waitFor();
        await d.sleep(800);
        await d.select(t(d, 'sl-make-surface-domain'), { value: 'twt' });
        await d.sleep(600);
        const fa = t(d, 'sl-make-surface').getByRole('checkbox');
        if (await fa.count() && !(await fa.first().isChecked())) await d.click(fa.first());
        await d.highlight(t(d, 'sl-make-surface').getByText(/^Fault-aware/));
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('sl-make-surface-grid');
      },
      wait: async (d) => {
        await t(d, 'sl-make-surface-result').waitFor({ timeout: 300000 });
        await d.sleep(800);
      },
      waitLabel: 'Seconds later' },
    { id: 'result',
      say: 'The result line gives the name, the number of live grid nodes, the cell size and the range of the surface in milliseconds. The surface is saved, and listed in the explorer.',
      do: async (d) => {
        await expectText(d, 'sl-make-surface-result', /Ekene Sand \(TWT ms\): [\d,]+ live nodes, cell 25(\.0+\d*)? m, z -?\d+\.\d to -?\d+\.\d\./, 'surface result');
        await d.highlight('sl-make-surface-result');
        await d.sleep(3000);
        await d.unhighlight();
        await d.click(t(d, 'sl-make-surface').getByRole('button', { name: 'Close' }).last());
        await t(d, 'sl-make-surface').waitFor({ state: 'hidden', timeout: 10000 });
        await d.sleep(800);
        await d.highlight(explorerRow(d, SURF));
      } },
    { id: 'map', chapter: 'The Map window', chapterSub: 'Coverage and the fault gap',
      say: 'In the Map window the surface fills both fault blocks. The narrow empty band is the fault gap: the strip where the fault cuts the sand, which the grid leaves open. Volumes and depth conversion respect that gap.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(600);
        await d.click(d.page.getByText('Map', { exact: true }).last());
        await d.sleep(600);
        await d.page.keyboard.press('Escape');
        await mapCanvas(d).waitFor();
        await d.sleep(1200);
        await d.select(layerSel(d), { label: SURF });
        await d.sleep(3000);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.36, y: b.y + b.height * 0.15 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.33, y: b.y + b.height * 0.85 }, { ms: 1800 });
      } },
    { id: 'readout',
      say: 'The cursor reads the position, inline and crossline, and the value of the surface under it.',
      do: async (d) => {
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.62, y: b.y + b.height * 0.48 }, { ms: 1000 });
        await d.sleep(900);
        await d.moveTo({ x: b.x + b.width * 0.8, y: b.y + b.height * 0.55 }, { ms: 1200 });
      } },
    { id: 'colour', chapter: 'Colour and contours', chapterSub: 'For the eye and for the report',
      say: 'The colour map can be changed for the audience: a spectrum for interpreters, a single hue ramp for a printed report. Contours are drawn automatically at twelve levels; Settings sets a round interval instead, and they label themselves.',
      do: async (d) => {
        const cm = d.page.locator('[data-testid="window-map"] select').filter({ has: d.page.locator('option', { hasText: 'Viridis' }) }).first();
        const opts = await cm.locator('option').allInnerTexts();
        const alt = opts.find((o) => /Viridis/.test(o)) || opts[1];
        await d.select(cm, { label: alt });
        await d.sleep(2500);
        if (!/Viridis/.test(await cm.locator('option:checked').innerText())) throw new Error('colormap not changed');
        await d.select(cm, { label: opts.find((o) => /Spectrum/.test(o)) || opts[0] });
        await d.sleep(1500);
      } },
    { id: 'registry', chapter: 'In the registry', chapterSub: 'Shared with the other apps',
      say: 'Every saved surface lives in the shared surface registry, so Mapping and Surface Studio, Earth Modeling and ReservoirCalc Pro all read the same grid, with no file export or import in between. Module F takes a depth surface from here into ReservoirCalc Pro.',
      do: async (d) => d.slide({ eyebrow: 'In the registry', title: 'One surface, every app',
        body: '<ul><li>Mapping & Surface Studio</li><li>Earth Modeling</li><li>ReservoirCalc Pro</li><li>No export and re-import</li></ul>' }) },
    { id: 'next',
      say: 'That completes Module E. Next, Module F: delivery. Exporting surfaces in the formats other software expects.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next: Module F', title: 'Delivery', body: '<ul><li>Export formats and conventions</li><li>Into ReservoirCalc Pro</li><li>Projects and sharing</li><li>2D lines and large surveys</li></ul>' });
        await setVisible(d, SURF, false);
        await closeWindow(d, 'Map');
      } },
  ],
};
