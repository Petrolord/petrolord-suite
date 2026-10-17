// Geoscience module showcase, scene 7: Mapping & Surface Studio. The depth
// map of the top of the Ekene Sand (Seismolord demos, 201 x 177 at 25 m, the
// conditioned copy),
// the measured closure drawn on the map (#1201: fill to spill, spill
// contour, crest, contact), then the isochore of the sand. Nothing is saved.
import { login, scene, t, park, openApp, expectText, note } from './geo-common.mjs';

// the conditioned copy of the Seismolord demos' depth map (Earth Modeling agent, 2026-10-17: tracking spots removed; the original stays)
const SURFACE = 'Ekene Sand (depth ft, conditioned)';
const row = (d, name) => d.page.locator(`[data-testid="map-surface-row"][data-surface-name="${name}"]`).first();
const CREST = { x: 400837, y: 521762 };

/** A world point (metres) on the map canvas, from the viewport's e2e contract. */
async function worldToPage(d, { x, y }) {
  const c = t(d, 'map-canvas').first();
  const b = await c.boundingBox();
  const a = await c.evaluate((el) => ({ s: +el.dataset.scale, cx: +el.dataset.cx, cy: +el.dataset.cy }));
  return { x: b.x + b.width / 2 + (x - a.cx) * a.s, y: b.y + b.height / 2 - (y - a.cy) * a.s };
}

export default {
  ...scene('geo-s07'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'mapping-surface-studio', 'map-surface-row');
    await park(d);
  },
  steps: [
    { id: 'depth', chapter: 'Maps and closures', chapterSub: 'Mapping & Surface Studio',
      say: 'Mapping and Surface Studio contours the top of the Ekene Sand in depth: a rollover, closing against the growth fault.',
      do: async (d, shared) => {
        await d.click(row(d, SURFACE));
        await t(d, 'map-zrange').first().waitFor({ timeout: 30000 });
        await d.sleep(2500);
        await expectText(d, t(d, 'map-zrange').first(), /201×177/, 'the 201 x 177 depth grid');
        // in on the rollover (the hanging wall), away from the footwall's tracking spots
        const p = await worldToPage(d, { x: 401500, y: 521900 });
        await d.moveTo(p, { ms: 1000 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -150); await d.sleep(350); }
        await d.sleep(1200);
      } },
    { id: 'closure',
      say: 'Pick the closure at the crest. The trap fills to its spill point, and the oil sits above the contact.',
      do: async (d, shared) => {
        await d.type('map-grv-contact', '5001');
        await d.click('map-grv-pick');
        await d.sleep(600);
        const p = await worldToPage(d, CREST);
        await d.moveTo(p, { ms: 1200 });
        await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [p.x, p.y]);
        await d.page.mouse.click(p.x, p.y);
        await t(d, 'map-grv-result').waitFor({ timeout: 30000 });
        await d.sleep(2000);
        await note(d, shared, 'grv', 'map-grv-result');
      } },
    { id: 'numbers',
      say: 'The crest at four thousand nine hundred and fifty nine feet, the spill at five thousand and eighty five, and the contact at five thousand and one.',
      sub: 'The crest at 4,959 ft, the spill at 5,085 ft, and the contact at 5,001 ft.',
      do: async (d) => {
        await expectText(d, 'map-grv-result', /crest -4958\.5 ft; it spills at -5084\.6 ft/, 'crest and spill');
        await d.highlight('map-grv-result');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'isochore',
      say: 'Subtract the base from the top of the sand, mapped from the wells, and the isochore shows it thickening from eighty two to a hundred and eighteen feet.',
      sub: 'Subtract the base from the top of the sand, mapped from the wells, and the isochore shows it thickening from 82 to 118 ft.',
      do: async (d, shared) => {
        await t(d, 'map-arith-op').evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }));
        await d.select('map-arith-op', { index: 0 });
        const opt = async (id, name) => { const o = (await t(d, id).locator('option').allInnerTexts()).find((x) => x.startsWith(name)); await d.select(id, { label: o }); };
        await opt('map-iso-a', 'Ekene Sand top (6-well map)');
        await opt('map-iso-b', 'Ekene Sand base (6-well map)');
        await d.click('map-iso-run');
        await d.sleep(3500);
        await expectText(d, t(d, 'map-zrange').first(), /z 82\.0 to 117\.8 ft/, 'isochore range');
      } },
  ],
};
