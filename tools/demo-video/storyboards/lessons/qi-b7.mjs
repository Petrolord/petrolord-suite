// QI lesson B7: modelled AVO at the top of the Ekene Sand, the wet trend, and
// the gather each well publishes for QI Studio and Seismolord.
// Figures from the 2026-10-10 probe (kit v3, Ekene-1, scenario from lesson B5):
// halfspaces upper (Ogbia Shale) AI 15475 ft/s·g/cc Vp/Vs 2.917, lower AI 20695
// Vp/Vs 1.774; in situ A 0.1440 B -0.5151 class I; lower with brine A 0.1898
// B -0.4148 class I; wet trend B = -2.46 A from 59 interfaces; Castagna,
// Swan and Foster's constant Vp/Vs line B = -0.21 A; distance in situ -0.061,
// with brine 0.020. Gather picks are read in the dry run (GATHER below).
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openRpsWell, ZONE_LABEL } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'lesson-qi-b7',
  ...qiLessonMeta(7, 'B', 'Modelled AVO: *what the seismic should show*', 'Intercept, gradient and class at the top of the Ekene Sand, the wet trend, and the gather each well publishes'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openRpsWell(d, shared, 'Ekene-1');
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 7', chapterSub: 'Module B · Rock physics first',
      say: 'The seismic does not record rock properties. It records reflections at interfaces, and how their strength changes with angle. So the last step of feasibility turns the rock physics into reflections: what the top of the Ekene Sand should look like on near and far offsets, with oil, and with brine.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 7', title: 'Modelled AVO',
        body: '<ul><li>Reflection strength against angle</li><li>Intercept <b>A</b>, gradient <b>B</b>, the class</li><li>Oil against brine at the top Ekene Sand</li></ul>' }) },
    { id: 'shuey', chapter: 'Intercept and gradient', chapterSub: 'Shuey two-term',
      say: 'For angles up to about thirty degrees, the reflection coefficient is close to a straight line in sine squared: an intercept A, the normal incidence reflection, plus a gradient B times sine squared. A depends on the impedance contrast. B depends on the contrast in shear, which is why hydrocarbons, which soften Vp but barely touch Vs, move B.',
      do: async (d) => d.slide({ eyebrow: 'Intercept and gradient', title: 'Shuey two-term', formula: 'R(θ) ≈ A + B sin²θ',
        body: '<ul><li><b>A</b>: the normal-incidence reflection</li><li><b>B</b>: the change with angle</li><li>Classes I to IV by the sign and size of A and B</li></ul>' }) },
    { id: 'top', chapter: 'Top Ekene Sand', chapterSub: 'Rock Physics Studio · AVO',
      say: 'In the AVO view we take the top of the Ekene Sand on Ekene one. Above it, the Ogbia Shale: impedance fifteen thousand five hundred and a high Vp over Vs of two point nine. Below, the oil sand: impedance twenty thousand seven hundred and Vp over Vs of one point seven seven.',
      sub: 'In the AVO view we take the top of the Ekene Sand on Ekene-1. Above it, the Ogbia Shale: impedance 15,500 ft/s·g/cc and a high Vp/Vs of 2.9. Below, the oil sand: impedance 20,700 ft/s·g/cc and Vp/Vs of 1.77.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('rp-view-avo');
        await d.select('rp-avo-top-select', { label: 'Ekene Sand (5078.7 ft)' });
        await expectText(d, 'rp-avo-elastic', /upper\s*15475\s*2\.917[\s\S]*lower\s*20695\s*1\.774/, 'halfspaces');
        await d.highlight('rp-avo-elastic');
      } },
    { id: 'insitu',
      say: 'In situ, the intercept is plus point one four four and the gradient minus point five one five: a class one reflector, bright at near offsets and dimming with angle, as a hard sand under a softer shale should.',
      sub: 'In situ, the intercept is +0.144 and the gradient -0.515: a class I reflector, bright at near offsets and dimming with angle, as a hard sand under a softer shale should.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'rp-avo-a', /^0\.1440$/, 'A in situ');
        await expectText(d, 'rp-avo-b', /^-0\.5151$/, 'B in situ');
        await expectText(d, 'rp-avo-class', /^Class I$/, 'class in situ');
        await d.highlight(d.page.getByText('A (intercept) 0.1440').first());
      } },
    { id: 'brine',
      say: 'With brine in place of the oil, the intercept rises to point one nine and the gradient flattens to minus point four one. Still class one. The oil does not change the class here; it dims the reflection, by about a quarter at normal incidence. On near stacks, the oil leg should look dimmer than the brine-filled sand down dip.',
      sub: 'With brine in place of the oil, the intercept rises to 0.19 and the gradient flattens to -0.41. Still class I. The oil does not change the class here; it dims the reflection, by about a quarter at normal incidence. On near stacks, the oil leg should look dimmer than the brine-filled sand down dip.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'rp-avo-replaced', /A 0\.1898[\s\S]*B -0\.4148[\s\S]*Class I/, 'brine AVO');
        await d.highlight('rp-avo-replaced');
      } },
    { id: 'trend', chapter: 'The wet trend', chapterSub: 'Distance from brine',
      say: 'On the intercept-gradient crossplot, brine-filled interfaces fall along a line through the origin, the wet trend. Rock Physics Studio fits it to fifty nine interfaces of this well\'s own logs, with the hydrocarbon taken out first, and finds a slope of minus two point four six. The textbook line for a constant Vp over Vs would be minus point two one: the local fit is worth having.',
      sub: 'On the intercept-gradient crossplot, brine-filled interfaces fall along a line through the origin, the wet trend. Rock Physics Studio fits it to 59 interfaces of this well\'s own logs, with the hydrocarbon taken out first, and finds a slope of -2.46. The textbook line for a constant Vp/Vs would be -0.21: the local fit is worth having.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'rp-avo-trend', /Wet trend B = -2\.46 A, fitted to 59 interfaces[\s\S]*B = -0\.21 A/, 'wet trend');
        await d.highlight('rp-avo-trend');
      } },
    { id: 'distance',
      say: 'The distance from the trend is the AVO anomaly. In situ, the top Ekene sits at minus point zero six, on the hydrocarbon side. With brine it moves to plus point zero two, back onto the trend. That shift is what an AVO attribute such as the fluid factor looks for on the seismic.',
      sub: 'The distance from the trend is the AVO anomaly. In situ, the top Ekene sits at -0.06, on the hydrocarbon side. With brine it moves to +0.02, back onto the trend. That shift is what an AVO attribute such as the fluid factor looks for on the seismic.',
      do: async (d) => {
        await expectText(d, 'rp-avo-trend-distance', /^-0\.061$/, 'distance in situ');
        await expectText(d, 'rp-avo-trend-distance-b', /^0\.020$/, 'distance with brine');
        await d.highlight(d.page.locator('[data-testid="rp-avo-panel"] .recharts-wrapper').last());
      } },
    { id: 'gather', chapter: 'The synthetic gather', chapterSub: 'Rock Physics Studio · Gather',
      say: 'The gather view puts the logs through exact Zoeppritz at each angle and convolves a wavelet, here a twenty five hertz zero-phase Ricker, for the in situ rock and for the zone filled with brine. It is what the prestack seismic should look like at the well. The top Ekene is brighter with brine at every angle, and the picked amplitudes carry the interference from the base of the sand.',
      sub: 'The gather view puts the logs through exact Zoeppritz at each angle and convolves a wavelet, here a 25 Hz zero-phase Ricker, for the in situ rock and for the zone filled with brine. It is what the prestack seismic should look like at the well. The top Ekene is brighter with brine at every angle, and the picked amplitudes carry the interference from the base of the sand.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('rp-view-gather');
        await d.select('rp-gather-zone', { label: ZONE_LABEL });
        await d.sleep(2000);
        await expectText(d, 'rp-gather-summary', /Ricker 25 Hz, zero phase/, 'gather wavelet');
        await d.highlight('rp-gather-panel', { pad: -40 });
      } },
    { id: 'publish',
      say: 'Publish gather saves it with the project, for this well. QI Studio reads each well\'s published gather when it checks the AVO volumes at the wells, and Seismolord shows it beside the tie. We publish Ekene one\'s.',
      sub: 'Publish gather saves it with the project, for this well. QI Studio reads each well\'s published gather when it checks the AVO volumes at the wells, and Seismolord shows it beside the tie. We publish Ekene-1\'s.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('rp-gather-publish');
        await expectText(d, 'rp-gather-published', /Ekene-1, Ekene Sand/, 'published label');
        await d.highlight('rp-gather-publish-row');
      } },
    { id: 'verdict', chapter: 'Feasibility', chapterSub: 'The answer for Module B',
      say: 'So, can the seismic see the oil in the Ekene Sand? The rock physics says yes, with conditions. Impedance and Vp over Vs both move by about seven percent over the oil leg; the top reflection dims by a quarter and moves off the wet trend. But the oil column is under forty feet, below tuning, so the effect is a dimming of the top reflection, not a separate flat spot.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Module B · the answer', title: 'Feasible, with conditions',
          body: '<ul><li>AI and Vp/Vs: about 7 percent over the oil leg</li><li>Top Ekene: class I, about a quarter dimmer with oil</li><li>Oil column under 40 ft: below tuning, no flat spot</li></ul>' });
      } },
    { id: 'next',
      say: 'Module C ties the wells to the seismic, so that these predictions can be laid over the real data.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'Module C: tying the wells', body: '<ul><li>Synthetics and wavelets</li><li>Bulk shift, anchors and the time-depth record</li><li>The field wavelet</li></ul>' }) },
  ],
};
