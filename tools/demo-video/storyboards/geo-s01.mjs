// Geoscience module showcase, scene 1: the cold open (about 30 s, mostly
// music). The 3D chair through the Ekene crest turning, the spectral RGB
// along the top of the sand, then the Earth Modeling grid (scene geo-s01c).
import { login, scene, t, park } from './geo-common.mjs';
import {
  FULL, combo, mapSel, activate, onlyVisible, goTo, showWindow, drag3d, cubeLayers, closeWindow, showSlicePlanes, fullscreenBtn,
} from './geo-seis.mjs';

const LAYERS = ['Top Ekene Sand', 'Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];
const mapWin = (d) => d.page.locator('[data-testid="window-map"]');

export default {
  ...scene('geo-s01', { leadIn: 0.3 }),
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
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await combo(d, 'Orientation').selectOption({ label: 'Crossline' }); await goTo(d, 2051, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' }); await goTo(d, 1292, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Inline' }); await goTo(d, 1027, { quiet: true });
    // the spectral RGB map ready behind the 3D window
    await t(d, 'sl-rgb-auto').click(); await d.sleep(2500);
    await showWindow(d, 'Map', 'map', false); await d.sleep(2500);
    await mapSel(d, 0).selectOption({ label: 'Top Ekene Sand' }); await d.sleep(1000);
    await mapSel(d, 2).selectOption('rgb').catch(() => {});
    await d.sleep(4000);
    await showWindow(d, '3D', '3d', false);
    await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
    await cubeLayers(d, { 'Horizon surfaces': false, 'Well paths & tops': true, 'Axis gizmo': false });
    await fullscreenBtn(d, '3d').click();
    await d.sleep(4000);
    await park(d, 1500, 900);
  },
  steps: [
    { id: 'chair', chapter: null,
      do: async (d) => {
        const b = await d.page.locator('[data-testid="window-3d"] canvas').first().boundingBox();
        await d.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(250); }
        await drag3d(d, -300, 0, 80);
      },
      hold: 0.5 },
    { id: 'rgb',
      do: async (d) => {
        await fullscreenBtn(d, '3d').click();
        await d.sleep(300);
        await showWindow(d, 'Map', 'map', false);
        await mapWin(d).locator('button[title="Fullscreen"]').click();
        await d.sleep(1500);
        await park(d, 1500, 900);
        const c = mapWin(d).locator('canvas').first(); const b = await c.boundingBox();
        await d.page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
        for (let i = 0; i < 3; i++) { await d.page.mouse.wheel(0, -120); await d.sleep(700); }
        await d.sleep(2500);
      },
      hold: 0.5 },
  ],
};
