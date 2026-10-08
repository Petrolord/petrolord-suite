// Lesson B7: The gas effect: density-neutron crossover and gas-corrected
// porosity (Ekene-1, kit v2). Re-cut 2026-10-08 with like-for-like checks:
// the card shows zone averages over pay, so the cutoffs are opened (every
// sample) and the shale correction set to zero (total porosity), matching
// the earth model's whole-zone total porosity. Dry run, linear Vsh 18/125:
// Oboro Sand phi_t: density 0.231; N-D rms 0.221 (avg 0.218); density with
// the flushed-zone fluid 0.6 g/cc 0.186; truth 0.195. Ekene Sand (oil,
// shaly): density 0.190, N-D rms 0.228, truth 0.198. Oboro medians: RHOB
// 2.25 (phi_D 0.24), NPHI 0.16.
import { lessonMeta, login, openPetroWell, ensureZonesOn, zoomTracksAt, expectText, ZONE_CARD, baseParams } from './common.mjs';

const oboro = (d) => ZONE_CARD(d, 'Oboro Sand');
const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-b7',
  ...lessonMeta(7, 'B', 'The gas effect: *crossover and corrected porosity*', 'Why gas makes the density read too much porosity and the neutron too little, how to spot it, and how to correct for it'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, { grClean: 18, grClay: 125, vshMethod: 'linear' });
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
    { id: 'open', chapter: 'Porosity in gas', chapterSub: 'Density alone',
      say: 'To check against the field, compare like with like. The earth model\'s figure is the total porosity averaged over the whole sand. So open the cutoffs, which makes the zone card average every foot, and set the shale correction to zero, so the card shows total porosity. Module C explains that correction.',
      do: async (d) => {
        await d.type('petro-param-phiShale', '0');
        await d.type('petro-param-cutPhi', '0'); await d.type('petro-param-cutVsh', '1'); await d.type('petro-param-cutSw', '1');
        await d.click('petro-params-apply'); await d.sleep(800);
      } },
    { id: 'density-only',
      say: 'With porosity from density alone, the Oboro Sand averages twenty three percent. The earth model says nineteen and a half. Three and a half porosity units too high, across two hundred feet of gas, is a lot of gas that is not there.',
      do: async (d) => {
        await expectText(d, oboro(d), /φe 0\.231/, 'density-only Oboro phi');
        await d.highlight(oboro(d)); await d.callout('d', oboro(d), 'Density only: φ 0.231 (truth 0.195)', 'left');
      } },
    { id: 'nd-slide', chapter: 'Correcting for gas', chapterSub: 'Combine the two tools',
      say: 'The classic fix is to use both tools together. Because the errors run in opposite directions, combining them cancels much of the gas effect. The simple average works in oil and water. In gas, the square root of the mean of the squares is the usual choice.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Correcting for gas', title: 'Combine the two readings',
        body: '<ul><li>Oil and water: the <b>average</b></li><li>Gas: the <b>root mean square</b></li></ul>', formula: 'φ<sub>ND</sub> = √( (φ<sub>D</sub><sup>2</sup> + φ<sub>N</sub><sup>2</sup>) / 2 )' }); } },
    { id: 'rms',
      say: 'Set the porosity source to neutron density, with the root mean square. The Oboro Sand now reads twenty two point one percent. Better, but still more than two and a half units high. Why only part of the way? This sand is a quarter clay. The neutron counts the water bound in that clay, which lifts its reading and hides part of the gas effect. The combination assumes a clean sand.',
      do: async (d) => {
        await d.hideSlide();
        await d.select('petro-param-phiSource', 'nd'); await d.select('petro-param-ndMethod', 'rms');
        await d.click('petro-params-apply');
        await expectText(d, oboro(d), /φe 0\.221/, 'rms Oboro phi');
        await d.highlight(oboro(d)); await d.callout('r', oboro(d), 'Neutron-density, gas form: φ 0.221', 'left');
      } },
    { id: 'fluid-slide', chapter: 'Tell the density what it sees', chapterSub: 'The flushed zone',
      say: 'In a shaly gas sand there is a better route. The density tool reads only a few inches into the rock: the flushed zone, where mud filtrate has pushed out most of the gas, but not all of it. In the Oboro Sand the filtrate fills about forty five percent of the pores, and the rest is gas. So the fluid the tool sees weighs only about zero point six grams per cubic centimetre.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Tell the density what it sees', title: 'The flushed-zone fluid',
        body: '<ul><li>Mud filtrate, 1.03 g/cc, about <b>45%</b> of the pores</li><li>Residual gas, 0.25 g/cc, the rest</li><li>Mix: about <b>0.6</b> g/cc</li></ul>', formula: 'ρ<sub>fl</sub> = ρ<sub>mf</sub> S<sub>xo</sub> + ρ<sub>g</sub> (1 − S<sub>xo</sub>) = 1.03 × 0.45 + 0.25 × 0.55 ≈ 0.60' }); } },
    { id: 'fluid',
      say: 'Back to density alone, with a fluid density of zero point six. The Oboro Sand reads eighteen point six percent: within one porosity unit of the truth, and slightly low, because this shaly sand\'s grains are a little heavier than pure quartz. Lesson 8 deals with the matrix.',
      do: async (d) => {
        await d.hideSlide();
        await d.select('petro-param-phiSource', 'density'); await d.type('petro-param-rhoFl', '0.6');
        await d.click('petro-params-apply');
        await expectText(d, oboro(d), /φe 0\.186/, 'flushed-fluid Oboro phi');
        await d.highlight(oboro(d)); await d.callout('f', oboro(d), 'Density, fluid 0.6 g/cc: φ 0.186 (truth 0.195)', 'left');
      } },
    { id: 'caution', chapter: 'Where it does not belong', chapterSub: 'The Ekene Sand, oil',
      say: 'Both corrections belong in the gas zone only. Put the fluid density back to one, switch to neutron density again, and look at the Ekene Sand, which holds oil and has more clay. It reads twenty two point eight percent, against nineteen from density and a truth of nineteen point eight. In shaly rock the neutron reads high. So correct for gas where the crossover says there is gas, and nowhere else. The studio lets you set parameters zone by zone.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.type('petro-param-rhoFl', '1'); await d.select('petro-param-phiSource', 'nd');
        await d.click('petro-params-apply');
        await expectText(d, ekene(d), /φe 0\.228/, 'rms Ekene phi');
        await d.highlight(ekene(d)); await d.callout('e', ekene(d), 'Oil sand, shaly: N-D 0.228 (truth 0.198)', 'left');
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module B. Shale volume comes from the gamma ray, between calibrated end points, and the model matters. The density neutron crossplot and the photoelectric factor give the lithology. And gas shows as a crossover: density reads high and neutron low. Combining the tools helps, but in a shaly gas sand the better fix is the flushed-zone fluid density. Apply either only where the gas is. In Module C we turn to porosity itself, starting with the density log.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Module B', title: 'Shale, lithology, gas',
        body: '<ul><li>Vsh: calibrated end points, and the model matters</li><li>Lithology: density-neutron crossplot and PEF</li><li>Gas, Oboro total φ: density <b>0.231</b>, N-D <b>0.221</b>, flushed-zone fluid <b>0.186</b> (truth 0.195)</li><li>Correct for gas only where the gas is</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module C: porosity</p>' }); } },
  ],
};
