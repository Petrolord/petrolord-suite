// Lesson C10: Sonic porosity when there is no density log (Ekene-9, kit v2,
// feet). Dry run 2026-10-08 (site a1513cd, Bcp field from #942), linear Vsh
// 18/125, cutoffs open, shale correction 0 (total porosity), dt matrix 55.5
// and fluid 189 us/ft. Ekene-9 Ekene Sand: Wyllie 0.383; QC hint Bcp 1.52
// (shale 152 us/ft) gives 0.252; RHG 0.316; truth 0.198. Ekene-1 (both
// logs): density (matrix 2.67) 0.200; sonic Bcp 1 0.380, Bcp 1.9 0.200.
// Ekene-9 with Bcp 1.9: 0.201; Oboro Sand (gas) 0.257 against truth 0.195.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, OPEN_CUTOFFS } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');
const oboro = (d) => ZONE_CARD(d, 'Oboro Sand');
const SONIC = { grClean: 18, grClay: 125, vshMethod: 'linear', phiShale: 0, phiSource: 'sonic', dtMa: 55.5, dtFl: 189, sonicCp: 1, ...OPEN_CUTOFFS };
const pickWell = async (d, name) => {
  await d.click(d.page.locator(`[data-well-name="${name}"]`).first());
  await d.waitFor('petro-curve-inventory'); await d.sleep(1500);
};

