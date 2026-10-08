// Lesson B5: Shale volume from the gamma ray (Ekene-1, kit v2, feet).
// Dry run 2026-10-08: GR histogram whole well P10 28.6 / P50 60.6 / P90 109.1;
// Ekene Sand P10 24.5; Ogbia Shale P50 99.6 (truth Vsh 0.76). Field core
// calibration: clean 18, clay 125, GR linear in clay. Ekene Sand mean Vsh
// (truth 0.203): linear 0.205; Larionov older 0.114; Clavier 0.104;
// Steiber 0.083; Larionov Tertiary 0.063. Net reservoir 99.5 ft (linear)
// against 105.0 ft with any of the others.
import { lessonMeta, login, openPetroWell, ensureZonesOn, histFilter, expectText, ZONE_CARD } from './common.mjs';

const card = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-b5',
  ...lessonMeta(5, 'B', 'Shale volume from the gamma ray: *end points and models*', 'The gamma ray index, picking the clean and clay lines, why a shale is not pure clay, and how much the choice of Vsh model moves the answer'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 5', chapterSub: 'Module B · Shale and lithology',
      say: 'Module A got the data right. Module B starts putting numbers on the rock, and the first number is the shale volume: how much of the rock is clay. It feeds almost everything that follows: effective porosity, water saturation in shaly sand, and the cutoffs that decide what counts as reservoir.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 5', title: 'Shale volume from the gamma ray',
        body: '<ul><li>The <b>gamma ray index</b></li><li>Picking the <b>clean</b> and <b>clay</b> lines</li><li>Why a shale is not pure clay</li><li>Linear, Larionov, Clavier, Steiber: how much the model matters</li></ul>' }) },
    { id: 'igr', chapter: 'The gamma ray index', chapterSub: 'From API to a fraction',
      say: 'Clay minerals carry potassium and thorium, so the gamma ray rises with clay. The simplest estimate scales the gamma ray between two end points: the reading in perfectly clean rock, and the reading in pure clay. That ratio is the gamma ray index. If the gamma ray responds in a straight line to clay, the index is the shale volume. The other models bend that line, giving less shale for the same index, because in some basins the gamma ray overstates clay.',
      do: async (d) => d.slide({ eyebrow: 'The gamma ray index', title: 'Scale the gamma ray between two end points',
        body: '<ul><li><b>Linear</b>: V<sub>sh</sub> = I<sub>GR</sub></li><li><b>Larionov, Tertiary</b>: V<sub>sh</sub> = 0.083 (2<sup>3.7 I</sup> − 1)</li><li><b>Larionov, older rocks</b>: V<sub>sh</sub> = 0.33 (2<sup>2 I</sup> − 1)</li><li><b>Clavier</b> and <b>Steiber</b>: other curves, fitted to other basins</li></ul>',
        formula: 'I<sub>GR</sub> = (GR − GR<sub>clean</sub>) / (GR<sub>clay</sub> − GR<sub>clean</sub>)' }) },

    { id: 'hist', chapter: 'Picking the end points', chapterSub: 'The gamma ray histogram',
      say: 'The end points come from the data. The histogram of the whole well shows two populations, sand on the left, shale on the right. Its tenth percentile is twenty nine API and its ninetieth is one hundred and nine.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-view-histogram'); await d.waitFor('petro-histogram');
        await expectText(d, 'petro-hist-pcts', /10th percentile 28\.6 · 50th percentile 60\.64 · 90th percentile 109\.1/, 'whole-well percentiles');
        await d.highlight('petro-hist-pcts');
      } },
    { id: 'clean',
      say: 'For the clean line, look at the cleanest sand. Filtered to the Ekene Sand, the tenth percentile is twenty four and a half API.',
      do: async (d) => { await d.unhighlight(); await histFilter(d, 'Ekene Sand'); await expectText(d, 'petro-hist-pcts', /10th percentile 24\.46/, 'Ekene Sand P10'); await d.highlight('petro-hist-pcts'); } },
    { id: 'shale',
      say: 'For the clay line, it is tempting to take the shale. Filtered to the Ogbia Shale, the gamma ray sits around one hundred API. But a shale is a mixture of clay and silt, and the Ogbia is about three quarters clay. Use its reading as the clay line, and every sand looks cleaner than it is.',
      do: async (d) => { await d.unhighlight(); await histFilter(d, 'Ogbia Shale'); await expectText(d, 'petro-hist-pcts', /50th percentile 99\.62/, 'Ogbia P50'); await d.highlight('petro-hist-pcts'); } },
    { id: 'calibration', chapter: 'Calibrate the end points',
      say: 'The way out is calibration. In a real field, core and X ray diffraction measure the clay directly. Ekene is built from an earth model, so we know the answer exactly: the clean line is eighteen API, the pure clay line one hundred and twenty five, and the gamma ray responds linearly to clay. Both end points lie outside what the logs alone suggest, which is common. Clean sand still carries a little feldspar, and no shale in the well is pure clay.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Calibrate the end points', title: 'The calibration: 18, 125 and linear',
        body: '<ul><li>Clean sand on the logs: about <b>24</b> API</li><li>Ogbia Shale: about <b>100</b> API, three quarters clay</li><li>Calibrated (core and XRD in a real field): clean <b>18</b>, clay <b>125</b></li><li>And the response is <b>linear</b></li></ul>' }); } },
    { id: 'set',
      say: 'So we set them: eighteen and one hundred and twenty five. On the histogram the clean and clay lines move to match.',
      do: async (d) => {
        await d.hideSlide(); await histFilter(d, 'all');
        await d.type('petro-param-grClean', '18'); await d.type('petro-param-grClay', '125');
        await d.click('petro-params-apply'); await d.sleep(800);
      } },

    { id: 'default', chapter: 'Does the model matter?', chapterSub: 'Ekene Sand, mean Vsh',
      say: 'Now the model. The studio starts on Larionov for Tertiary rocks, a common choice in young basins like the Niger Delta. With it, the Ekene Sand averages six percent shale.',
      do: async (d) => {
        await d.click('petro-view-tracks');
        await expectText(d, card(d), /Vsh 0\.063/, 'Larionov Tertiary Vsh');
        await d.highlight(card(d)); await d.callout('lt', card(d), 'Larionov Tertiary: Vsh 0.063', 'left');
      } },
    { id: 'linear',
      say: 'Switch to linear, which the calibration supports here. The average rises to twenty point five percent. The field\'s true value is twenty point three. Larionov reported a third of the shale that is really there.',
      do: async (d) => {
        await d.clearCallouts();
        await d.select('petro-param-vshMethod', 'linear'); await d.click('petro-params-apply');
        await expectText(d, card(d), /Vsh 0\.205/, 'linear Vsh');
        await d.callout('lin', card(d), 'Linear: Vsh 0.205 (truth 0.203)', 'left');
      } },
    { id: 'table',
      say: 'Across all five models the spread is wide. Linear gives twenty point five percent. Larionov for older rocks eleven, Clavier ten, Steiber eight, and Larionov Tertiary six. Same well, same end points. And with the lower values, every shale streak inside the sand passes the shale cutoff, so the net reservoir grows from ninety nine and a half feet to the whole hundred and five.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Ekene Sand, end points 18 and 125', title: 'One well, five answers',
        body: '<table style="border-collapse:collapse;font-size:32px"><tr><td style="padding:6px 40px 6px 0">Linear</td><td><b>0.205</b></td></tr><tr><td style="padding:6px 40px 6px 0">Larionov, older rocks</td><td>0.114</td></tr><tr><td style="padding:6px 40px 6px 0">Clavier</td><td>0.104</td></tr><tr><td style="padding:6px 40px 6px 0">Steiber</td><td>0.083</td></tr><tr><td style="padding:6px 40px 6px 0">Larionov, Tertiary</td><td>0.063</td></tr><tr><td style="padding:14px 40px 6px 0;color:#d4ac3a">Truth (earth model)</td><td style="padding-top:14px;color:#d4ac3a"><b>0.203</b></td></tr></table>' }); } },
    { id: 'crossplot', chapter: 'Seeing shale', chapterSub: 'Density-neutron, coloured by Vsh',
      say: 'Shale volume is easiest to judge in context. On the density neutron crossplot, coloured by Vsh, the clean sands sit in blue near the sandstone line, the shales in red to the lower right, and the mixtures between them. A shale model that paints those red points green is telling you something.',
      do: async (d) => { await d.hideSlide(); await d.click('petro-view-crossplot'); await d.click('petro-plot-nd'); await d.sleep(800); await d.highlight('petro-crossplot-canvas', { pad: 4 }); await d.sleep(1500); await d.unhighlight(); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. The gamma ray index scales the gamma ray between a clean line and a clay line. Pick the clean line in the cleanest sand, and remember that a shale is not pure clay. Calibrate both, and the model, against core and X ray diffraction where you can. Here the model choice alone moved the shale volume by a factor of three. Next lesson, lithology from the density, neutron and photoelectric logs.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 5', title: 'Calibrate, then compute',
        body: '<ul><li>I<sub>GR</sub> scales between a clean and a clay line</li><li>A shale is <b>not pure clay</b>: the Ogbia is 76 percent</li><li>Calibrate end points and model: core, XRD</li><li>Model choice alone: <b>0.063 to 0.205</b></li></ul><p style="margin-top:28px;color:#d4ac3a">Next: lithology from density, neutron and PEF</p>' }) },
  ],
};
