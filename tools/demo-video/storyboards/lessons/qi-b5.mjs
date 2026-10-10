// QI lesson B5: fluids (Batzle-Wang) and Gassmann fluid substitution.
// Figures from the 2026-10-10 probe (kit v3, Ekene-1, Ekene Sand, needs #978
// for the two fluid-A rows): brine 1.005 g/cc, K 2.663 GPa at 82.2 °C /
// 22.06 MPa; 196 samples substituted, 3 skipped, 11 left in situ; interval
// means Vp 9550 -> 9918 ft/s, Vs 5171 -> 5160, rho 2.336 -> 2.346, AI 22303 ->
// 23260, Vp/Vs 1.877 -> 1.957, Poisson 0.291 -> 0.314. Truth (kit 10-qi):
// oil leg net sand AI +7.5 percent, live oil 0.754 g/cc, K 0.853 GPa.
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openRpsWell, ZONE_LABEL } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const subTable = (d) => d.page.locator('table').filter({ has: d.page.getByTestId('rp-sub-before-ai') }).first();

export default {
  id: 'lesson-qi-b5',
  ...qiLessonMeta(5, 'B', 'Fluids and Gassmann: *how much does the oil soften the rock?*', 'Batzle-Wang fluid properties at reservoir conditions, and fluid substitution sample by sample on Ekene-1'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openRpsWell(d, shared, 'Ekene-1');
    await d.click('rp-view-fluids');
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 5', chapterSub: 'Module B · Rock physics first',
      say: 'Last lesson we met the shear log. Now the question at the heart of feasibility: if the oil in the Ekene Sand were brine instead, how different would the rock look? If the answer is "hardly at all", no seismic method will find the oil. Two pieces of physics answer it: the fluid properties, and Gassmann\'s equations.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 5', title: 'Fluids and Gassmann',
        body: '<ul><li><b>Batzle-Wang</b>: brine, oil and gas at reservoir conditions</li><li><b>Gassmann</b>: swap the pore fluid, keep the frame</li><li>The answer: how far AI and Vp/Vs move</li></ul>' }) },
    { id: 'bw', chapter: 'The fluids', chapterSub: 'Batzle and Wang, 1992',
      say: 'Fluid properties depend strongly on temperature and pressure. Batzle and Wang\'s correlations give density and bulk modulus for brine from its salinity, for oil from its gravity and dissolved gas, and for gas from its specific gravity. Oil is far more compressible than brine, and gas more compressible again.',
      do: async (d) => d.slide({ eyebrow: 'The fluids', title: 'Batzle-Wang at reservoir conditions',
        body: '<ul><li><b>Brine</b>: salinity, T, P</li><li><b>Live oil</b>: API, GOR, gas gravity, T, P</li><li><b>Gas</b>: specific gravity, T, P</li><li>Mixed by <b>Wood</b> (uniform) or <b>Voigt</b> (patchy)</li></ul>' }) },
    { id: 'conditions', chapter: 'Ekene conditions', chapterSub: 'Rock Physics Studio · Fluids & Gassmann',
      say: 'On Ekene one, in the Ekene Sand: one hundred and eighty degrees Fahrenheit and thirty two hundred p s i, a thirty two degree A P I live oil with a gas oil ratio of four hundred, and thirty five thousand parts per million brine.',
      sub: 'On Ekene-1, in the Ekene Sand: 180 °F and 3,200 psi, a 32 °API live oil with a GOR of 400 scf/STB, and 35,000 ppm brine.',
      do: async (d) => {
        await d.hideSlide();
        await d.select('rp-zone-select', { label: ZONE_LABEL });
        await d.type('rp-param-tC', '180');
        await d.type('rp-param-pMPa', '3200');
        await d.select('rp-param-fluidA-kind', { label: 'live oil' });
        await d.type('rp-param-fluidA-api', '32');
        await d.select('rp-param-fluidA-gor-unit', { label: 'scf/STB' });
        await d.type('rp-param-fluidA-gor', '400');
        await d.type('rp-param-fluidA-gg', '0.75');
        await d.type('rp-param-fluidB-sw', '1');
        await d.click('rp-apply-params');
        await d.sleep(2500);
      } },
    { id: 'table',
      say: 'The pore fluids table. The water saturation comes from the S W log, sample by sample, so fluid A is a mix of brine and live oil in proportions that change down the well. The brine is one point zero zero five grams per cc with a bulk modulus of two point six six gigapascals. The live oil is lighter and about a third as stiff.',
      sub: 'The pore fluids table. The water saturation comes from the SW log, sample by sample, so fluid A is a mix of brine and live oil in proportions that change down the well. The brine is 1.005 g/cc with a bulk modulus of 2.66 GPa. The live oil is lighter and about a third as stiff.',
      do: async (d) => {
        await expectText(d, 'rp-fluid-a-rho', /^1\.005$/, 'brine density');
        await expectText(d, 'rp-fluid-a-k', /^2\.66\d$/, 'brine modulus');
        await expectText(d, 'rp-fluid-a-hc-k', /^0\.[78]\d\d$/, 'live oil modulus');
        await d.highlight(d.page.locator('[data-testid="rp-fluids-panel"] div.rounded').filter({ hasText: 'Pore fluids' }).first());
      } },
    { id: 'gassmann', chapter: 'Gassmann', chapterSub: 'Swap the fluid, keep the frame',
      say: 'Gassmann\'s idea: the dry rock frame does not care what fills its pores. Invert the measured rock to its dry frame with the in situ fluid, then fill the same frame with the new fluid. The shear modulus is unchanged; only the bulk modulus and the density move. The mineral modulus here comes from quartz and clay mixed by the shale volume log.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Gassmann', title: 'Swap the fluid, keep the frame', formula: 'K_sat = K_dry + (1 − K_dry/K_min)² / (φ/K_fl + (1 − φ)/K_min − K_dry/K_min²)',
          body: '<ul><li>μ unchanged: fluids carry no shear</li><li>Density changes with the fluid</li><li>K_min from quartz and clay by Vsh</li></ul>' });
      } },
    { id: 'header',
      say: 'One hundred and ninety six samples were substituted. Three were skipped, because inverting them gave a negative dry modulus: their inputs disagree, usually porosity against the sonic. Eleven were left as they are, outside Gassmann\'s limits: shalier than half, or nearly without porosity. Gassmann assumes connected pores, which shale does not have.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, 'rp-sub-header', /196 SAMPLES \(3 SKIPPED\)[\s\S]*11 LEFT IN SITU/i, 'substitution header');
        await d.highlight('rp-sub-header');
      } },
    { id: 'result', chapter: 'The answer', chapterSub: 'Oil to brine',
      say: 'Across the Ekene Sand, brine in place of oil raises Vp from ninety five hundred and fifty to ninety nine hundred feet per second, leaves Vs almost unchanged, and raises the density slightly. Acoustic impedance goes up four point three percent, and Vp over Vs from one point eight eight to one point nine six.',
      sub: 'Across the Ekene Sand, brine in place of oil raises Vp from 9,550 to 9,918 ft/s, leaves Vs almost unchanged, and raises the density slightly. Acoustic impedance goes up 4.3 percent, and Vp/Vs from 1.88 to 1.96.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'rp-sub-before-ai', /^22303$/, 'AI before');
        await expectText(d, 'rp-sub-after-ai', /^23260$/, 'AI after');
        await expectText(d, 'rp-sub-before-vpvs', /^1\.877$/, 'Vp/Vs before');
        await expectText(d, 'rp-sub-after-vpvs', /^1\.957$/, 'Vp/Vs after');
        await d.highlight(subTable(d));
      } },
    { id: 'dilute',
      say: 'Why only four percent? The zone includes the water leg below the oil-water contact, which is already brine and does not move. Over the oil leg alone, the kit\'s truth tables put the change at seven and a half percent in impedance and seven percent in Vp over Vs. That is a usable fluid effect, comparable to what AVO and inversion can detect in good data.',
      sub: 'Why only 4 percent? The zone includes the water leg below the oil-water contact, which is already brine and does not move. Over the oil leg alone, the kit\'s truth tables put the change at 7.5 percent in impedance and 7 percent in Vp/Vs. That is a usable fluid effect, comparable to what AVO and inversion can detect in good data.',
      do: async (d) => { await d.unhighlight(); await d.highlight(d.page.locator('[data-testid="rp-fluids-panel"] .recharts-wrapper').first()); } },
    { id: 'next',
      say: 'Next lesson: the same answer on a crossplot, where oil, brine and shale separate, and the wet trend tells us how far each sample is from brine.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Crossplots and the wet trend', body: '<ul><li>AI against Vp/Vs</li><li>Where oil, brine and shale fall</li><li>Distance from the wet trend</li></ul>' });
      } },
  ],
};