export default {
  id: 'lesson-c10',
  ...lessonMeta(10, 'C', 'Sonic porosity: *Wyllie, Raymer-Hunt-Gardner and calibration*', 'Porosity from the sonic log when there is no density, why it overreads in young sands, and how to calibrate it on an offset well'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    // parameters are global (scope: all wells), so one set serves both wells
    await openPetroWell(d, shared, 'Ekene-9');
    await baseParams(d, SONIC);
    await ensureZonesOn(d);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 10', chapterSub: 'Module C · Porosity',
      say: 'Many older wells, and some new ones, have no density log. What they nearly always have is a sonic. In this lesson we take porosity from the sonic, see why it can be badly wrong in young sands, and calibrate it against a neighbouring well.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 10', title: 'Sonic porosity',
        body: '<ul><li>The time average and its cousin</li><li>Why young sands read too porous</li><li>Calibrating on an offset well</li><li>Gas, again</li></ul>' }) },
    { id: 'concept', chapter: 'The time average', chapterSub: 'Wyllie, and Raymer-Hunt-Gardner',
      say: 'The sonic measures slowness: how many microseconds sound takes to travel one foot of rock. Wyllie\'s time average says the rock\'s slowness is the grains\' and the fluid\'s, weighted by volume. So porosity is the log reading minus the matrix slowness, over the fluid minus the matrix. For quartz sandstone the matrix is about fifty five point five, and brine about one hundred and eighty nine. Raymer, Hunt and Gardner later fitted a field-based form that behaves better at high porosity.',
      do: async (d) => d.slide({ eyebrow: 'The time average', title: 'Slowness, weighted by volume',
        body: '<ul><li>Quartz matrix about <b>55.5</b> µs/ft, brine about <b>189</b> µs/ft</li><li>Raymer-Hunt-Gardner: φ = 0.67 (Δt − Δt<sub>ma</sub>) / Δt</li></ul>', formula: 'φ<sub>S</sub> = (Δt − Δt<sub>ma</sub>) / (Δt<sub>fl</sub> − Δt<sub>ma</sub>)' }) },
    { id: 'inventory', chapter: 'Ekene-9', chapterSub: 'No density, no neutron',
      say: 'Ekene-9 is a deviated producer in the west of the field. Its curve list shows gamma ray, caliper, sonic and resistivity. No density, no neutron. The porosity source is set to sonic.',
      do: async (d) => { await d.hideSlide(); await d.highlight('petro-curve-inventory'); } },
    { id: 'wyllie', chapter: 'Wyllie as it stands',
      say: 'With those textbook constants, and the zone card set up as before, open cutoffs and total porosity, the Ekene Sand reads thirty eight percent. The earth model says nineteen point eight. On Ekene-1 the density log read twenty for the same sand. The sonic has doubled it.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, ekene(d), /φe 0\.383/, 'Wyllie Ekene-9');
        await d.highlight(ekene(d)); await d.callout('w', ekene(d), 'Wyllie: φ 0.383 (truth 0.198)', 'left');
      } },
    { id: 'why', chapter: 'Why young sands read too porous',
      say: 'Two reasons. The time average assumes compacted, cemented rock, where sound runs through firm grain contacts. These Niger Delta sands are young and loose, so sound travels slower than the formula expects, and slowness reads as porosity. And the sand is a fifth clay, which is slow too. The classic fix is a compaction factor, B C P, that divides the Wyllie porosity.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Why young sands read too porous', title: 'Loose grains and clay are slow',
        body: '<ul><li>The time average assumes compacted rock</li><li>Uncompacted sand: sound is slower, porosity reads high</li><li>Clay is slow as well</li></ul>', formula: 'φ<sub>S</sub> = (Δt − Δt<sub>ma</sub>) / (Δt<sub>fl</sub> − Δt<sub>ma</sub>) × 1 / B<sub>cp</sub>' }); } },
    { id: 'hint', chapter: 'The rule of thumb', chapterSub: 'Shale slowness over one hundred',
      say: 'The studio spots the problem. Its check says this well\'s shales read one hundred and fifty two microseconds per foot, slower than one hundred, and suggests a compaction factor of about one point five two, the shale slowness over one hundred. Set it, and the Ekene Sand drops to twenty five percent. Better, but still five units high, because the rule of thumb knows nothing about the clay in this sand.',
      do: async (d) => {
        await d.hideSlide();
        await d.highlight('petro-param-qc'); await d.sleep(2500);
        await d.type('petro-param-sonicCp', '1.52'); await d.click('petro-params-apply');
        await d.unhighlight();
        await expectText(d, ekene(d), /φe 0\.25[12]/, 'Bcp 1.52 Ekene-9');
        await d.highlight(ekene(d)); await d.callout('h', ekene(d), 'Bcp 1.52: φ 0.252 (truth 0.198)', 'left');
      } },
    { id: 'rhg',
      say: 'Raymer, Hunt and Gardner, with no compaction term, gives thirty one and a half percent. Closer than raw Wyllie, still far too high. Neither textbook route gets this sand right.',
      do: async (d) => {
        await d.clearCallouts();
        await d.select('petro-param-sonicMethod', 'rhg'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.316/, 'RHG Ekene-9');
        await d.callout('r', ekene(d), 'RHG: φ 0.316', 'left');
      } },
    { id: 'offset', chapter: 'Calibrate on an offset well', chapterSub: 'Ekene-1 has both logs',
      say: 'The reliable route is calibration. Ekene-1 has both a density and a sonic. Open it, and put the sonic back to Wyllie with no compaction factor. It reads thirty eight percent, just like Ekene-9. In Lesson 8 its density log gave twenty percent. Now find the compaction factor that makes the sonic agree with the density: one point nine.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await pickWell(d, 'Ekene-1');
        await d.select('petro-param-sonicMethod', 'wyllie'); await d.type('petro-param-sonicCp', '1'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.380/, 'Ekene-1 sonic Bcp 1');
        await d.highlight(ekene(d)); await d.sleep(1500);
        await d.type('petro-param-sonicCp', '1.9'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.200/, 'Ekene-1 sonic Bcp 1.9');
        await d.callout('o', ekene(d), 'Ekene-1, Bcp 1.9: sonic φ 0.200 = density 0.200', 'left');
      } },
    { id: 'carry', chapter: 'Carry it across',
      say: 'Back on Ekene-9, the same sand in the same field, with the same parameters: Wyllie and a compaction factor of one point nine. The Ekene Sand reads twenty point one percent, against the earth model\'s nineteen point eight. Calibrated on a neighbour, the sonic is as good as the density.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await pickWell(d, 'Ekene-9');
        await expectText(d, ekene(d), /φe 0\.201/, 'Ekene-9 Bcp 1.9');
        await d.highlight(ekene(d)); await d.callout('c', ekene(d), 'Ekene-9, Bcp 1.9: φ 0.201 (truth 0.198)', 'left');
      } },
    { id: 'gas', chapter: 'Gas, again', chapterSub: 'The Oboro Sand',
      say: 'One caution. The Oboro Sand still reads twenty five point seven, against a true nineteen and a half. Gas slows sound as well, so the sonic overreads in gas even after calibration. A factor tuned in an oil or water sand belongs in oil and water sands.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await expectText(d, oboro(d), /φe 0\.257/, 'Ekene-9 Oboro Bcp 1.9');
        await d.highlight(oboro(d)); await d.callout('g', oboro(d), 'Gas sand: φ 0.257 (truth 0.195)', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module C. Density porosity needs the right matrix and fluid. Effective porosity takes out the clay-bound water, and that choice moves net pay. And sonic porosity overreads in young, shaly sands: calibrate it on a well that has a density log, and keep gas zones apart. In Module D we turn to water saturation, starting with Archie\'s equation.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Module C', title: 'Porosity',
        body: '<ul><li>Density: choose the matrix and fluid you really have</li><li>Effective porosity: φ<sub>sh</sub> from core, and it moves net pay</li><li>Sonic on Ekene-9: Wyllie <b>0.383</b>, RHG <b>0.316</b>, calibrated Bcp 1.9 <b>0.201</b> (truth 0.198)</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module D: water saturation</p>' }); } },
  ],
};
