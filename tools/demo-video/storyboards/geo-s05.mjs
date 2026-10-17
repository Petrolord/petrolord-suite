// Geoscience module showcase, scene 5: Seismolord on the Ekene 3D (kit v4,
// the listric growth fault). Inline 1027 through the discovery well with the
// framework horizons and the wells, the 3D chair, an amplitude map along the
// top of the sand, spectral RGB (the 12/25/40 Hz volumes the QI showcase made
// on the Petrolord server) and the well tie at Ekene-1.
import { login, expectText, scene, t, park } from './geo-common.mjs';
import { sectionPoint, xlFrac, RECORD_MS } from './seis-common.mjs';
import {
  FULL, combo, mapSel, activate, onlyVisible, goTo, showWindow, drag3d, cubeLayers, closeWindow, showSlicePlanes, fullscreenBtn, setVisible,
} from './geo-seis.mjs';

const LAYERS = ['Seabed', 'Agbada Formation', 'Ogbia Shale', 'Top Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity', 'Oboro Sand', 'Akata Formation', 'Auto-1', 'Auto-2', 'Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];
const mapWin = (d) => d.page.locator('[data-testid="window-map"]');

export default {
  ...scene('geo-s05'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await activate(d, shared, FULL);
    await closeWindow(d, '3D'); await closeWindow(d, 'Map'); await closeWindow(d, 'Synthetics');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await onlyVisible(d, LAYERS);
    await showSlicePlanes(d);
    if (await t(d, 'sl-rgb-clear').count()) await t(d, 'sl-rgb-clear').click();
    await combo(d, 'Amplitude scale').selectOption({ label: 'RMS multiple' });
    await combo(d, 'Colormap').selectOption({ label: 'Grayscale' });
    await combo(d, 'Orientation').selectOption({ label: 'Crossline' }); await goTo(d, 2051, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' }); await goTo(d, 1292, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Inline' }); await goTo(d, 1027, { quiet: true });
    // the 3D window's layers: wells, tops and the horizon surfaces
    await showWindow(d, '3D', '3d', false);
    await d.sleep(3000);
    await cubeLayers(d, { 'Horizon surfaces': false, 'Well paths & tops': true, 'Axis gizmo': true });
    await closeWindow(d, '3D');
    // the map's layers: no fault-stick footprints (a listric fault's sticks
    // project as long lines across the map), no 2D or traverse lines
    await showWindow(d, 'Map', 'map', false);
    await d.sleep(2500);
    await d.page.locator('[data-testid="window-map"]').getByRole('button', { name: /Layers/ }).click(); await d.sleep(700);
    for (const [label, on] of Object.entries({ 'Fault sticks (footprints)': false, '2D lines (navigation + crossings)': false, 'Saved traverse lines': false, 'Fault traces on horizon': true })) {
      const item = d.page.getByRole('menuitemcheckbox', { name: label });
      if (await item.count() && ((await item.getAttribute('aria-checked')) === 'true') !== on) { await item.click(); await d.sleep(400); }
    }
    await d.page.keyboard.press('Escape'); await d.sleep(600);
    await setVisible(d, 'Top Ekene Sand', true);
    await mapSel(d, 0).selectOption({ label: 'Top Ekene Sand' }).catch(() => {});
    await d.sleep(1500);
    await closeWindow(d, 'Map');
    const close = d.page.locator('button[aria-label="Close"], button[title="Close panel"]').first();
    if (await d.page.getByText('Start here', { exact: true }).nth(1).isVisible().catch(() => false)) await t(d, 'sl-start-toggle').click().catch(() => {});
    void close;
    await d.sleep(1500);
    await park(d);
  },
  steps: [
    { id: 'section', chapter: 'Seismic interpretation', chapterSub: 'Seismolord',
      say: 'Seismolord interprets the three D survey in the browser. Inline ten twenty seven runs through the discovery well: the listric growth fault, the rollover against it, and the horizons tracked across the field.',
      sub: 'Seismolord interprets the 3D survey in the browser. Inline 1027 runs through the discovery well: the listric growth fault, the rollover against it, and the horizons tracked across the field.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1500);
        // wheel zoom on the fault and the rollover
        const c = await sectionPoint(d, { frac: xlFrac(2030), ms: 1450, recordMs: RECORD_MS });
        await d.moveTo(c, { ms: 900 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -240); await d.sleep(350); }
        await d.sleep(1200);
        await d.moveTo(await sectionPoint(d, { frac: 0.62, ms: 1300, recordMs: RECORD_MS }), { ms: 1200 });
      } },
    { id: 'cube',
      say: 'In three D, a chair display cuts through the crest, with the wells and their tops.',
      sub: 'In 3D, a chair display cuts through the crest, with the wells and their tops.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.select(combo(d, 'Colormap'), { label: 'Red-White-Blue' });
        await showWindow(d, '3D', '3d');
        await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
        await d.sleep(3500);
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(2000);
      } },
    { id: 'orbit',
      say: 'Swing round, and the rollover closes against the fault in both directions.',
      do: async (d) => {
        const c = d.page.locator('[data-testid="window-3d"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(300); }
        await drag3d(d, -200, 0, 45);
        await d.sleep(400);
        await drag3d(d, 0, 16, 15);
      } },
    { id: 'rms', chapter: 'Attributes', chapterSub: 'Seismolord · Map',
      say: 'On the map, the R M S amplitude along the top of the Ekene Sand, across the rollover.',
      sub: 'On the map, the RMS amplitude along the top of the Ekene Sand, across the rollover.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, '3d'));
        await showWindow(d, 'Map', 'map');
        await d.sleep(2500);
        await mapSel(d, 0).selectOption({ label: 'Top Ekene Sand' }).catch(() => {});
        await d.sleep(1000);
        await d.select(mapSel(d, 2), { label: 'RMS amplitude' });
        await d.click(mapWin(d).locator('button[title="Fullscreen"]'));
        await d.sleep(1500);
        // in on the hanging wall, where the horizon is tracked
        const c = mapWin(d).locator('canvas').first(); const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.66, y: b.y + b.height * 0.5 }, { ms: 900 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -120); await d.sleep(500); }
        await d.sleep(2500);
      } },
    { id: 'rgb',
      say: 'Spectral decomposition at twelve, twenty five and forty hertz, blended as red, green and blue. Thin beds tune by thickness, so the colour maps the sand across the closure.',
      sub: 'Spectral decomposition at 12, 25 and 40 Hz, blended as red, green and blue. Thin beds tune by thickness, so the colour maps the sand across the closure.',
      do: async (d) => {
        await d.click(mapWin(d).locator('button[title="Fullscreen"]'));
        await d.page.getByText('Home', { exact: true }).first().click();
        await d.sleep(800);
        await d.click(t(d, 'sl-rgb-auto'));
        await d.sleep(2500);
        for (const [c, f] of [['red', 12], ['green', 25], ['blue', 40]]) await expectText(d, t(d, `sl-rgb-${c}`).locator('option:checked'), new RegExp(`Spectral decomposition ${f} Hz`), `${c} channel`);
        await d.select(mapSel(d, 2), 'rgb').catch(() => {});
        await d.click(mapWin(d).locator('button[title="Fullscreen"]'));
        await d.sleep(6000);
      } },
    { id: 'tie', chapter: 'Well ties', chapterSub: 'Seismolord · Synthetics',
      say: 'And every well is tied. At Ekene one, the wavelet is extracted from the seismic itself.',
      sub: 'And every well is tied. At Ekene-1, the wavelet is extracted from the seismic itself.',
      do: async (d) => {
        await d.click(mapWin(d).locator('button[title="Fullscreen"]'));
        await d.sleep(600);
        await showWindow(d, 'Synthetics', 'synthetic');
        await t(d, 'synth').waitFor({ timeout: 30000 });
        const wells = await t(d, 'synth-well').locator('option').allInnerTexts();
        await d.select('synth-well', { label: wells.find((x) => /^Ekene-1(?!\d)/.test(x)) });
        await d.sleep(1500);
        await d.click('synth-extract');
      },
      wait: async (d) => {
        await expectText(d, 'synth-wavelet-info', /peak 26\.3 Hz, phase 0 deg/, 'wavelet');
        await t(d, 'synth-run').click();
        await d.sleep(6000);
        await t(d, 'synth-suggest').click();
        await expectText(d, 'synth-suggest-result', /best 0 ms \(r = 0\.73\)/, 'bulk shift');
        await d.sleep(1500);
      },
      waitLabel: 'Seconds later' },
    { id: 'tie-result',
      say: 'The synthetic ties at zero milliseconds, with a correlation of zero point seven three.',
      sub: 'The synthetic ties at 0 ms, with a correlation of 0.73.',
      do: async (d) => {
        await d.highlight('synth-suggest-result');
        await d.sleep(1500);
        await d.moveTo(d.page.locator('[data-testid="window-synthetic"] canvas').first(), { ms: 1400, dx: 0.8, dy: 0.5 }).catch(() => {});
      } },
  ],
};
