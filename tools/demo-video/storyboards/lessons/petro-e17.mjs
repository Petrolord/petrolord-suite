// Lesson E17: Cutoffs and net pay (Ekene-1, kit v2.1, feet). Dry run
// 2026-10-08, Module E base: Ekene Sand gross 105.0, net reservoir 99.5, net
// pay 27.5 ft, HCPV 2.776 ft (truth 98.0 and 27.5). Sensitivity table swings:
// porosity 0 %, Vsh 4 %, Sw 31 %. Sw 0.5 15.5 ft, 0.7 33.5 ft; Vsh 0.3
// 19.5 ft; phi 0.15 27.0 ft. Core transform (Lesson 16): phi 0.08 = 17 mD,
// 10 mD = phi 0.056.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, MODULE_E_BASE } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');
const cut = async (d, p) => { for (const [k, v] of Object.entries(p)) await d.type(`petro-param-${k}`, String(v)); await d.click('petro-params-apply'); };

export default {
  id: 'lesson-e17',
  ...lessonMeta(17, 'E', 'Cutoffs and net pay: *which cutoff really matters*', 'Gross, net reservoir and net pay, where cutoffs come from, and a sensitivity check that shows which one controls the answer'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 17', chapterSub: 'Module E · Permeability, net pay and calibration',
      say: 'Net pay is the number most interpretations end with, and it rests on three cutoffs. In this lesson: what gross, net reservoir and net pay mean, where cutoffs should come from, and a quick test that shows which cutoff really controls the answer.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 17', title: 'Cutoffs and net pay',
        body: '<ul><li>Gross, net reservoir, net pay</li><li>Where cutoffs come from</li><li>Cutoff sensitivity</li><li>Which one matters on Ekene</li></ul>' }) },
    { id: 'terms', chapter: 'Three thicknesses',
      say: 'Gross is the whole zone. Net reservoir is the part with enough porosity and little enough shale to be rock that can flow. Net pay is the part of net reservoir that also holds hydrocarbon: water saturation below its cutoff. And the hydrocarbon pore thickness sums porosity times hydrocarbon saturation over the pay, the number that goes into volumes.',
      do: async (d) => d.slide({ eyebrow: 'Three thicknesses', title: 'Gross, net, pay',
        body: '<ul><li><b>Net reservoir</b>: φ<sub>e</sub> and V<sub>sh</sub> pass</li><li><b>Net pay</b>: S<sub>w</sub> passes as well</li><li><b>HCPV</b>: Σ h φ (1 − S<sub>w</sub>) over the pay</li></ul>' }) },
    { id: 'card', chapter: 'On the Ekene Sand',
      say: 'On Ekene-1, with porosity at least eight percent, shale volume at most one half and water saturation at most sixty percent, the Ekene Sand has one hundred and five feet gross, ninety nine and a half net reservoir, and twenty seven and a half feet of net pay. The earth model, with the same cutoffs on its true curves, says ninety eight and twenty seven and a half.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /net pay 27\.5 ft\s*gross 105\.0 ft\s*NTG 0\.262\s*net res 99\.5 ft/, 'base card');
        await d.highlight(ekene(d)); await d.callout('b', ekene(d), 'Net res 99.5 ft, net pay 27.5 ft (truth 98.0 and 27.5)', 'left');
      } },
    { id: 'where', chapter: 'Where cutoffs come from',
      say: 'Cutoffs should come from how the rock flows. A porosity cutoff usually comes from a permeability cutoff through the core transform. With the transform from Lesson 16, eight percent porosity corresponds to about seventeen millidarcies, and ten millidarcies to under six percent. A shale cutoff comes from where the sand and shale populations separate, and a saturation cutoff from where the rock starts flowing water: relative permeability, or tests.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Where cutoffs come from', title: 'Take them from flow',
        body: '<ul><li>φ cutoff from a k cutoff, through the core transform</li><li>Ekene Sand: φ 0.08 ≈ 17 mD; 10 mD ≈ φ 0.056</li><li>V<sub>sh</sub>: where sand and shale separate</li><li>S<sub>w</sub>: where water starts to flow</li></ul>' }); } },
    { id: 'sens', chapter: 'Cutoff sensitivity',
      say: 'Which cutoff matters? Open Cutoff sensitivity and pick the Ekene Sand. Each cutoff moves while the other two stay put. Porosity: from six to ten percent, net pay does not change at all. Shale volume: four percent. Water saturation: thirty one percent. On this sand, the water saturation cutoff is the decision.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-sensitivity-open'); await d.waitFor('petro-sensitivity-dialog'); await d.sleep(600);
        const z = d.page.getByTestId('petro-sensitivity-zone');
        if (await z.count()) await d.select(z, await z.locator('option', { hasText: 'Ekene Sand' }).first().getAttribute('value'));
        await expectText(d, 'petro-sensitivity-table', /Sw cutoff[\s\S]*31 %/, 'Sw swing');
        await d.highlight('petro-sensitivity-table');
      } },
    { id: 'sw', chapter: 'Moving the saturation cutoff',
      say: 'See it on the card. Water saturation at most one half: fifteen and a half feet of pay. At seventy percent: thirty three and a half. Shale volume tightened to three tenths gives nineteen and a half. Porosity at fifteen percent still leaves twenty seven.',
      do: async (d) => {
        await d.unhighlight(); await d.page.keyboard.press('Escape');
        await cut(d, { cutSw: 0.5 });
        await expectText(d, ekene(d), /net pay 15\.5 ft/, 'Sw 0.5');
        await d.highlight(ekene(d)); await d.callout('s5', ekene(d), 'Sw ≤ 0.5: 15.5 ft', 'left'); await d.sleep(3000); await d.clearCallouts();
        await cut(d, { cutSw: 0.7 });
        await expectText(d, ekene(d), /net pay 33\.5 ft/, 'Sw 0.7');
        await d.callout('s7', ekene(d), 'Sw ≤ 0.7: 33.5 ft', 'left'); await d.sleep(3000); await d.clearCallouts();
        await cut(d, { cutSw: 0.6, cutVsh: 0.3 });
        await expectText(d, ekene(d), /net pay 19\.5 ft/, 'Vsh 0.3');
        await d.callout('v3', ekene(d), 'Vsh ≤ 0.3: 19.5 ft', 'left'); await d.sleep(3000); await d.clearCallouts();
        await cut(d, { cutVsh: 0.5, cutPhi: 0.15 });
        await expectText(d, ekene(d), /net pay 27\.0 ft/, 'phi 0.15');
        await d.callout('p15', ekene(d), 'φ ≥ 0.15: 27.0 ft', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Net reservoir passes porosity and shale; net pay passes saturation too. Take cutoffs from flow, through core and tests. And always run the sensitivity: on the Ekene Sand the saturation cutoff swings net pay by almost a third, while porosity barely matters. Next, the last lesson of Module E: saturation height from capillary pressure.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Lesson 17', title: 'Cutoffs and net pay',
        body: '<ul><li>Net reservoir: φ and V<sub>sh</sub>; net pay: S<sub>w</sub> too</li><li>Cutoffs from flow: core and tests</li><li>Ekene Sand swings: φ 0 %, V<sub>sh</sub> 4 %, S<sub>w</sub> 31 %</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: saturation height</p>' }); } },
  ],
};
