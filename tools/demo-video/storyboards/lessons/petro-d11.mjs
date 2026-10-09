// Lesson D11: Archie's equation, a, m and n (Ekene-1, kit v2, feet).
// Dry run 2026-10-08: linear Vsh 18/125, density, matrix 2.67, phi_sh 0.075
// (Module C), default cutoffs. Ekene Sand net pay, Archie a 1 m 2 n 2:
// Rw 0.05 (default) 27.0 ft; Rw 0.0786 (the field's water at formation
// temperature) 12.5 ft; m 1.8 24.0; m 2.2 6.5; n 1.8 14.5; n 2.2 11.5;
// a 0.62 m 2.15 (Humble) 19.0. Truth (earth model, same cutoffs) 27.5 ft.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');
export const MODULE_D_BASE = { grClean: 18, grClay: 125, vshMethod: 'linear', rhoMa: 2.67, phiShale: 0.075 };
const setArchie = async (d, p) => {
  for (const [k, v] of Object.entries(p)) await d.type(`petro-param-${k}`, String(v));
  await d.click('petro-params-apply');
};

export default {
  id: 'lesson-d11',
  ...lessonMeta(11, 'D', "Archie's equation explained: *a, m and n*", 'Where water saturation comes from, what the cementation and saturation exponents mean, how far each one moves net pay, and where Archie breaks down'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_D_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 11', chapterSub: 'Module D · Water saturation',
      say: 'Welcome to Module D, on water saturation: how much of the pore space holds water, and so how much holds oil or gas. Nearly every saturation model starts from one equation, published by Gus Archie in 1942. In this lesson: what it says, what its three constants mean, and how far each one moves net pay.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 11', title: "Archie's equation",
        body: '<ul><li>Two laboratory laws</li><li>a, m and n</li><li>How much each one matters</li><li>Where it breaks down</li></ul>' }) },
    { id: 'laws', chapter: 'Two laboratory laws',
      say: 'Archie measured clean sandstones in the laboratory and found two laws. First, a rock full of brine conducts in proportion to its porosity raised to a power: the formation factor. Second, as oil replaces water, resistivity climbs as water saturation falls, again by a power. Put together, they give water saturation from four things: the true resistivity from the log, porosity, the water resistivity, and the constants.',
      do: async (d) => d.slide({ eyebrow: 'Two laboratory laws', title: 'Formation factor and resistivity index',
        body: '<ul><li>F = R<sub>o</sub> / R<sub>w</sub> = a / φ<sup>m</sup></li><li>I = R<sub>t</sub> / R<sub>o</sub> = S<sub>w</sub><sup>−n</sup></li></ul>', formula: 'S<sub>w</sub> = ( a R<sub>w</sub> / (φ<sup>m</sup> R<sub>t</sub>) )<sup>1/n</sup>' }) },
    { id: 'constants', chapter: 'a, m and n',
      say: 'The constants carry the rock. m, the cementation exponent, describes how tortuous the pore network is: about two for ordinary sandstone, lower for loose sand, higher for cemented or vuggy rock. n, the saturation exponent, describes how the brine stays connected as oil comes in: about two for water-wet rock. And a, the tortuosity factor, is a fitting constant, often one. The Humble form, a of zero point six two with m of two point one five, is a common alternative for sands.',
      do: async (d) => d.slide({ eyebrow: 'a, m and n', title: 'The constants carry the rock',
        body: '<ul><li><b>m</b>, cementation: about 2 for sandstone (1.8 loose, 2.2 cemented)</li><li><b>n</b>, saturation: about 2 when water-wet</li><li><b>a</b>, tortuosity: often 1; Humble a 0.62 with m 2.15</li></ul>' }) },
    { id: 'rw', chapter: 'On the Ekene Sand', chapterSub: 'Water resistivity first',
      say: 'On Ekene-1, with the porosity from Module C and Archie at one, two and two, the Ekene Sand shows twenty seven feet of net pay. But that uses the studio\'s placeholder water resistivity, zero point zero five. The Ekene formation water reads zero point zero seven eight six ohm metres at formation temperature, and the next two lessons show where that number comes from. Put it in, and net pay falls to twelve and a half feet.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /net pay 27\.0 ft/, 'Rw 0.05 pay');
        await d.highlight(ekene(d)); await d.callout('a', ekene(d), 'Rw 0.05 (placeholder): 27.0 ft', 'left');
        await d.sleep(4500); await d.clearCallouts();
        await setArchie(d, { rw: 0.0786 });
        await expectText(d, ekene(d), /net pay 12\.5 ft/, 'Rw 0.0786 pay');
        await d.callout('b', ekene(d), 'Rw 0.0786: 12.5 ft', 'left');
      } },
    { id: 'm', chapter: 'How much m matters',
      say: 'Now move m. At one point eight, net pay is twenty four feet. At two point two, six and a half. A change of one tenth either side of two moves net pay by a factor of almost four. Measure m on core whenever you can.',
      do: async (d) => {
        await d.clearCallouts();
        await setArchie(d, { m: 1.8 });
        await expectText(d, ekene(d), /net pay 24\.0 ft/, 'm 1.8 pay');
        await d.callout('m1', ekene(d), 'm 1.8: 24.0 ft', 'left'); await d.sleep(3500); await d.clearCallouts();
        await setArchie(d, { m: 2.2 });
        await expectText(d, ekene(d), /net pay 6\.5 ft/, 'm 2.2 pay');
        await d.callout('m2', ekene(d), 'm 2.2: 6.5 ft', 'left');
      } },
    { id: 'n', chapter: 'And n',
      say: 'Back to m of two, and move n instead. One point eight gives fourteen and a half feet, two point two gives eleven and a half. n matters less here, but more in oil-wet rock, where it can rise well above two.',
      do: async (d) => {
        await d.clearCallouts();
        await setArchie(d, { m: 2, n: 1.8 });
        await expectText(d, ekene(d), /net pay 14\.5 ft/, 'n 1.8 pay');
        await d.callout('n1', ekene(d), 'n 1.8: 14.5 ft', 'left'); await d.sleep(3500); await d.clearCallouts();
        await setArchie(d, { n: 2.2 });
        await expectText(d, ekene(d), /net pay 11\.5 ft/, 'n 2.2 pay');
        await d.callout('n2', ekene(d), 'n 2.2: 11.5 ft', 'left');
      } },
    { id: 'humble',
      say: 'And the Humble constants, a of zero point six two with m of two point one five, give nineteen feet. Same rock, same logs, four sets of reasonable constants, and net pay anywhere from six and a half to twenty four feet.',
      do: async (d) => {
        await d.clearCallouts();
        await setArchie(d, { n: 2, a: 0.62, m: 2.15 });
        await expectText(d, ekene(d), /net pay 19\.0 ft/, 'Humble pay');
        await d.callout('h', ekene(d), 'Humble a 0.62, m 2.15: 19.0 ft', 'left');
      } },
    { id: 'fails', chapter: 'Where Archie breaks down',
      say: 'There is a bigger problem. The earth model behind Ekene was built with m and n of exactly two, and its true net pay at these cutoffs is twenty seven and a half feet. Archie, with the right constants and the right water, finds twelve and a half. Archie assumes the only conductor is the brine. In a shaly sand the clay conducts too, so the rock reads less resistive than its fluids alone would make it, and Archie mistakes that for water. Lesson 14 fixes it.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await setArchie(d, { a: 1, m: 2 });
        await expectText(d, ekene(d), /net pay 12\.5 ft/, 'back to 1,2,2');
        await d.slide({ eyebrow: 'Where Archie breaks down', title: 'Clay conducts too',
          body: '<ul><li>Right constants (1, 2, 2), right Rw: <b>12.5</b> ft</li><li>Truth at the same cutoffs: <b>27.5</b> ft</li><li>Archie reads the clay\'s conductivity as water</li></ul>' });
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Archie\'s equation gives water saturation from true resistivity, porosity and water resistivity, through the constants a, m and n. m is the most sensitive, so measure it on core. And Archie belongs in clean sands. Next, the Pickett plot: reading water resistivity and m straight from the logs.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 11', title: "Archie's equation",
        body: '<ul><li>S<sub>w</sub> from R<sub>t</sub>, φ and R<sub>w</sub>, through a, m and n</li><li>Ekene Sand pay: m 1.8 <b>24.0</b>, m 2 <b>12.5</b>, m 2.2 <b>6.5</b> ft</li><li>Shaly sand: Archie <b>12.5</b> ft against a true <b>27.5</b></li></ul><p style="margin-top:28px;color:#d4ac3a">Next: the Pickett plot</p>' }) },
  ],
};
