// Lesson C8: Porosity from the density log (Ekene-1, kit v2, feet).
// Dry run 2026-10-08, linear Vsh 18/125, cutoffs open (the card then
// averages every sample, like the earth model's truth), shale correction 0
// (total porosity): Ekene Sand phi_t density rho_ma 2.65 rho_fl 1.0 0.190;
// rho_fl 1.03 0.194; rho_ma 2.67 0.200; truth 0.198 (matrix in the earth
// model 2.65 + 0.08 Vsh, Vsh 0.203).
import { lessonMeta, login, openPetroWell, ensureZonesOn, zoomTracksAt, expectText, ZONE_CARD, baseParams, OPEN_CUTOFFS } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-c8',
  ...lessonMeta(8, 'C', 'Porosity from the density log: *matrix and fluid density*', 'What the density tool measures, how bulk density becomes porosity, and how much a wrong matrix or fluid density costs'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { grClean: 18, grClay: 125, vshMethod: 'linear', phiShale: 0, ...OPEN_CUTOFFS });
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 8', chapterSub: 'Module C · Porosity',
      say: 'Welcome to Module C, on porosity. Every reserve number rests on it, and the density log is where most petrophysicists start. In this lesson: what the density tool measures, how its reading becomes porosity, and how much it costs to pick the wrong matrix or fluid density.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 8', title: 'Porosity from the density log',
        body: '<ul><li>What the tool measures</li><li>From bulk density to porosity</li><li>Matrix and fluid density</li><li>What a wrong choice costs</li></ul>' }) },
    { id: 'measures', chapter: 'What the tool measures', chapterSub: 'Bulk density',
      say: 'The density tool sends gamma rays into the formation and counts how many scatter back. That depends on the electron density of the rock, which tracks its bulk density: the grains and the fluid in the pores, together. A porous rock is lighter, because fluid weighs less than grains.',
      do: async (d) => d.slide({ eyebrow: 'What the tool measures', title: 'Grains and fluid, weighed together',
        body: '<ul><li>Gamma rays in, scattered gamma rays counted</li><li>The count follows <b>electron density</b>, which tracks <b>bulk density</b></li><li>More porosity, lighter rock</li></ul>', formula: 'ρ<sub>b</sub> = ρ<sub>ma</sub> (1 − φ) + ρ<sub>fl</sub> φ' }) },
    { id: 'equation', chapter: 'From density to porosity',
      say: 'Turn that mixing law around and you have density porosity: the matrix density minus the log reading, over the matrix density minus the fluid density. Two of the numbers come from you: the matrix density, which depends on the minerals, and the fluid density, which depends on what fills the pores near the borehole.',
      do: async (d) => d.slide({ eyebrow: 'From density to porosity', title: 'Two numbers come from you',
        body: '<ul><li><b>ρ<sub>ma</sub></b>: quartz 2.65, calcite 2.71, dolomite 2.87 g/cc</li><li><b>ρ<sub>fl</sub></b>: fresh filtrate 1.0, salty 1.1, flushed gas about 0.6 g/cc</li></ul>', formula: 'φ<sub>D</sub> = (ρ<sub>ma</sub> − ρ<sub>b</sub>) / (ρ<sub>ma</sub> − ρ<sub>fl</sub>)' }) },
    { id: 'tracks', chapter: 'On Ekene-1', chapterSub: 'The Ekene Sand',
      say: 'On Ekene-1, zoom onto the Ekene Sand, at about five thousand one hundred feet. Where the bulk density on the density neutron track swings lighter, the porosity track beside it swings higher. One is the mirror of the other.',
      do: async (d, shared) => {
        await d.hideSlide();
        shared.values.g = await zoomTracksAt(d, 5130, 12);
        const { yAt, b } = shared.values.g;
        await d.moveTo({ x: b.x + b.width * 0.36, y: yAt(5100) }, { ms: 900 });
        await d.sleep(1200);
        await d.moveTo({ x: b.x + b.width * 0.47, y: yAt(5100) }, { ms: 900 });
      } },
    { id: 'check', chapter: 'Checking against the field',
      say: 'To check against the field, the cutoffs are open, so the zone card averages every foot of the sand, and the shale correction is zero, so it shows total porosity. With quartz at two point six five and water at one, the Ekene Sand averages nineteen percent. The earth model behind the field says nineteen point eight. Close, but low.',
      do: async (d) => {
        await expectText(d, ekene(d), /φe 0\.190/, 'quartz matrix Ekene phi');
        await d.highlight(ekene(d)); await d.callout('q', ekene(d), 'Quartz 2.65, water 1.0: φ 0.190 (truth 0.198)', 'left');
      } },
    { id: 'matrix', chapter: 'The matrix', chapterSub: 'Shaly sand is heavier than quartz',
      say: 'Why low? The Ekene Sand is a fifth clay, and clay minerals are heavier than quartz. Mixed in, they lift the matrix density to about two point six seven. Set that, and the sand reads twenty percent, against the true nineteen point eight. Two hundredths of a gram moved porosity by one unit.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.type('petro-param-rhoMa', '2.67'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.200/, 'shaly matrix Ekene phi');
        await d.highlight(ekene(d)); await d.callout('m', ekene(d), 'Matrix 2.67: φ 0.200 (truth 0.198)', 'left');
      } },
    { id: 'cost', chapter: 'What a wrong choice costs',
      say: 'Here is the rule of thumb. At twenty percent porosity, every hundredth of a gram per cubic centimetre in the matrix density moves porosity by about half a unit. The fluid density matters less in oil and water: salty filtrate taken as fresh costs about one unit. In gas it matters a lot, as Lesson 7 showed. And none of it holds in a washed-out hole, where the tool reads mud. Lesson 3 covered that.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'What a wrong choice costs', title: 'At 20% porosity',
        body: '<table style="font-size:30px;border-collapse:separate;border-spacing:0 12px"><colgroup><col style="width:560px"><col></colgroup><tr><td>Matrix +0.01 g/cc</td><td><b>+0.5</b> porosity units</td></tr><tr><td>Fluid 1.1 g/cc read as 1.0</td><td><b>−1.2</b> units</td></tr><tr><td>Gas zone, fluid 0.6 read as 1.0</td><td><b>+4.5</b> units</td></tr><tr><td>Washed-out hole</td><td>meaningless</td></tr></table>' }); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. The density tool weighs grains and fluid together. Porosity follows from two choices, matrix and fluid density, so choose them from the minerals and the fluids you actually have. A shaly sand is heavier than quartz. Check the hole is in gauge. Next, total and effective porosity: what the clay does to the pore space, and why it moves net pay.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 8', title: 'Density porosity',
        body: '<ul><li>Bulk density weighs grains and fluid together</li><li>Choose ρ<sub>ma</sub> and ρ<sub>fl</sub> from what is really there</li><li>Ekene Sand: quartz <b>0.190</b>, shaly matrix 2.67 <b>0.200</b> (truth 0.198)</li><li>Only in gauge hole</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: total and effective porosity</p>' }) },
  ],
};
