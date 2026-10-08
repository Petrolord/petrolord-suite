// Lesson C9: Total and effective porosity, and the shale correction
// (Ekene-1, kit v2, feet). Dry run 2026-10-08, linear Vsh 18/125, density,
// matrix 2.67 (Lesson 8). Cutoffs open: Ekene Sand phi_t 0.200 (truth
// 0.198); phi_sh 0.075 phi_e 0.185 (truth 0.183; the earth model takes
// 0.075 per unit Vsh as clay-bound). Default cutoffs (phi 0.08, Vsh 0.5,
// Sw 0.6), Ekene Sand net pay: phi_sh 0 33.0 ft; 0.06 27.5; 0.075 27.0;
// 0.12 24.5.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, OPEN_CUTOFFS } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-c9',
  ...lessonMeta(9, 'C', 'Total and effective porosity: *the shale correction*', 'What clay-bound water does to porosity, how the shale correction works, and how much it moves net pay'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { grClean: 18, grClay: 125, vshMethod: 'linear', rhoMa: 2.67, phiShale: 0, ...OPEN_CUTOFFS });
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 9', chapterSub: 'Module C · Porosity',
      say: 'Two petrophysicists can quote different porosities for the same sand and both be right, because one means total porosity and the other effective. In this lesson: what the difference is, how the shale correction turns one into the other, and how much it moves net pay.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 9', title: 'Total and effective porosity',
        body: '<ul><li>Where clay-bound water sits</li><li>The shale correction</li><li>Where its value comes from</li><li>What it does to net pay</li></ul>' }) },
    { id: 'concept', chapter: 'Two porosities', chapterSub: 'Clay-bound water',
      say: 'Clay minerals hold a film of water on their surfaces. That water is part of the pore space, so the density tool counts it, but it never moves, and no oil or gas can take its place. Total porosity includes it. Effective porosity leaves it out: the space that can actually hold hydrocarbons.',
      do: async (d) => d.slide({ eyebrow: 'Two porosities', title: 'Clay-bound water counts, but never moves',
        body: '<ul><li><b>Total porosity</b>: all the pore space, clay-bound water included</li><li><b>Effective porosity</b>: the space hydrocarbons can fill</li><li>The difference grows with the clay</li></ul>' }) },
    { id: 'formula', chapter: 'The shale correction',
      say: 'The studio uses the standard correction: effective porosity is total porosity minus the shale volume times phi shale. Phi shale is the porosity that clay-bound water adds per unit of shale, as the porosity tool sees it. In a clean sand the correction vanishes. In a shaly one it matters.',
      do: async (d) => d.slide({ eyebrow: 'The shale correction', title: 'Subtract the clay-bound water',
        body: '<ul><li>φ<sub>sh</sub>: what the clay-bound water adds per unit of shale</li><li>Clean sand: no correction</li></ul>', formula: 'φ<sub>e</sub> = φ<sub>t</sub> − V<sub>sh</sub> × φ<sub>sh</sub>' }) },
    { id: 'total', chapter: 'On the Ekene Sand', chapterSub: 'Total porosity first',
      say: 'On Ekene-1, with the matrix from Lesson 8, open cutoffs and the correction at zero, the Ekene Sand shows its total porosity: twenty percent. The earth model says nineteen point eight.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /φe 0\.200/, 'total Ekene phi');
        await d.highlight(ekene(d)); await d.callout('t', ekene(d), 'Total: φ 0.200 (truth 0.198)', 'left');
      } },
    { id: 'where', chapter: 'Where phi shale comes from',
      say: 'Where does phi shale come from? On a real well, from core. Cation exchange capacity, or nuclear magnetic resonance, measures the clay-bound water directly, or you tune phi shale until log porosity matches core effective porosity. The studio starts at six percent, a common value for the density tool. The Ekene earth model was built with seven and a half.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Where φsh comes from', title: 'Calibrate it on core',
        body: '<ul><li>Cation exchange capacity or NMR on core</li><li>Or tune it until log φ<sub>e</sub> matches core</li><li>Studio default 0.06; Ekene earth model <b>0.075</b></li></ul>' }); } },
    { id: 'effective', chapter: 'Effective porosity',
      say: 'Set phi shale to zero point zero seven five. The Ekene Sand now reads eighteen and a half percent effective porosity. The earth model says eighteen point three. A fifth clay took one and a half units of porosity away.',
      do: async (d) => {
        await d.hideSlide();
        await d.type('petro-param-phiShale', '0.075'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.185/, 'effective Ekene phi');
        await d.highlight(ekene(d)); await d.callout('e', ekene(d), 'Effective: φe 0.185 (truth 0.183)', 'left');
      } },
    { id: 'pay', chapter: 'What it does to net pay', chapterSub: 'Cutoffs back on',
      say: 'Now put the usual cutoffs back: porosity eight percent, shale volume one half, water saturation sixty percent. With the correction at seven and a half percent, the Ekene Sand has twenty seven feet of net pay.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.type('petro-param-cutPhi', '0.08'); await d.type('petro-param-cutVsh', '0.5'); await d.type('petro-param-cutSw', '0.6');
        await d.click('petro-params-apply');
        await expectText(d, ekene(d), /net pay 27\.0 ft/, 'pay at 0.075');
        await d.highlight(ekene(d)); await d.callout('p', ekene(d), 'φsh 0.075: net pay 27.0 ft', 'left');
      } },
    { id: 'none',
      say: 'Treat all the porosity as effective, with phi shale at zero, and net pay grows to thirty three feet.',
      do: async (d) => {
        await d.clearCallouts();
        await d.type('petro-param-phiShale', '0'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /net pay 33\.0 ft/, 'pay at 0');
        await d.callout('p0', ekene(d), 'φsh 0: net pay 33.0 ft', 'left');
      } },
    { id: 'heavy',
      say: 'Over-correct, at twelve percent, and it drops to twenty four and a half. One parameter, chosen three ways, moves net pay by a quarter. That is why phi shale belongs in your uncertainty analysis, which Module F covers.',
      do: async (d) => {
        await d.clearCallouts();
        await d.type('petro-param-phiShale', '0.12'); await d.click('petro-params-apply');
        await expectText(d, ekene(d), /net pay 24\.5 ft/, 'pay at 0.12');
        await d.callout('p12', ekene(d), 'φsh 0.12: net pay 24.5 ft', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Total porosity includes the water bound to clay; effective porosity leaves it out. The shale correction subtracts shale volume times phi shale, and phi shale should come from core. In the Ekene Sand it moved porosity by one and a half units and net pay from thirty three to twenty four and a half feet. The neutron sees bound water even more strongly, so neutron-based porosity needs a larger correction. Next, sonic porosity, for wells with no density log.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Lesson 9', title: 'Total and effective',
        body: '<ul><li>φ<sub>e</sub> = φ<sub>t</sub> − V<sub>sh</sub> φ<sub>sh</sub>, φ<sub>sh</sub> from core</li><li>Ekene Sand: total <b>0.200</b>, effective <b>0.185</b> (truth 0.198 and 0.183)</li><li>Net pay: <b>33.0</b>, <b>27.0</b>, <b>24.5</b> ft for φ<sub>sh</sub> 0, 0.075, 0.12</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: sonic porosity</p>' }); } },
  ],
};
