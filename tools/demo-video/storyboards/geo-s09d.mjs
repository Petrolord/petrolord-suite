// Geoscience module showcase, scene 9d ("and more" montage 3/3): the burial
// history in BasinFlow Genesis, model "Basin demo: Ekene-1" (Basin demos).
import { openBf, enterExpert, openModel, simulate, resultsTab, EK1 } from './basin-common.mjs';
import { login, scene, t, park } from './geo-common.mjs';

export default {
  ...scene('geo-s09d'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, EK1);
    // saved results open without a new run (a run re-saves the Basin demos' model)
    await d.sleep(2500);
    if (!(await t(d, 'bf-results-tab-burial').count())) await simulate(d);
    await resultsTab(d, 'burial');
    const ov = t(d, 'bf-burial-overlay');
    if (await ov.count()) { const o = (await ov.locator('option').allInnerTexts()).find((x) => /Maturity/.test(x)); if (o) await ov.selectOption({ label: o }); }
    await d.sleep(2000);
    await park(d);
  },
  steps: [
    { id: 'burial', chapterSub: 'BasinFlow Genesis',
      say: 'and the burial history of the basin itself.',
      do: async (d) => { await d.sleep(1200); } },
  ],
};
