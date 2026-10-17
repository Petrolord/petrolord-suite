// Geoscience module showcase, scene 6c: QI products in Seismolord (saved by
// the QI showcase, read only). The model-based acoustic impedance on inline
// 1027 with the wells, then the hydrocarbon sand probability map over the
// Ekene Sand (saved against the near stack).
import { login, scene, t, park, expectText, note } from './geo-common.mjs';
import { combo, mapSel, activate, onlyVisible, goTo, showWindow, closeWindow, fullscreenBtn, setVisible, ex } from './geo-seis.mjs';

const AI = 'EKENE3D-v4-full.sgy AI, Model-based';
const NEAR = 'EKENE3D-v4-near.sgy';
const LAYERS = ['Top Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity', 'Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];

export default {
  ...scene('geo-s06c'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await activate(d, shared, AI);
    await closeWindow(d, '3D'); await closeWindow(d, 'Map'); await closeWindow(d, 'Synthetics');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await onlyVisible(d, LAYERS);
    if (await t(d, 'sl-rgb-clear').count()) await t(d, 'sl-rgb-clear').click();
    // impedance is all positive: Value range (#1209) maps P2 to P98 onto the colour scale
    await combo(d, 'Amplitude scale').selectOption({ label: 'Value range' });
    await combo(d, 'Colormap').selectOption({ label: 'Spectrum' });
    await combo(d, 'Orientation').selectOption({ label: 'Inline' }); await goTo(d, 1027, { quiet: true });
    await fullscreenBtn(d, 'section').click(); await d.sleep(2500);
    await park(d);
  },
  steps: [
    { id: 'ai', chapterSub: 'QI Studio · inversion',
      say: 'The inversion turns the seismic into acoustic impedance, guided by the horizons and tied to the wells. The soft sand shows in blue at the top of the reservoir.',
      do: async (d) => {
        const c = d.page.locator('[data-testid="window-section"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.38 }, { ms: 1000 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -240); await d.sleep(350); }
        await d.sleep(1200);
      } },
    { id: 'hc',
      say: 'Bayesian facies turn it into the probability of hydrocarbon sand, mapped over the Ekene Sand, ready for the prospect.',
      do: async (d, shared) => {
        await d.click(fullscreenBtn(d, 'section'));
        await activate(d, shared, NEAR, { reopen: false });
        const names = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).map((x) => x.trim());
        const surf = names.findLast((n) => n.includes('probability of Hydrocarbon sand'));
        if (surf) await setVisible(d, surf, true);
        await showWindow(d, 'Map', 'map');
        await d.sleep(2500);
        const opts = await mapSel(d, 0).locator('option').allInnerTexts();
        await d.select(mapSel(d, 0), { label: opts.findLast((o) => o.includes('probability of Hydrocarbon sand')) });
        await d.click(d.page.locator('[data-testid="window-map"] button[title="Fullscreen"]'));
        await d.sleep(4000);
      } },
  ],
};
