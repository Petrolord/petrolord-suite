// Geoscience module showcase, scene 4b: the column behind the tops in
// Stratigraphy Studio (unit column against the time scale).
import { login, scene, t, park, openApp } from './geo-common.mjs';

export default {
  ...scene('geo-s04b'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'stratigraphy-studio', 'strat-view-column', { settle: 4000 });
    await t(d, 'strat-view-column').click();
    await d.sleep(2500);
    await park(d);
  },
  steps: [
    { id: 'column', chapterSub: 'Stratigraphy Studio',
      say: 'Stratigraphy Studio keeps the column behind those tops, unit by unit, against the time scale.',
      do: async (d) => { await d.moveTo(t(d, 'strat-column-chart'), { ms: 1600, dx: 0.5, dy: 0.5 }); } },
  ],
};
