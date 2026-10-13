// Material Balance with Petrolord, Lesson C8: aquifer models (Ekene gas-cap
// scenario). No aquifer, a pot aquifer and Carter-Tracy on the same history:
// what each does to the oil in place, and why the model has to be chosen
// from the geology and the diagnostics.
import {
  login, expectText, deleteCases, seedCase, setCarterTracy, setAquifer, runMbal, showPlot, t, tab, GASCAP, GASCAP_FILE, mbalLessonMeta,
} from './mbal-common.mjs';

const ooip = (d) => t(d, 'mbal-result-card').getByText(/^\d[\d.,]* (MMSTB|MSTB)$/).first();

export default {
  id: 'lesson-mbal-c8',
  ...mbalLessonMeta(8, 'C', 'Aquifer models: *choosing the water*', 'No aquifer, pot and Carter-Tracy on the same history'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson C8/);
    await seedCase(d, shared, 'Lesson C8: gas-cap scenario', {
      file: GASCAP_FILE, fluid: 'Oil with gas cap', c: GASCAP.c, pvt: GASCAP.pvt, reservoir: 'Ekene Sand (gas-cap scenario)',
      before: (dd) => setCarterTracy(dd, GASCAP.ct),
    });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'models', chapter: 'Four choices', chapterSub: 'None, pot, Fetkovich, Carter-Tracy',
      say: 'The Aquifer tab offers four models. None, a closed tank. A pot aquifer, small enough to follow the reservoir pressure at once. Fetkovich, a finite aquifer limited by its productivity index. And Carter-Tracy, a large radial aquifer whose response lags the pressure. Each names the published benchmark it reproduces.',
      do: async (d) => {
        await d.click(tab(d, 'Aquifer'));
        await d.sleep(1500);
        await d.click(d.page.getByRole('combobox').filter({ hasText: /Carter-Tracy/ }).first());
        await d.sleep(5000);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'none', chapter: 'Leave the water out', chapterSub: 'A closed tank',
      say: 'Choose none and run. With the water left out, the energy it supplied is read as oil, and the oil in place comes out at twenty eight point two eight million barrels, with an r squared that still looks good, nought point nine nine seven four.',
      sub: 'Choose none and run. With the water left out, the energy it supplied is read as oil, and the oil in place comes out at 28.28 million barrels, with an r² that still looks good, 0.9974.',
      do: async (d) => {
        await setAquifer(d, 'None', { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*28\.28 MMSTB[\s\S]*Regression r2\s*0\.9974/, 'no aquifer');
        await d.highlight(ooip(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'campbell',
      say: 'The Campbell plot climbs with production: the classic sign that something the model leaves out is supporting the pressure.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'campbell');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'pot', chapter: 'A pot aquifer', chapterSub: 'Instant response',
      say: 'A pot aquifer fits its own size from the data, and answers the pressure at once. This aquifer lags, so the pot cannot follow it: twenty three point four nine million barrels with an aquifer of three hundred and ninety six million reservoir barrels, an r squared of nought point seven eight, and an engine warning.',
      sub: 'A pot aquifer fits its own size from the data, and answers the pressure at once. This aquifer lags, so the pot cannot follow it: 23.49 million barrels with an aquifer of 396.1 million reservoir barrels, an r² of 0.7803, and an engine warning.',
      do: async (d) => {
        await setAquifer(d, 'Pot aquifer', { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*23\.49 MMSTB[\s\S]*Regression r2\s*0\.7803[\s\S]*Aquifer W\s*396\.1 MMRB/, 'pot');
        await d.highlight(t(d, 'mbal-result-card').locator('div.grid').first());
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'ct', chapter: 'Carter-Tracy', chapterSub: 'A large radial aquifer',
      say: 'Carter-Tracy with the aquifer described from the geology, an edge aquifer over one hundred and eighty degrees, six reservoir radii, one hundred and fifty millidarcies: eighteen million barrels, the size the scenario was built with.',
      sub: 'Carter-Tracy with the aquifer described from the geology, an edge aquifer over 180 degrees, six reservoir radii, 150 mD: 18 million barrels, the size the scenario was built with.',
      do: async (d) => {
        await setCarterTracy(d, GASCAP.ct, { onCamera: false });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*18\.00 MMSTB/, 'carter-tracy');
        await d.highlight(ooip(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'lesson', chapter: 'Choosing', chapterSub: 'Geology first, then the plots',
      say: 'Three models, three answers from the same pressures, and the closed tank, the most wrong of them, had a better r squared than the pot. The choice comes from the geology, the size and shape of the water body, and is then checked on the plots and in a history match, never picked by the best r squared.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const w = await showPlot(d, 'influx');
        await d.highlight(w);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Contacts through time',
      say: 'Next, where the water and the gas went: the contacts through time.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
