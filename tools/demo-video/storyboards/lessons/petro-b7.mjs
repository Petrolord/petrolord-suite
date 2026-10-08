// Lesson B7: The gas effect: density-neutron crossover and gas-corrected
// porosity (Ekene-1, kit v2). Dry run 2026-10-08, linear Vsh 18/125:
// Oboro Sand phi_e: density 0.221; neutron-density average 0.197; root
// mean square (gas form) 0.200; truth (earth model) 0.195. Ekene Sand (oil,
// shaly): density 0.198; neutron-density average 0.224 (neutron reads the
// clay's bound water). Oboro medians: RHOB 2.25 (phi_D 0.24), NPHI 0.16.
import { lessonMeta, login, openPetroWell, ensureZonesOn, zoomTracksAt, expectText, ZONE_CARD } from './common.mjs';

const oboro = (d) => ZONE_CARD(d, 'Oboro Sand');
const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-b7',
  ...lessonMeta(7, 'B', 'The gas effect: *crossover and corrected porosity*', 'Why gas makes the density read too much porosity and the neutron too little, how to spot it, and how to correct for it'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    const t = (id) => d.page.getByTestId(id);
    await t('petro-param-grClean').fill('18'); await t('petro-param-grClay').fill('125');
    await t('petro-param-vshMethod').selectOption('linear'); await t('petro-param-phiSource').selectOption('density');
    await t('petro-params-apply').click(); await d.sleep(1000);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 7', chapterSub: 'Module B · Shale and lithology',
      say: 'In the last two lessons, the Oboro Sand kept standing out: high resistivity, and density and neutron curves that cross over. That is gas. Gas is the one fluid that moves both porosity tools the wrong way, in opposite directions, and if we ignore it we get the porosity wrong. In this lesson we see why, and correct for it.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 7', title: 'The gas effect',
        body: '<ul><li>Why gas fools the <b>density</b> and the <b>neutron</b></li><li>Spotting it: the crossover</li><li>Correcting porosity for gas</li><li>Where the correction does not belong</li></ul>' }) },
    { id: 'why', chapter: 'Why gas fools both tools', chapterSub: 'Density sees mass, neutron sees hydrogen',
      say: 'Density porosity assumes the pores hold water, at about one gram per cubic centimetre. Gas is far lighter, so a gas sand reads a low bulk density, and the density porosity comes out too high. The neutron counts hydrogen. Gas holds much less hydrogen per unit volume than water or oil, so the neutron porosity comes out too low. One tool reads high, the other low, and the true porosity lies between them.',
      do: async (d) => d.slide({ eyebrow: 'Why gas fools both tools', title: 'One reads high, one reads low',
        body: '<ul><li>Gas is light: <b>density porosity too high</b></li><li>Gas holds little hydrogen: <b>neutron porosity too low</b></li><li>The truth lies between the two</li></ul>' }) },

    { id: 'tracks', chapter: 'Spotting gas', chapterSub: 'The Oboro Sand',
      say: 'On the logs, zoom onto the Oboro Sand, around six thousand one hundred and fifty feet.',
      do: async (d, shared) => { await d.hideSlide(); shared.values.g = await zoomTracksAt(d, 6160, 8); } },
    { id: 'crossover',
      say: 'On the density neutron track the two curves cross over, shaded yellow, across the whole sand. Density reads about two point two five, which on its own says twenty four percent porosity. Neutron says sixteen. In an oil or water sand the two would track together.',
      do: async (d, shared) => {
        const { yAt, b } = shared.values.g;
        await d.moveTo({ x: b.x + b.width * 0.36, y: yAt(6150) }, { ms: 900 });
        await d.sleep(1500);
        await d.moveTo({ x: b.x + b.width * 0.36, y: yAt(6210) }, { ms: 1200 });
      } },
    { id: 'density-only', chapter: 'Porosity in gas', chapterSub: 'Density alone',
      say: 'With porosity from density alone, the Oboro Sand averages twenty two percent effective porosity. The earth model behind the field says nineteen and a half. Two and a half porosity units too high, across two hundred feet of gas, is a lot of gas that is not there.',
      do: async (d) => {
        await expectText(d, oboro(d), /φe 0\.221/, 'density-only Oboro phi');
        await d.highlight(oboro(d)); await d.callout('d', oboro(d), 'Density only: φe 0.221 (truth 0.195)', 'left');
      } },
    { id: 'nd-slide', chapter: 'Correcting for gas',
      say: 'The fix is to use both tools together. Because the errors run in opposite directions, combining them cancels most of the gas effect. The simple average works in oil and water. In gas, the square root of the mean of the squares is the usual choice, because it weighs the higher reading a little more, which matches how the two tools respond.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Correcting for gas', title: 'Combine the two readings',
        body: '<ul><li>Oil and water: the <b>average</b></li><li>Gas: the <b>root mean square</b></li></ul>', formula: 'φ<sub>ND</sub> = √( (φ<sub>D</sub><sup>2</sup> + φ<sub>N</sub><sup>2</sup>) / 2 )' }); } },
    { id: 'rms',
      say: 'In the parameters, set the porosity source to neutron density, and the combination to root mean square. The Oboro Sand now averages twenty percent, half a porosity unit from the truth.',
      do: async (d) => {
        await d.hideSlide();
        await d.select('petro-param-phiSource', 'nd'); await d.select('petro-param-ndMethod', 'rms');
        await d.click('petro-params-apply');
        await expectText(d, oboro(d), /φe 0\.200/, 'rms Oboro phi');
        await d.highlight(oboro(d)); await d.callout('r', oboro(d), 'Neutron-density, gas form: φe 0.200', 'left');
      } },
    { id: 'caution', chapter: 'Where it does not belong', chapterSub: 'The Ekene Sand, oil',
      say: 'A word of caution. Look at the Ekene Sand, which holds oil and has more clay. With the same neutron density combination it reads twenty three percent, against twenty from density alone. In shaly rock the neutron counts the water bound in the clay, and reads high. So apply the gas correction where the crossover says there is gas, and nowhere else. The studio lets you set it zone by zone.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await expectText(d, ekene(d), /φe 0\.228/, 'rms Ekene phi');
        await d.highlight(ekene(d)); await d.callout('e', ekene(d), 'Oil sand, shaly: the neutron reads the clay water', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module B. Shale volume comes from the gamma ray, between calibrated end points, and the model matters. The density neutron crossplot and the photoelectric factor give the lithology. And gas shows as a crossover, makes density read high and neutron low, and is corrected by combining the two, only where the gas is. In Module C we turn to porosity itself, starting with the density log.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Module B', title: 'Shale, lithology, gas',
        body: '<ul><li>Vsh: calibrated end points, and the model matters</li><li>Lithology: density-neutron crossplot and PEF</li><li>Gas: crossover; Oboro φe <b>0.221</b> to <b>0.200</b> (truth 0.195)</li><li>Correct for gas only where the gas is</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module C: porosity</p>' }); } },
  ],
};
