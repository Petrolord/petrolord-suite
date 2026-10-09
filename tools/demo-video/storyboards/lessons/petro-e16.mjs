// Lesson E16: Calibrating logs to core (Ekene-1, kit v2.1 core: 59 plugs,
// 5079-5137 ft, loaded with Well Data Manager as a LAS into the existing
// well). Dry run 2026-10-08, Module E base: Core dialog Ekene Sand fit
// log10 k = 0.455 + 9.72 phi, R2 0.818, RMS 0.112 log cycles, phi 0.131 to
// 0.228. At the pay's average log phi_e 0.198 the transform gives 240 mD;
// Timur Buckles 0.04 163.3 mD; Buckles 0.033 239.9 mD. Truth 213.9 mD (log
// phi_e in the pay 0.198 against a true 0.193).
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, MODULE_E_BASE, zoomTracksAt } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-e16',
  ...lessonMeta(16, 'E', 'Calibrating logs to core: *the poro-perm transform*', 'Routine core analysis against the logs: checking porosity, fitting the porosity-permeability transform, and tuning the log model to core'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 16', chapterSub: 'Module E · Permeability, net pay and calibration',
      say: 'Logs measure in place and continuously, but indirectly. Core measures directly, on a few inches of rock at a time. Calibration ties the two together. In this lesson we check log porosity against core, fit a porosity-permeability transform, and tune the log model until it agrees.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 16', title: 'Calibrating logs to core',
        body: '<ul><li>Routine core analysis</li><li>Core porosity against log porosity</li><li>The porosity-permeability transform</li><li>Tuning the log model</li></ul>' }) },
    { id: 'core', chapter: 'The core', chapterSub: 'Ekene-1, 5079 to 5137 ft',
      say: 'Ekene-1 was cored across the Ekene Sand, from five thousand and seventy nine to five thousand one hundred and thirty seven feet. The lab cut a plug every foot in the sand and measured helium porosity and air permeability: fifty nine plugs. They came as a LAS file, loaded into the well with Well Data Manager, as a LAS into an existing well. The curve list now shows them: C P O R and C K H.',
      do: async (d) => { await d.hideSlide(); await d.highlight('petro-curve-inventory'); } },
    { id: 'tracks', chapter: 'Porosity first',
      say: 'Open Core, then Show on tracks. The core calibration layout puts each plug\'s porosity on the porosity track, as points against the log curve. Zoom onto the cored interval. The plugs follow the log porosity foot by foot, so the depths match and the log porosity is sound. Check this before anything else: a depth shift between core and log ruins every crossplot.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.click('petro-core'); await d.waitFor('petro-core-dialog'); await d.sleep(800);
        await d.click('petro-core-tracks'); await d.sleep(1500);
        shared.values.g = await zoomTracksAt(d, 5110, 12);
      } },
    { id: 'transform', chapter: 'The transform', chapterSub: 'log k against porosity',
      say: 'Back in the Core dialog, the crossplot shows each plug\'s permeability on a log scale against its porosity, with the log model\'s samples behind. The studio fits the classic semi-log transform per zone. For the Ekene Sand: log k equals zero point four five five plus nine point seven two times porosity. R squared zero point eight two, and a scatter of a little over a tenth of a log cycle, about thirty percent either way. It holds between thirteen and twenty three percent porosity; outside that, it is extrapolation.',
      do: async (d) => {
        await d.click('petro-core'); await d.waitFor('petro-core-dialog'); await d.sleep(800);
        await expectText(d, 'petro-core-fits', /Ekene Sand\s*59\s*0\.455\s*9\.72\s*0\.818\s*0\.112\s*0\.131 to 0\.228/, 'core fit');
        await d.highlight('petro-core-crossplot'); await d.sleep(5000); await d.unhighlight();
        await d.highlight('petro-core-fits');
      } },
    { id: 'compare', chapter: 'What core says about the pay',
      say: 'Apply the transform to the pay\'s average log porosity, nineteen point eight percent, and core says two hundred and forty millidarcies. Timur, with the default Buckles number, said one hundred and sixty three: a third too low.',
      do: async (d) => { await d.unhighlight(); await d.page.keyboard.press('Escape'); await d.slide({ eyebrow: 'What core says about the pay', title: 'Core against the log model',
        body: '<ul><li>Pay average log φ<sub>e</sub>: 0.198</li><li>Core transform: 10<sup>0.455 + 9.72 × 0.198</sup> = <b>240</b> mD</li><li>Timur, Buckles 0.04: <b>163</b> mD</li></ul>' }); } },
    { id: 'tune', chapter: 'Tune the log model',
      say: 'So tune the log model to the core. Timur\'s permeability goes as one over the Buckles number squared. Lower it to zero point zero three three, and the pay averages two hundred and forty: the log model now agrees with the core, and carries that calibration to every depth, and every well, where there is no core.',
      do: async (d) => {
        await d.hideSlide();
        await d.type('petro-param-bucklesConst', '0.033'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /k gm 239\.9 mD/, 'Buckles 0.033');
        await d.highlight(ekene(d)); await d.callout('k', ekene(d), 'Timur, Buckles 0.033: 240 mD (core 240)', 'left');
      } },
    { id: 'truth', chapter: 'Checking against the field',
      say: 'The earth model says two hundred and fourteen. The calibrated answer is twelve percent high, and the reason is porosity: in the pay, log porosity reads half a unit high, nineteen point eight against nineteen point three. At nine point seven log cycles per unit of porosity, half a unit is twelve percent of permeability. Errors carry through, which is why porosity comes first.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Checking against the field', title: 'Errors carry through',
        body: '<ul><li>Calibrated log k: <b>240</b> mD; truth <b>214</b> mD</li><li>Pay log φ<sub>e</sub> 0.198 against a true 0.193</li><li>10<sup>9.72 × 0.005</sup> = 1.12: half a unit is 12%</li></ul>' }); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Check core porosity against log porosity, and the depths, first. Fit the porosity-permeability transform per zone, and respect its range. Then tune the log model so it reproduces the core, and carry it where there is no core. Next: cutoffs and net pay.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 16', title: 'Calibrating to core',
        body: '<ul><li>Porosity and depth match first</li><li>Ekene Sand: log k = 0.455 + 9.72 φ, R² 0.82</li><li>Timur tuned to core: Buckles 0.033, 240 mD (truth 214)</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: cutoffs and net pay</p>' }) },
  ],
};
