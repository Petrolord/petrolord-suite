// Lesson D12: The Pickett plot, Rw and m from the water leg (Ekene-1, kit
// v2, feet). Dry run 2026-10-08: Module D base (linear 18/125, matrix 2.67,
// phi_sh 0.075), Archie 1/2/2, Rw 0.0786. Pickett over the water leg
// 5118.5-5183.5 ft, clean if Vsh <= 0.10: m 1.680, a.Rw 0.1282, 69 points,
// 61 shaly left out (truth m 2, Rw 0.0786). Applied, Ekene Sand net pay
// 13.5 ft (true constants 12.5 ft, Lesson 11).
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams } from './common.mjs';
import { MODULE_D_BASE } from './petro-d11.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-d12',
  ...lessonMeta(12, 'D', 'The Pickett plot: *finding Rw and m from the well*', 'How the Pickett plot reads water resistivity and the cementation exponent from a water leg, why the fit can mislead, and what to do about it'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { ...MODULE_D_BASE, rw: 0.0786 });
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 12', chapterSub: 'Module D · Water saturation',
      say: 'Archie needs water resistivity and m. Where there is no water sample and no core, the Pickett plot reads both from the logs themselves. It is one of the most useful plots in petrophysics, and one of the easiest to over-trust. In this lesson we build one on the Ekene water leg and check it against the field.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 12', title: 'The Pickett plot',
        body: '<ul><li>Why water-bearing rock plots on a line</li><li>Fitting it on the Ekene water leg</li><li>Checking against the field</li><li>When the fit misleads</li></ul>' }) },
    { id: 'theory', chapter: 'Why a straight line',
      say: 'In rock full of water, Archie\'s equation reduces to resistivity equals a times R w over porosity to the power m. Take logarithms and that is a straight line on log-log axes: its slope is minus m, and where it reaches one hundred percent porosity it reads a times R w. Rock holding oil or gas sits at higher resistivity, and lines of constant water saturation run parallel to the water line.',
      do: async (d) => d.slide({ eyebrow: 'Why a straight line', title: 'Water-bearing rock lines up',
        body: '<ul><li>Slope: <b>−m</b></li><li>At 100% porosity: <b>a R<sub>w</sub></b></li><li>Hydrocarbons plot at higher resistivity</li></ul>', formula: 'log R<sub>t</sub> = log(a R<sub>w</sub>) − m log φ  (S<sub>w</sub> = 1)' }) },
    { id: 'open', chapter: 'On the Ekene water leg', chapterSub: 'Below the contact',
      say: 'In the studio, open Crossplots, then Pickett. The points are coloured by shale volume. Fit only the water leg: below the oil-water contact at five thousand one hundred and eighteen feet, down to the base of the sand. And keep only clean samples, shale volume up to one tenth, because shaly samples conduct through the clay and drag the line.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-view-crossplot'); await d.click('petro-plot-pickett');
        await d.type('petro-pickett-top', '5118.5'); await d.type('petro-pickett-base', '5183.5'); await d.type('petro-pickett-clean-vsh', '0.10');
      } },
    { id: 'fit', chapter: 'The fit',
      say: 'Fit. Sixty nine clean points, sixty one shaly ones left out. The line gives m of one point six eight, and a times R w of zero point one two eight.',
      do: async (d) => {
        await d.click('petro-pickett-fit');
        await expectText(d, 'petro-pickett-result', /m = 1\.680 · a·Rw = 0\.1282 · 69 pts · 61 shaly left out/, 'Pickett fit');
        await d.highlight('petro-pickett-result');
      } },
    { id: 'truth', chapter: 'Checking against the field',
      say: 'The earth model behind Ekene was built with m of two and an R w of zero point zero seven eight six. So the fit has m too low, and a times R w too high to make up for it. Why? Every log has scatter. When the porosity on the horizontal axis carries noise, a least squares line comes out flatter than the truth. Statisticians call it regression dilution. And the water leg spans only a narrow range of porosity, so the slope has little to hold on to.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Checking against the field', title: 'A flattened line',
        body: '<table style="font-size:30px;border-collapse:separate;border-spacing:0 12px"><colgroup><col style="width:340px"><col style="width:260px"><col></colgroup><tr><td></td><td><b>Fit</b></td><td><b>Truth</b></td></tr><tr><td>m</td><td>1.68</td><td>2</td></tr><tr><td>a R<sub>w</sub></td><td>0.128</td><td>0.0786</td></tr></table><ul><li>Noise in porosity flattens a least-squares line</li><li>A narrow porosity range gives little leverage</li></ul>' }); } },
    { id: 'apply', chapter: 'Does it matter?',
      say: 'Does it matter? Apply the fit and look at the Ekene Sand. Thirteen and a half feet of net pay, against twelve and a half with the true constants in Lesson 11. Inside the porosity range the line was fitted on, the two errors cancel. Take those constants to tighter or more porous rock, another zone or another well, and they stop cancelling.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-pickett-apply'); await d.sleep(800);
        await d.click('petro-view-tracks');
        await expectText(d, ekene(d), /net pay 13\.5 ft/, 'Pickett applied pay');
        await d.highlight(ekene(d)); await d.callout('p', ekene(d), 'Pickett constants: 13.5 ft (true constants 12.5)', 'left');
      } },
    { id: 'practice', chapter: 'Good practice',
      say: 'So treat a free Pickett fit with care. Fix m from core or from the region, about two for these sands, and fit water resistivity alone: that is the Hingle plot, in the next lesson. Use as many clean water-bearing points as you can, over as wide a porosity range as you can. And check the answer against a water sample or the S P.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Good practice', title: 'Use the Pickett plot with care',
        body: '<ul><li>Fix m from core or the region; fit R<sub>w</sub> alone</li><li>Many clean water-bearing points, wide porosity range</li><li>Cross-check with a water sample or the SP</li></ul>' }); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. On a Pickett plot, water-bearing rock falls on a line whose slope is minus m and whose intercept is a times R w. Fit it on clean samples from a water leg. On Ekene the free fit gave m of one point six eight against a true two, because scatter flattens the line. Next: the Hingle plot, the S P and water salinity, three more routes to R w.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 12', title: 'The Pickett plot',
        body: '<ul><li>Water line: slope −m, intercept a R<sub>w</sub></li><li>Clean samples from a water leg</li><li>Ekene: m <b>1.68</b>, a R<sub>w</sub> <b>0.128</b> against 2 and 0.0786</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: Hingle, SP and salinity</p>' }) },
  ],
};
