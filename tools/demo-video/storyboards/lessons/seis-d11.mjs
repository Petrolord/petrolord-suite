// Seismolord lesson D11: time to depth (Ekene kit v4, EKENE3D-v4-full.sgy).
// Checkshots as the link between the well's depths and the seismic's times,
// the volume's layer-cake velocity model (10 layers, saved and calibrated for
// demo 3), the calibration fit against the visible wells' tops run and read
// but NOT applied (RMS 16.7 ft before, 16.5 ft proposed, 46 ties), then the
// section in depth and the Ekene Sand horizon mapped in feet. The model the
// demos depend on is never changed. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, setVisible, closeWindow,
  FULL, RECORD_MS, xlFrac,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
const mapCanvas = (d) => d.page.locator('[data-testid="window-map"] canvas').first();

export default {
  id: 'lesson-seis-d11',
  ...seisLessonMeta(11, 'D', 'Time *to depth*', 'Checkshots, the velocity model, calibrating it to the well tops, and a horizon converted to feet'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.dismiss().catch(() => {})); // never confirm a model change
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await closeWindow(d, 'Synthetics');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    for (const w of WELLS) await setVisible(d, w, true);
    await combo(d, 'Domain').selectOption({ label: 'Time (TWT)' }).catch(() => {});
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1027'); await t(d, 'sl-goto-btn').click(); await d.sleep(2000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 11', chapterSub: 'Module D · Wells in the seismic',
      say: 'Seismic is recorded in time; wells are drilled in depth. Every map a driller or a reservoir engineer uses has to be in depth. This lesson connects the two: checkshots at the wells, a velocity model for the survey, a calibration against the tops, and a horizon converted to feet.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 11', title: 'Time to depth',
        body: '<ul><li>Checkshots: time at depth, at a well</li><li>A velocity model for the survey</li><li>Calibrated to the tops</li><li>A horizon in feet</li></ul>' }) },
    { id: 'checkshots', chapter: 'Checkshots', chapterSub: 'Measured time at measured depth',
      say: 'A checkshot survey fires a source at the surface and records the arrival at known depths in the well, so each level gives a measured one way time at a measured depth. The Ekene wells carry checkshots at every top, and each tie in lesson ten refined them. That is how these wells sit on the section: through their own time-depth relation, marked T D in the explorer.',
      sub: 'A checkshot survey fires a source at the surface and records the arrival at known depths in the well, so each level gives a measured one-way time at a measured depth. The Ekene wells carry checkshots at every top, and each tie in lesson 10 refined them. That is how these wells sit on the section: through their own time-depth relation, marked T-D in the explorer.',
      do: async (d) => {
        await d.hideSlide();
        await d.moveTo(await sectionPoint(d, { frac: xlFrac(2051), ms: 500, recordMs: RECORD_MS }), { ms: 900 });
        await d.moveTo(await sectionPoint(d, { frac: xlFrac(2051), ms: 1290, recordMs: RECORD_MS }), { ms: 1600 });
      } },
    { id: 'model', chapter: 'The velocity model', chapterSub: 'Between the wells',
      say: 'Between the wells the survey needs a velocity model. This one is a layer cake of ten layers, each bounded by an interpreted horizon, with its own velocity: one thousand nine hundred and seventy metres per second down to the Benin, two thousand six hundred and ninety four to the Agbada, and so on. Every depth map and depth export of this volume goes through it.',
      sub: 'Between the wells the survey needs a velocity model. This one is a layer cake of ten layers, each bounded by an interpreted horizon, with its own velocity: 1,970 m/s down to the Benin, 2,694 m/s to the Agbada, and so on. Every depth map and depth export of this volume goes through it.',
      do: async (d) => {
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: /Velocity model/ }));
        await dialog(d).waitFor();
        await d.sleep(1200);
        await expectText(d, dialog(d), /Layer cake, 10 layers \(1969\.5 \/ 2694 \/ 2355\.2[\s\S]*m\/s at layer tops\): drives depth maps and depth exports/, 'layer cake');
        await d.highlight(dialog(d).getByText(/^Layer cake, 10 layers/));
      } },
    { id: 'calibrate', chapter: 'Calibrating to the tops', chapterSub: 'How well the model fits the wells',
      say: 'How good is it? Calibrate from wells pairs each well top with its horizon, converts the horizon to depth, and compares. Fit adjusts each layer\'s velocity to shrink the misses. Here the model is already calibrated: over forty six ties the R M S miss would only move from sixteen point seven feet to sixteen point five. The table lists every tie, before and after.',
      sub: 'How good is it? Calibrate from wells pairs each well top with its horizon, converts the horizon to depth, and compares. Fit adjusts each layer\'s velocity to shrink the misses. Here the model is already calibrated: over 46 ties the RMS miss would only move from 16.7 ft to 16.5 ft. The table lists every tie, before and after.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Calibrate from wells' }));
        await d.sleep(1500);
        const pair = dialog(d).getByText(/^Pair tops with horizons/);
        await pair.scrollIntoViewIfNeeded(); await d.sleep(700);
        await d.click(dialog(d).getByRole('button', { name: 'Fit', exact: true }));
        const proposed = dialog(d).getByText(/^Proposed: Layer cake/);
        await proposed.waitFor({ timeout: 30000 });
        await expectText(d, proposed, /RMS 16\.7 ft → 16\.5 ft \(46 ties\)/, 'calibration fit');
        await proposed.scrollIntoViewIfNeeded(); await d.sleep(700);
        await d.highlight(proposed);
      } },
    { id: 'keep',
      say: 'A tenth of a foot is not worth changing a model that other work depends on, so we close without applying. On a new survey, the first fit usually takes the miss down by tens of feet.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
        await d.click(tab(d, 'Home'));
        await d.sleep(500);
      } },
    { id: 'depth', chapter: 'The section in depth', chapterSub: 'The same data, another axis',
      say: 'With a model saved, the section can be shown in depth. On crossline twenty fifty one, along the structure, the domain switch redraws the seismic against true vertical depth below sea level, in feet. The well tops stay on their events, because the model was calibrated to them, and the cursor now reads depth.',
      sub: 'With a model saved, the section can be shown in depth. On crossline 2051, along the structure, the domain switch redraws the seismic against true vertical depth below sea level, in feet. The well tops stay on their events, because the model was calibrated to them, and the cursor now reads depth.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Crossline' });
        await d.sleep(600);
        await d.type('sl-goto', '2051'); await d.click('sl-goto-btn'); await d.sleep(1800);
        await d.select(combo(d, 'Domain'), { label: 'Depth' });
        await d.sleep(3000);
        const b = await d.page.locator('[data-testid="window-section"] canvas').first().boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.24, y: b.y + b.height * 0.36 }, { ms: 1000 });
        await d.sleep(500);
        await expectText(d, 'status-cursor', /XL 2051\s+·\s+[\d.]+ ft TVDSS/, 'cursor in depth');
        await d.moveTo({ x: b.x + b.width * 0.6, y: b.y + b.height * 0.4 }, { ms: 1400 });
      } },
    { id: 'map', chapter: 'A horizon in depth', chapterSub: 'The Map window in feet',
      say: 'Finally the deliverable: the Ekene Sand from the framework, mapped in the Map window. Switching the map from time to depth converts every pick through the model. The rollover closes in depth too, and its crest and spill are now in feet, ready for volumetrics in Module F.',
      do: async (d) => {
        await d.select(combo(d, 'Domain'), { label: 'Time (TWT)' });
        await d.sleep(1000);
        await d.page.getByText('Wells', { exact: true }).first().click();
        await d.page.getByRole('button', { name: 'Hide all' }).click();
        await tab(d, 'Home').click();
        await setVisible(d, 'Ekene Sand', true);
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(600);
        await d.click(d.page.getByText('Map', { exact: true }).last());
        await d.sleep(600);
        await d.page.keyboard.press('Escape');
        await mapCanvas(d).waitFor();
        await d.sleep(1500);
        await d.select(d.page.locator('select[title^="Mapped layer"]'), { label: 'Ekene Sand' });
        await d.sleep(2500);
        const dom = d.page.locator('[data-testid="window-map"] select').filter({ hasText: /TWT ms/ }).first();
        const opts = await dom.locator('option').allInnerTexts();
        await d.select(dom, { label: opts.find((o) => /ft/.test(o)) });
        await d.sleep(3000);
        if (!/ft/.test(await dom.locator('option:checked').innerText())) throw new Error('map not in depth');
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.62, y: b.y + b.height * 0.48 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.8, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'next',
      say: 'That completes Module D. Next, Module E: attributes along a horizon and in the volume, and surfaces in the Map window.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next: Module E', title: 'Attributes and maps', body: '<ul><li>Attributes along a horizon</li><li>Volume attributes</li><li>Surfaces and the Map window</li></ul>' });
        const dom = d.page.locator('[data-testid="window-map"] select').filter({ hasText: /TWT ms/ }).first();
        await dom.selectOption({ label: 'TWT ms' }).catch(() => {});
        await setVisible(d, 'Ekene Sand', false);
        await closeWindow(d, 'Map');
      } },
  ],
};
