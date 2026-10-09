// Lesson F19: Low, mid and high cases (Ekene-1, kit v2.1, feet). Dry run
// 2026-10-09, Module E base (Ekene Sand net pay 27.5 ft, truth 27.5). The
// Low/High dialog's cases: Low grClean 13, phiShale 0.095, rhoMa 2.65, m 2.1,
// n 2.1, Rw 0.09825; High grClean 23, phiShale 0.055, rhoMa 2.69, m 1.9, n 1.9,
// Rw 0.06288. Ekene Sand net pay Low 12.0, Mid 27.5, High 37.0 ft; Oboro Sand
// 176.5, 180.0, 186.0.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, baseParams, MODULE_E_BASE, zoomTracksAt } from './common.mjs';

const Z = 'Ekene Sand';

export default {
  id: 'lesson-f19',
  ...lessonMeta(19, 'F', 'Low, mid and high cases: *putting a range on net pay*', 'Every input has a range: building deterministic low and high cases, reading them, and what they leave out'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 19', chapterSub: 'Module F · Uncertainty and delivery',
      say: 'Welcome to Module F, the last module. So far every answer has been one number. But every input behind it, from the clean sand line to R w, was a choice with a range. In this lesson we put a range on net pay with low, mid and high cases.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 19', title: 'Low, mid and high cases',
        body: '<ul><li>Every input has a range</li><li>Building the low and high cases</li><li>Reading the spread</li><li>What the cases leave out</li></ul>' }) },
    { id: 'concept', chapter: 'Every input has a range',
      say: 'The mid case is your best estimate: here, the interpretation built through Modules C to E. The low case takes every input to its pessimistic end at once, and the high case to its optimistic end. Each case is an ordinary run of the same workflow, so every number can be traced to the column it came from.',
      do: async (d) => d.slide({ eyebrow: 'Every input has a range', title: 'Three ordinary runs',
        body: '<ul><li><b>Mid</b>: the best estimate</li><li><b>Low</b>: every input at its pessimistic end</li><li><b>High</b>: every input at its optimistic end</li></ul>' }) },
    { id: 'dialog', chapter: 'Building the cases', chapterSub: 'Low/High',
      say: 'Open Low and High. Mid is the current parameter set; the low and high columns are edits over it. The studio proposes six: the clean sand line, phi shale, matrix density, m, n and R w, each moved by a typical amount. R w, for example, moves a quarter either way: zero point zero nine eight in the low case, zero point zero six three in the high. Edit any cell to your own field\'s ranges.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-scenarios'); await d.waitFor('petro-scenarios-dialog'); await d.sleep(800);
        await expectText(d, 'petro-scenarios-summary', /low changes 6, high changes 6/, 'six changes');
        await d.highlight('petro-scenarios-summary');
      } },
    { id: 'results', chapter: 'Reading the spread',
      say: 'For the Ekene Sand, net pay is twelve feet in the low case, twenty seven and a half in the mid case, and thirty seven in the high. The low case is less than half the mid. The Oboro gas sand barely moves, one hundred and seventy six and a half to one hundred and eighty six feet, because a thick, clean, high-resistivity gas sand passes the cutoffs whatever the inputs.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, `petro-sc-net-${Z}-low`, /^12\.0$/, 'low');
        await expectText(d, `petro-sc-net-${Z}-mid`, /^27\.5$/, 'mid');
        await expectText(d, `petro-sc-net-${Z}-high`, /^37\.0$/, 'high');
        await expectText(d, 'petro-sc-net-Oboro Sand-low', /^176\.5$/, 'Oboro low');
        await d.highlight(d.page.getByTestId(`petro-sc-net-${Z}-mid`).locator('xpath=ancestor::tbody[1]'));
      } },
    { id: 'bands', chapter: 'On the tracks',
      say: 'Apply draws the three cases as bands on the tracks. Zoom onto the Ekene Sand: the spread in water saturation is widest in the shalier beds, exactly where the pay decision is closest.',
      do: async (d, shared) => {
        await d.unhighlight(); await d.click('petro-scenarios-apply'); await d.sleep(1200);
        shared.values.g = await zoomTracksAt(d, 5110, 12);
      } },
    { id: 'limits', chapter: 'What the cases leave out',
      say: 'Two cautions. The low and high cases stack every pessimistic, or every optimistic, choice at the same time, which is unlikely: they bracket the answer, but say nothing about how likely each end is. And the cases are only as good as the ranges: a range taken from habit gives a false sense of precision, so take ranges from data. The next lesson turns ranges into probabilities.',
      do: async (d) => d.slide({ eyebrow: 'What the cases leave out', title: 'A bracket with no odds',
        body: '<ul><li>Every input at its extreme together is unlikely</li><li>No likelihood for either end</li><li>Ranges should come from data</li></ul>' }) },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Low, mid and high cases move every input to its pessimistic or optimistic end at once, as ordinary runs you can trace. On the Ekene Sand, net pay runs from twelve to thirty seven feet around a mid case of twenty seven and a half, the true figure. Next: probabilistic petrophysics, P ninety, P fifty and P ten.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 19', title: 'Low, mid and high',
        body: '<ul><li>Six inputs moved together</li><li>Ekene Sand net pay: <b>12.0</b>, <b>27.5</b>, <b>37.0</b> ft (truth 27.5)</li><li>A bracket with no odds attached</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: probabilistic petrophysics</p>' }) },
  ],
};
