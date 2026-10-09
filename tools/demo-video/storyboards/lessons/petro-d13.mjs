// Lesson D13: Hingle plot, SP and water salinity, three more routes to Rw,
// and the Arps temperature conversion (Ekene-1, kit v2, feet). Dry run
// 2026-10-08, Module D base, Archie 1/2/2: Hingle over 5118.5-5183.5 ft, m 2,
// clean if Vsh <= 0.10: Rw 0.077221, 69 points, 61 shaly left out; applied,
// Ekene Sand net pay 13.0 ft. Salinity 35,000 ppm at 180 degF: Rw 0.078448
// (pay 12.5 ft). Arps 0.0786 at 180 to 75 degF: 0.179529. SP: clean water sand
// -58.5 mV, Akata shale -3.4 mV, clean sand Vsh about 0.07 -> SSP about -59 mV;
// Rmf 1.2 at 75 degF (LAS header), 180 degF: Rw 0.091071. Truth 0.0786.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams } from './common.mjs';
import { MODULE_D_BASE } from './petro-d11.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-d13',
  ...lessonMeta(13, 'D', 'Hingle plot, SP and salinity: *more ways to Rw*', 'Three more routes to water resistivity, the Arps temperature conversion, and how far each route lands from the truth'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { ...MODULE_D_BASE, rw: 0.0786 });
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 13', chapterSub: 'Module D · Water saturation',
      say: 'Water resistivity drives every saturation, so it pays to get it more than one way. In this lesson: the Hingle plot, which fixes m and fits R w alone; R w from a water sample\'s salinity; the S P log; and how R w changes with temperature.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 13', title: 'More ways to Rw',
        body: '<ul><li>The Hingle plot</li><li>Water salinity</li><li>Temperature: the Arps conversion</li><li>The SP log</li></ul>' }) },
    { id: 'hingle-theory', chapter: 'The Hingle plot', chapterSub: 'm fixed, Rw fitted',
      say: 'The Hingle plot sets m first. Plot porosity against resistivity to the power minus one over m, and water-bearing rock falls on a straight line through zero porosity. Its slope gives R w. With m fixed at two, from the region, the noise that flattened the Pickett line has nothing to bend.',
      do: async (d) => d.slide({ eyebrow: 'The Hingle plot', title: 'Fix m, fit Rw',
        body: '<ul><li>Choose m first, from core or the region</li><li>Water-bearing points line up through zero porosity</li><li>The slope gives R<sub>w</sub></li></ul>', formula: 'φ = (a R<sub>w</sub>)<sup>1/m</sup> × R<sub>t</sub><sup>−1/m</sup>  (S<sub>w</sub> = 1)' }) },
    { id: 'hingle', chapter: 'Hingle on the water leg',
      say: 'On the same water leg, with m of two and the same clean filter, fit. R w comes out at zero point zero seven seven two. The earth model says zero point zero seven eight six: about two percent low. Apply it, and the Ekene Sand shows thirteen feet of net pay.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-view-crossplot'); await d.click('petro-plot-hingle');
        await d.type('petro-hingle-top', '5118.5'); await d.type('petro-hingle-base', '5183.5'); await d.type('petro-hingle-clean-vsh', '0.10');
        await d.click('petro-hingle-fit');
        await expectText(d, 'petro-hingle-result', /Rw = 0\.077221 at m = 2 · 69 pts · 61 shaly left out/, 'Hingle fit');
        await d.highlight('petro-hingle-result'); await d.sleep(3000); await d.unhighlight();
        await d.click('petro-hingle-apply'); await d.sleep(800); await d.click('petro-view-tracks');
        await expectText(d, ekene(d), /net pay 13\.0 ft/, 'Hingle applied pay');
        await d.highlight(ekene(d)); await d.callout('h', ekene(d), 'Hingle Rw 0.0772: 13.0 ft', 'left');
      } },
    { id: 'salinity', chapter: 'From a water sample', chapterSub: 'Salinity and temperature',
      say: 'If a water sample was taken, its salinity gives R w directly. Ekene\'s formation water carries thirty five thousand parts per million of sodium chloride. In R w tools, enter that salinity and the formation temperature, one hundred and eighty degrees Fahrenheit at the Ekene Sand. R w is zero point zero seven eight four: within a fraction of a percent of the truth.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.click('petro-rwtools'); await d.waitFor('petro-rwtools-dialog');
        await d.type('petro-rw-sal-ppm', '35000'); await d.type('petro-rw-sal-tempc', '180');
        await expectText(d, 'petro-rw-sal-result', /Rw = 0\.078448 at 180 °F/, 'salinity Rw');
        await d.highlight('petro-rw-salinity-card');
      } },
    { id: 'arps', chapter: 'Rw and temperature', chapterSub: 'The Arps conversion',
      say: 'Water resistivity falls as temperature rises, so an R w always needs its temperature. The Arps formula converts between them. The same water, zero point zero seven eight six at one hundred and eighty degrees, reads zero point one seven nine five at seventy five, more than twice as resistive. Mixing up a surface value with a downhole one is a classic mistake.',
      do: async (d) => {
        await d.unhighlight();
        await d.type('petro-rw-arps-rw', '0.0786'); await d.type('petro-rw-arps-t1', '180'); await d.type('petro-rw-arps-t2', '75');
        await expectText(d, 'petro-rw-arps-result', /Rw = 0\.179529/, 'Arps');
        await d.highlight('petro-rw-arps-result');
      } },
    { id: 'sp-theory', chapter: 'The SP log', chapterSub: 'A natural battery',
      say: 'The S P log records a natural voltage set up where salty formation water meets fresher mud filtrate. In a thick, clean water sand, measured against a pure shale, it reaches the static S P, which depends on the ratio of the two waters\' resistivities. On Ekene-1 the clean water sand reads minus fifty eight and a half millivolts, and the Akata, the purest shale in the well, minus three point four. The sand still holds about seven percent shale, which shrinks the deflection, so divide by one minus that: the static S P is about minus fifty nine millivolts.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'The SP log', title: 'Reading the static SP',
        body: '<ul><li>Clean water sand: <b>−58.5</b> mV; Akata shale: <b>−3.4</b> mV</li><li>Deflection 55 mV, in sand with about 7% shale</li><li>Static SP ≈ −55 / (1 − 0.07) ≈ <b>−59</b> mV</li></ul>', formula: 'SSP = −K log(R<sub>mfe</sub> / R<sub>we</sub>),  K = 61 + 0.133 T(°F)' }); } },
    { id: 'sp', chapter: 'Rw from the SP',
      say: 'Enter it with the mud filtrate from the log header, one point two ohm metres at seventy five degrees, and the formation temperature. The studio works through the chart chain and gives R w of zero point zero nine one: sixteen percent high. That is typical of the S P route, which leans on charts and on how cleanly the baseline is read.',
      do: async (d) => {
        await d.hideSlide();
        await d.type('petro-rw-ssp', '-59'); await d.type('petro-rw-rmf', '1.2'); await d.type('petro-rw-rmf-tempc', '75'); await d.type('petro-rw-tempc', '180');
        await expectText(d, 'petro-rw-sp-rw', /Rw = 0\.091071/, 'SP Rw');
        await d.highlight('petro-rw-sp-card');
      } },
    { id: 'compare', chapter: 'Four routes, one answer',
      say: 'Line them up. The free Pickett fit, zero point one two eight with m of one point six eight. Hingle with m fixed, zero point zero seven seven two. The water sample, zero point zero seven eight four. The S P, zero point zero nine one. Truth, zero point zero seven eight six. Where routes agree, trust grows. Where one stands apart, find out why.',
      do: async (d) => { await d.unhighlight(); await d.page.keyboard.press('Escape'); await d.slide({ eyebrow: 'Four routes, one answer', title: 'Rw at 180 °F',
        body: '<table style="font-size:30px;border-collapse:separate;border-spacing:0 12px"><colgroup><col style="width:520px"><col></colgroup><tr><td>Pickett, free fit (m 1.68)</td><td><b>0.128</b></td></tr><tr><td>Hingle, m = 2</td><td><b>0.0772</b></td></tr><tr><td>Water sample, 35,000 ppm</td><td><b>0.0784</b></td></tr><tr><td>SP, −59 mV</td><td><b>0.091</b></td></tr><tr><td style="color:#d4ac3a">Truth (earth model)</td><td><b>0.0786</b></td></tr></table>' }); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. The Hingle plot fixes m and fits R w alone. A water sample\'s salinity is the most direct route. The S P works from a natural voltage, with chart error. And every R w belongs to a temperature, converted with Arps. Next, the last lesson of Module D: why Archie undercounts in shaly sand, and the models that fix it.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 13', title: 'More ways to Rw',
        body: '<ul><li>Hingle: m fixed, R<sub>w</sub> fitted</li><li>Salinity: the most direct route</li><li>SP: natural voltage, chart error</li><li>Always quote R<sub>w</sub> with its temperature</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: shaly-sand saturation</p>' }) },
  ],
};
