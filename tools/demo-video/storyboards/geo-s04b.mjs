// Geoscience module showcase, scene 4b: the column behind the tops in
// Stratigraphy Studio (unit column against the time scale). The demo account
// holds no saved column: the units (derived from the kit's dated surfaces,
// 06-stratigraphy/ekene-stratigraphic-column.csv) are imported off camera and
// never saved, so nothing is written.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, scene, t, park, openApp } from './geo-common.mjs';

const UNITS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'geo-assets', 'ekene-units.csv');

export default {
  ...scene('geo-s04b'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'stratigraphy-studio', 'strat-view-column', { settle: 4000 });
    await t(d, 'strat-view-column').click();
    await d.sleep(1500);
    await t(d, 'strat-column-import').setInputFiles(UNITS);
    await d.sleep(2500);
    await park(d);
  },
  steps: [
    { id: 'column', chapterSub: 'Stratigraphy Studio',
      say: 'Stratigraphy Studio keeps the column behind those tops, unit by unit, against the time scale.',
      do: async (d) => {
        await t(d, 'strat-column-chart').evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.moveTo(t(d, 'strat-column-chart'), { ms: 1600, dx: 0.45, dy: 0.35 });
      } },
  ],
};
