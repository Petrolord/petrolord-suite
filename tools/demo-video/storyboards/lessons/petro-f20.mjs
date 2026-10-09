// Lesson F20: Probabilistic petrophysics, P90, P50, P10 and the tornado
// (Ekene-1, kit v2.1, feet). Dry run 2026-10-09, Module E base. Probabilistic
// dialog defaults: six parameters ticked, triangular with the Low/High values
// as 10th and 90th percentiles (grClean 13/18/23, phiShale 0.055/0.075/0.095,
// rhoMa 2.65/2.67/2.69, m 1.9/2/2.1, n 1.9/2/2.1, Rw 0.06288/0.0786/0.09825);
// 200 realisations, seed 1. Ekene Sand net pay P90 20.0, P50 28.0, P10 33.0 ft
// (truth 27.5). Tornado about the median: Rw 21.2-33.0, m 23.2-31.2, rhoMa
// 24.0-31.2, phiShale 24.5-30.0, n 25.2-30.5, grClean 27.5-30.0.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, baseParams, MODULE_E_BASE } from './common.mjs';

const Z = 'Ekene Sand';

export default {
  id: 'lesson-f20',
  ...lessonMeta(20, 'F', 'Probabilistic petrophysics: *P90, P50, P10 and the tornado*', 'From ranges to probabilities: Monte Carlo realisations of the whole interpretation, exceedance cases, and which input drives the uncertainty'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 20', chapterSub: 'Module F · Uncertainty and delivery',
      say: 'Low and high cases bracket the answer, but they do not say how likely anything is. Probabilistic petrophysics does. In this lesson we run the whole interpretation a few hundred times with inputs drawn from their ranges, and read off P ninety, P fifty and P ten, and the tornado that shows which input matters most.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 20', title: 'Probabilistic petrophysics',
        body: '<ul><li>Distributions instead of extremes</li><li>Monte Carlo realisations</li><li>P90, P50, P10</li><li>The tornado</li></ul>' }) },
    { id: 'concept', chapter: 'From ranges to probabilities',
      say: 'Give each uncertain input a distribution. Draw one value of each, run the full interpretation, and record net pay. Repeat a few hundred times. The results form a distribution of net pay. By the industry\'s exceedance convention, P ninety is the value with a ninety percent chance of being met or beaten: the low case. P fifty is the median, and P ten the high case.',
      do: async (d) => d.slide({ eyebrow: 'From ranges to probabilities', title: 'Run it hundreds of times',
        body: '<ul><li>Each realisation: one draw of every input, one full run</li><li><b>P90</b>: 90% chance of at least this much</li><li><b>P50</b>: the median; <b>P10</b>: the high case</li></ul>' }) },
    { id: 'dialog', chapter: 'Setting the ranges', chapterSub: 'Probabilistic',
      say: 'Open Probabilistic. The same six inputs are ticked, each with a triangular distribution. Note the convention here: the three values are the tenth, fiftieth and ninetieth percentiles, taken from the low, mid and high cases. R w, for example, runs zero point zero six three, zero point zero seven eight six, zero point zero nine eight.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-probabilistic'); await d.waitFor('petro-prob-dialog'); await d.sleep(800);
        await d.highlight('petro-prob-row-rw');
      } },
    { id: 'run', chapter: 'Run',
      say: 'Two hundred realisations, with a fixed seed so the result can be repeated exactly. Run. It takes a couple of seconds.',
      do: async (d) => {
        await d.unhighlight(); await d.click('petro-prob-run');
        await expectText(d, 'petro-prob-state', /200 realisations, seed 1, 6 parameters varied/, 'run state');
        await d.highlight('petro-prob-state');
      } },
    { id: 'results', chapter: 'P90, P50, P10',
      say: 'For the Ekene Sand: P ninety, twenty feet; P fifty, twenty eight; P ten, thirty three. The earth model\'s twenty seven and a half sits right beside the P fifty. And the range is narrower than the low to high bracket of twelve to thirty seven, because in a real draw the inputs rarely all land at their extremes together.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, `petro-prob-net-${Z}-p90`, /^20\.0$/, 'P90');
        await expectText(d, `petro-prob-net-${Z}-p50`, /^28\.0$/, 'P50');
        await expectText(d, `petro-prob-net-${Z}-p10`, /^33\.0$/, 'P10');
        await d.highlight(d.page.getByTestId(`petro-prob-net-${Z}-p50`).locator('xpath=ancestor::tr[1]'));
      } },
    { id: 'tornado', chapter: 'The tornado', chapterSub: 'Which input matters',
      say: 'The tornado shows how far the median moves when one input sits in its bottom or top tenth. R w dominates: twenty one to thirty three feet. Then m, and matrix density, then phi shale and n. The clean sand line barely matters. So if you have time to improve one input, improve R w: get a water sample. That is the practical value of a tornado.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, `petro-prob-tornado-${Z}`, /rw\s*21\.2 to 33\.0[\s\S]*m\s*23\.2 to 31\.2/, 'tornado');
        await d.highlight(`petro-prob-tornado-${Z}`);
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Probabilistic petrophysics draws every uncertain input from its distribution and runs the whole interpretation each time. P ninety, P fifty and P ten follow the exceedance convention. On the Ekene Sand, twenty, twenty eight and thirty three feet, with the true twenty seven and a half beside the median. And the tornado says where to spend effort: on R w. Next: interpreting the whole field at once.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Recap · Lesson 20', title: 'P90, P50, P10',
        body: '<ul><li>200 realisations, seed 1, six inputs</li><li>Ekene Sand net pay: P90 <b>20.0</b>, P50 <b>28.0</b>, P10 <b>33.0</b> ft (truth 27.5)</li><li>Tornado: R<sub>w</sub> first</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: multi-well interpretation</p>' }); } },
  ],
};
