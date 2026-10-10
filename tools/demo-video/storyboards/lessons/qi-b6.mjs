// QI lesson B6: the AI against Vp/Vs crossplot, template lines and rock models.
// Figures from the 2026-10-10 probe (kit v3, Ekene-1, Ekene Sand, scenario as
// left by lesson B5): 210 in situ and 196 substituted points; soft sand fits
// the water-bearing samples best at n 10 (RMS 158 m/s over 79 samples); stiff
// sand's best n 4 misfits by 792 m/s at the edge of the search.
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openRpsWell, ZONE_LABEL } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const chart = (d) => d.page.locator('[data-testid="rp-crossplot-panel"] [data-canvas="chart"]').first();

export default {
  id: 'lesson-qi-b6',
  ...qiLessonMeta(6, 'B', 'Crossplots and rock models: *where oil, brine and shale fall*', 'Acoustic impedance against Vp/Vs on Ekene-1, template lines, and choosing the rock model that fits the wet sand'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openRpsWell(d, shared, 'Ekene-1');
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 6', chapterSub: 'Module B · Rock physics first',
      say: 'Last lesson put a number on the fluid effect: oil to brine moves impedance and Vp over Vs by a few percent. A crossplot shows the same thing for every sample at once, and shows whether fluid and lithology can be told apart, which is the real question.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 6', title: 'Crossplots and rock models',
        body: '<ul><li><b>AI</b> against <b>Vp/Vs</b>, every sample</li><li>Can fluid and lithology be told apart?</li><li>Rock models: which physics fits this sand?</li></ul>' }) },
    { id: 'axes', chapter: 'The crossplot', chapterSub: 'AI against Vp/Vs',
      say: 'On impedance against Vp over Vs, compaction and cement push rock to the right, to higher impedance. Shale sits high, with a large velocity ratio. Hydrocarbons pull sand down and to the left: lower impedance and a lower ratio, gas far more than oil.',
      do: async (d) => d.slide({ eyebrow: 'The crossplot', title: 'Reading AI against Vp/Vs',
        body: '<ul><li>Right: compaction, cement</li><li>Up: shale, high Vp/Vs</li><li>Down and left: hydrocarbons, gas most</li></ul>' }) },
    { id: 'plot', chapter: 'Ekene-1', chapterSub: 'Rock Physics Studio · Crossplot',
      say: 'Here is the Ekene Sand on Ekene one, two hundred and ten samples coloured by water saturation, blue for low saturation and red for water. The oil sand, in blue, sits at low impedance and a Vp over Vs near one point seven five. The water leg, in red, sits to the right at higher impedance. The red points high on the left, above two, are the shaly samples.',
      sub: 'Here is the Ekene Sand on Ekene-1, 210 samples coloured by water saturation, blue for low saturation and red for water. The oil sand, in blue, sits at low impedance and a Vp/Vs near 1.75. The water leg, in red, sits to the right at higher impedance. The red points high on the left, above 2, are the shaly samples.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('rp-view-crossplot');
        await d.select('rp-xplot-zone', { label: ZONE_LABEL });
        await d.select('rp-xplot-color', { label: 'Sw' });
        await expectText(d, 'rp-xplot-summary', /Ekene Sand: 210 in situ and 196 substituted points/, 'point counts');
        await d.highlight(chart(d));
      } },
    { id: 'substituted',
      say: 'The orange diamonds are the same samples after the fluid substitution of the last lesson. Each oil sample moves up and to the right, towards the water leg. The distance it moves is the fluid effect the seismic has to see.',
      do: async (d) => { await d.highlight(chart(d)); } },
    { id: 'templates', chapter: 'Template lines', chapterSub: 'What brine sand should look like',
      say: 'Template lines show where clean sand should plot as its porosity changes: the blue line for brine sand, and the dotted mudrock line for shale. The default model is Nur\'s critical porosity. But a template is only useful if its physics fits this sand.',
      do: async (d) => { await d.unhighlight(); await d.highlight('rp-xplot-model'); } },
    { id: 'models',
      say: 'Rock models describe how grains are held together. Soft sand is an uncemented grain pack, stiffening only with pressure: young, friable deltaic sand. Stiff sand fills the space with the hardest possible arrangement. Constant cement adds a fixed amount of grain-contact cement.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Rock models', title: 'How the grains are held together',
          body: '<ul><li><b>Soft sand</b>: Hertz-Mindlin pack, lower bound</li><li><b>Stiff sand</b>: Hertz-Mindlin pack, upper bound</li><li><b>Constant cement</b>: contact cement, Dvorkin-Nur</li><li>Coordination number <b>n</b>: grain contacts</li></ul>' });
      } },
    { id: 'soft', chapter: 'Which model fits?', chapterSub: 'Calibrated on the wet samples',
      say: 'Rock Physics Studio can calibrate a model on the zone\'s water-bearing samples. Soft sand, fitting the coordination number: the best is ten, with a misfit of a hundred and fifty eight metres per second over seventy nine samples.',
      sub: 'Rock Physics Studio can calibrate a model on the zone\'s water-bearing samples. Soft sand, fitting the coordination number: the best is 10, with a misfit of 158 m/s over 79 samples.',
      do: async (d) => {
        await d.hideSlide();
        await d.select('rp-xplot-model', { label: 'Soft sand (friable)' });
        await d.click('rp-xplot-fit');
        await expectText(d, 'rp-xplot-fit-result', /Best n 10: RMS misfit 158 m\/s over 79 water-bearing samples\.$/, 'soft sand fit');
        await d.highlight('rp-xplot-fit-result');
      } },
    { id: 'stiff',
      say: 'Stiff sand: the best coordination number is four, at the very end of the search, and the misfit is seven hundred and ninety two metres per second. The app says so: this model does not suit the zone. The Ekene Sand behaves like young, uncemented deltaic sand, which is what the geology says too.',
      sub: 'Stiff sand: the best coordination number is 4, at the very end of the search, and the misfit is 792 m/s. The app says so: this model does not suit the zone. The Ekene Sand behaves like young, uncemented deltaic sand, which is what the geology says too.',
      do: async (d) => {
        await d.unhighlight();
        await d.select('rp-xplot-model', { label: 'Stiff sand' });
        await d.click('rp-xplot-fit');
        await expectText(d, 'rp-xplot-fit-result', /Best n 4: RMS misfit 792 m\/s[\s\S]*may not suit this zone/, 'stiff sand fit');
        await d.highlight('rp-xplot-fit-result');
      } },
    { id: 'back',
      say: 'Back on the soft sand model, the brine line runs along the water leg, and the oil samples fall below it: that gap is the oil\'s signature. A rock model that fits is what lets us predict rock we have not drilled: a different porosity, a different fluid, the flank of the structure.',
      do: async (d) => {
        await d.unhighlight();
        await d.select('rp-xplot-model', { label: 'Soft sand (friable)' });
        await d.click('rp-xplot-fit');
      } },
    { id: 'next',
      say: 'Next lesson takes the rock physics to the seismic: modelled AVO at the top of the Ekene Sand, the wet trend, and the gather each well publishes for QI Studio.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Modelled AVO', body: '<ul><li>Intercept, gradient and class</li><li>Oil against brine at the top Ekene</li><li>The published gather per well</li></ul>' });
      } },
  ],
};
