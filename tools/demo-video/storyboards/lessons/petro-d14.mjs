// Lesson D14: Shaly-sand water saturation (Ekene-1, kit v2, feet). Dry run
// 2026-10-08, Module D base, Rw 0.0786, a 1 m 2 n 2. Ekene Sand net pay:
// Archie 12.5 ft; Simandoux Rsh 3.2 22.0; Indonesia Rsh 3.2 27.5; modified
// Simandoux Rsh 3.2 29.5; Indonesia Rsh 2.2 31.0. Truth 27.5 ft (the earth
// model adds a parallel clay conductance Vsh / 3.2 ohm.m). Thick shales by
// the sand read 2.1 to 2.3 ohm.m (three quarters clay).
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams } from './common.mjs';
import { MODULE_D_BASE } from './petro-d11.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');
const model = async (d, sw, rsh) => {
  await d.select('petro-param-swMethod', sw);
  if (rsh != null) await d.type('petro-param-rsh', String(rsh));
  await d.click('petro-params-apply');
};

export default {
  id: 'lesson-d14',
  ...lessonMeta(14, 'D', 'Shaly-sand saturation: *Simandoux, Indonesia and beyond*', 'Why Archie undercounts pay in shaly sand, how the shaly-sand models add the clay\'s conductivity, and which one matches the Ekene field'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { ...MODULE_D_BASE, rw: 0.0786 });
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 14', chapterSub: 'Module D · Water saturation',
      say: 'In Lesson 11, Archie with the right constants and the right water found twelve and a half feet of net pay in the Ekene Sand. The truth is twenty seven and a half. In this lesson: why, and the shaly-sand models that close the gap.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 14', title: 'Shaly-sand saturation',
        body: '<ul><li>Why clay fools Archie</li><li>The shaly-sand models</li><li>The shale resistivity</li><li>Which model fits Ekene</li></ul>' }) },
    { id: 'why', chapter: 'Why clay fools Archie',
      say: 'Clay surfaces carry a negative charge, held in balance by a cloud of positive ions in the water around them. Those ions carry current, in parallel with the brine in the pores. So a shaly sand conducts better than its fluids alone would allow. Archie credits all of that conductivity to water, and reports too much water and too little oil.',
      do: async (d) => d.slide({ eyebrow: 'Why clay fools Archie', title: 'A second conductor',
        body: '<ul><li>Charged clay surfaces hold mobile ions</li><li>They conduct in parallel with the brine</li><li>Archie reads it all as water: S<sub>w</sub> too high</li></ul>', formula: '1/R<sub>t</sub> = (brine term) + (clay term)' }) },
    { id: 'models', chapter: 'The models',
      say: 'The shaly-sand models add a clay term. Simandoux, from 1963, adds the shale volume over the shale resistivity, scaled by saturation. The Indonesia equation, by Poupon and Leveaux in 1971, was built for young, very shaly sands like these. Modified Simandoux is a third variant. All three need shale volume and the shale resistivity, R s h. Waxman-Smits and dual-water model the clay\'s charge directly, and need core measurements to calibrate.',
      do: async (d) => d.slide({ eyebrow: 'The models', title: 'Add a clay term',
        body: '<ul><li><b>Simandoux</b> (1963)</li><li><b>Indonesia</b>, Poupon and Leveaux (1971): young, very shaly sands</li><li><b>Modified Simandoux</b></li><li>All need V<sub>sh</sub> and <b>R<sub>sh</sub></b></li><li>Waxman-Smits and dual-water: calibrate on core</li></ul>' }) },
    { id: 'archie', chapter: 'On the Ekene Sand', chapterSub: 'Archie first',
      say: 'On Ekene-1, with the water from the last two lessons, Archie gives twelve and a half feet.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /net pay 12\.5 ft/, 'Archie pay');
        await d.highlight(ekene(d)); await d.callout('a', ekene(d), 'Archie: 12.5 ft (truth 27.5)', 'left');
      } },
    { id: 'simandoux', chapter: 'Simandoux',
      say: 'Switch to Simandoux, with a shale resistivity of three point two ohm metres, the value of pure clay in the Ekene earth model. Twenty two feet. Much closer.',
      do: async (d) => {
        await d.clearCallouts();
        await model(d, 'simandoux', 3.2);
        await expectText(d, ekene(d), /net pay 22\.0 ft/, 'Simandoux pay');
        await d.callout('s', ekene(d), 'Simandoux, Rsh 3.2: 22.0 ft', 'left');
      } },
    { id: 'indonesia', chapter: 'Indonesia',
      say: 'Now Indonesia, same shale resistivity. Twenty seven and a half feet: the true figure, to the half foot.',
      do: async (d) => {
        await d.clearCallouts();
        await model(d, 'indonesia', null);
        await expectText(d, ekene(d), /net pay 27\.5 ft/, 'Indonesia pay');
        await d.callout('i', ekene(d), 'Indonesia, Rsh 3.2: 27.5 ft (truth 27.5)', 'left');
      } },
    { id: 'modsim',
      say: 'Modified Simandoux gives twenty nine and a half: a little high. The models differ in how strongly the clay term grows with shale volume, which is why the choice should follow local experience and core.',
      do: async (d) => {
        await d.clearCallouts();
        await model(d, 'mod-simandoux', null);
        await expectText(d, ekene(d), /net pay 29\.5 ft/, 'modified Simandoux pay');
        await d.callout('ms', ekene(d), 'Modified Simandoux: 29.5 ft', 'left');
      } },
    { id: 'rsh', chapter: 'The shale resistivity', chapterSub: 'Read it with care',
      say: 'Where does R s h come from? Usually from the resistivity of the nearest thick shale. Beside the Ekene Sand those shales read about two point two ohm metres. Use that in Indonesia and net pay rises to thirty one feet, thirteen percent high, because those shales are only three quarters clay, with water-filled pores of their own. No shale is pure clay, so read R s h in the cleanest, thickest shale you have.',
      do: async (d) => {
        await d.clearCallouts();
        await model(d, 'indonesia', 2.2);
        await expectText(d, ekene(d), /net pay 31\.0 ft/, 'Indonesia Rsh 2.2 pay');
        await d.callout('r', ekene(d), 'Indonesia, Rsh 2.2: 31.0 ft', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module D. Archie\'s equation, with m measured on core. R w from more than one route: Pickett with care, Hingle, water salinity and the S P, always at the right temperature. And in shaly sand, a shaly-sand model: on Ekene, Indonesia with the right shale resistivity recovers the true twenty seven and a half feet where Archie found twelve and a half. In Module E: permeability, core calibration, cutoffs and saturation height.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Module D', title: 'Water saturation',
        body: '<ul><li>Archie: measure m on core</li><li>R<sub>w</sub> by several routes, at temperature</li><li>Ekene Sand pay: Archie <b>12.5</b>, Simandoux <b>22.0</b>, Indonesia <b>27.5</b>, modified Simandoux <b>29.5</b> ft (truth 27.5)</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module E: permeability and net pay</p>' }); } },
  ],
};
