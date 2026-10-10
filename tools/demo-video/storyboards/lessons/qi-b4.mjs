// QI lesson B4: shear logs, elastic attributes and a local shear trend.
// Figures from the 2026-10-10 probe (kit v3, Ekene-1, Ekene Sand zone):
// zone means over 210 samples AI 22303 ft/s·g/cc, SI 12071, Vp/Vs 1.877,
// Poisson's ratio 0.291, K 12.08 GPa, mu 5.98 GPa, lambda-rho 18.92, mu-rho 13.95;
// local trend Vs = -820.0 + 809.70 Vp (km/s -> m/s), 79 wet samples, SE 41 m/s,
// R² 0.911, Vp 2525 to 3482 m/s, 131 hydrocarbon samples left out.
// The trend is shown but not saved: every Ekene well has a shear log.
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openRpsWell } from '../qi-common.mjs';

const ZONE = 'Ekene Sand (5078.7–5183.7 ft)';
const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'lesson-qi-b4',
  ...qiLessonMeta(4, 'B', 'Shear logs and *the local shear trend*', 'Elastic attributes from Vp, Vs and density, and why a shear trend calibrated on your own wells beats a published one'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openRpsWell(d, shared, 'Ekene-1');
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 4', chapterSub: 'Module B · Rock physics first',
      say: 'Module A asked whether the data is good enough. Module B asks whether the rock physics lets the seismic see the fluid. It starts with shear. Compressional waves feel the pore fluid; shear waves barely do, because a fluid has no shear strength. That contrast is what AVO and prestack inversion exploit, so a good shear log is worth a great deal.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 4', title: 'Shear logs',
        body: '<ul><li><b>Vp</b> feels the pore fluid</li><li><b>Vs</b> barely does: fluids have no shear strength</li><li>The contrast is what AVO and inversion use</li></ul>' }) },
    { id: 'attrs', chapter: 'Elastic attributes', chapterSub: 'From Vp, Vs and density',
      say: 'From Vp, Vs and density come the attributes interpreters use. Acoustic impedance is Vp times density. Shear impedance is Vs times density. Vp over Vs and Poisson\'s ratio respond to the fluid. Lambda rho and mu rho split incompressibility from rigidity.',
      do: async (d) => d.slide({ eyebrow: 'Elastic attributes', title: 'One rock, many views', formula: 'AI = Vp·ρ   SI = Vs·ρ   λρ = AI² − 2·SI²   μρ = SI²',
        body: '<ul><li><b>Vp/Vs</b>, <b>Poisson\'s ratio</b>: fluid sensitive</li><li><b>λρ</b>: incompressibility; <b>μρ</b>: rigidity</li></ul>' }) },
    { id: 'elastic', chapter: 'Ekene-1', chapterSub: 'Rock Physics Studio · Elastic logs',
      say: 'In Rock Physics Studio, the elastic logs view computes them on Ekene one. Over the Ekene Sand, from two hundred and ten samples, acoustic impedance averages twenty two thousand three hundred in feet per second times grams per cc, Vp over Vs is one point eight eight, and Poisson\'s ratio is point two nine.',
      sub: 'In Rock Physics Studio, the elastic logs view computes them on Ekene-1. Over the Ekene Sand, from 210 samples, acoustic impedance averages 22,300 ft/s·g/cc, Vp/Vs is 1.88, and Poisson\'s ratio is 0.29.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('rp-view-elastic');
        await d.select('rp-elastic-zone', { label: ZONE });
        await expectText(d, 'rp-elastic-means', /22303\.\d+\s*12071\.\d+\s*1\.877\s*0\.291/, 'zone means');
        await d.highlight('rp-elastic-means');
      } },
    { id: 'track',
      say: 'The depth track shows how they vary through the sand. The oil leg at the top reads softer than the water leg below: lower impedance and lower Vp over Vs. That difference is what the rest of this module quantifies.',
      do: async (d) => { await d.unhighlight(); await d.highlight('rp-elastic-track'); } },
    { id: 'gc', chapter: 'When there is no shear log', chapterSub: 'Greenberg-Castagna',
      say: 'Many older wells have no shear log. The usual fallback is Greenberg and Castagna: published regressions of Vs on Vp for brine-filled sandstone, shale, limestone and dolomite, mixed by mineral fractions. Where the rock holds hydrocarbon, Vs is found by taking it to brine with Gassmann, applying the regression, and iterating. But a published line is an average of other basins.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'No shear log?', title: 'Greenberg-Castagna', formula: 'sandstone: Vs = 0.804·Vp − 0.856 (km/s)',
          body: '<ul><li>Brine-rock regressions, mixed by mineralogy</li><li>Hydrocarbon rock: iterate through Gassmann</li><li>An average of <b>other</b> basins</li></ul>' });
      } },
    { id: 'fit', chapter: 'A local trend', chapterSub: 'Calibrated on Ekene-1',
      say: 'Where one well has a measured shear log, fit your own. Rock Physics Studio regresses Vs on Vp over the zone\'s water-bearing samples only, with water saturation of point nine or more, because the trend must describe brine rock. Seventy nine samples qualify; a hundred and thirty one hydrocarbon samples are left out.',
      sub: 'Where one well has a measured shear log, fit your own. Rock Physics Studio regresses Vs on Vp over the zone\'s water-bearing samples only, with water saturation of 0.9 or more, because the trend must describe brine rock. 79 samples qualify; 131 hydrocarbon samples are left out.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('rp-local-shear-fit');
        await expectText(d, 'rp-local-shear-result', /Vs = -820\.0 \+ 809\.70 Vp[\s\S]*79 samples[\s\S]*131 hydrocarbon-bearing samples/, 'local trend');
        await d.highlight('rp-local-shear-result');
      } },
    { id: 'compare',
      say: 'The fit is good: R squared point nine one, a standard error of forty one metres per second. At a Vp of three kilometres per second it gives sixteen hundred and nine metres per second, where Greenberg and Castagna\'s sandstone line gives fifteen hundred and fifty seven. Three percent may sound small, but it moves Vp over Vs by the same three percent, a fair fraction of the fluid effect itself.',
      sub: 'The fit is good: R² 0.91, a standard error of 41 m/s. At a Vp of 3 km/s it gives 1,609 m/s, where Greenberg and Castagna\'s sandstone line gives 1,557 m/s. Three percent may sound small, but it moves Vp/Vs by the same three percent, a fair fraction of the fluid effect itself.',
      do: async (d) => {
        await expectText(d, 'rp-local-shear-result', /R² 0\.911/, 'R squared');
      } },
    { id: 'use',
      say: 'Saved into the project, the trend replaces Greenberg and Castagna on every well without a shear log, and those wells carry a Vs uncertainty from the fit. The calibration range matters too: twenty five hundred to thirty five hundred metres per second. Outside it, the line is an extrapolation. Every Ekene well has a shear log, so we leave it unsaved here.',
      sub: 'Saved into the project, the trend replaces Greenberg and Castagna on every well without a shear log, and those wells carry a Vs uncertainty from the fit. The calibration range matters too: 2,525 to 3,482 m/s. Outside it, the line is an extrapolation. Every Ekene well has a shear log, so we leave it unsaved here.',
      do: async (d) => { await d.unhighlight(); await d.highlight('rp-local-shear-use'); } },
    { id: 'next',
      say: 'Next lesson: the fluids themselves, and Gassmann\'s equations, which predict how the rock changes when oil is replaced by brine.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Fluids and Gassmann', body: '<ul><li>Batzle-Wang brine, oil and gas</li><li>Fluid substitution, sample by sample</li><li>How much the oil softens the rock</li></ul>' });
      } },
  ],
};
