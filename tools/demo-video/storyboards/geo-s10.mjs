// Geoscience module showcase, scene 10: the close. The Ekene 3D in
// Seismolord with the framework as surfaces, the wells and the slices,
// turning slowly under the last line.
import { login, scene, t, park } from './geo-common.mjs';
import { FULL, combo, activate, onlyVisible, goTo, showWindow, drag3d, cubeLayers, closeWindow, showSlicePlanes, fullscreenBtn } from './geo-seis.mjs';

const LAYERS = ['Top Ekene Sand', 'Oboro Unconformity', 'Auto-1', 'Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];

export default {
  ...scene('geo-s10'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await activate(d, shared, FULL);
    await closeWindow(d, '3D'); await closeWindow(d, 'Map'); await closeWindow(d, 'Synthetics');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await onlyVisible(d, LAYERS);
    await showSlicePlanes(d);
    if (await t(d, 'sl-rgb-clear').count()) await t(d, 'sl-rgb-clear').click();
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await combo(d, 'Orientation').selectOption({ label: 'Crossline' }); await goTo(d, 2051, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' }); await goTo(d, 1700, { quiet: true });
    await combo(d, 'Orientation').selectOption({ label: 'Inline' }); await goTo(d, 1027, { quiet: true });
    await showWindow(d, '3D', '3d', false);
    await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
    await cubeLayers(d, { 'Horizon surfaces': true, 'Well paths & tops': true, 'Axis gizmo': false });
    await fullscreenBtn(d, '3d').click();
    await d.sleep(5000);
    const b = await d.page.locator('[data-testid="window-3d"] canvas').first().boundingBox();
    await d.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(250); }
    await park(d, 1500, 900);
  },
  steps: [
    { id: 'close', chapter: 'One project', chapterSub: 'Petrolord Suite · Geoscience',
      say: 'Wells, logs, seismic, maps and the model, on one shared project, in the browser. That is geoscience with Petrolord.',
      do: async (d) => { await drag3d(d, 260, 0, 90); } },
  ],
};
