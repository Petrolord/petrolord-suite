// Basin & Charge Modeling, demo 3: what the charge depends on. On the East
// kitchen model: the heat flow swept through the engine against the charge
// reaching Ekene and its factor, the age Ekene formed swept on the run
// (timing risk), and two scenarios compared side by side.
import {
  login, expectText, openBf, enterExpert, openModel, simulate, thermal, tab,
  deleteModels, seedModel, t, KITCHEN, EK1,
} from './basin-common.mjs';


export default {
  id: 'bf-03',
  app: 'Basin & Charge Modeling',
  eyebrow: 'Basin & Charge Modeling · 3 of 3',
  title: 'What the charge *depends on*',
  subtitle: 'Heat flow, trap timing and scenarios on the Ekene kitchen, every value a run of the engine',
  outroTitle: 'Basin modelling *with Petrolord*',
  outroSub: 'Basin & Charge Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await seedModel(shared, 'ek1-calibrated', EK1);
    await seedModel(shared, 'kitchen-run', KITCHEN);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, KITCHEN);
    await simulate(d);
    await t(d, 'bf-results-tab-timing').click();
    await d.sleep(1000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'What the charge depends on', chapterSub: 'The Ekene kitchen',
      say: 'The kitchen model gives Ekene thirty seven and a half million barrels of oil equivalent, three times what it holds. How firm is that? The heat flow was calibrated at Ekene-1, a few miles away, and the age each trap formed is an interpretation.',
      sub: 'The kitchen model gives Ekene 37.5 million barrels of oil equivalent, three times what it holds. How firm is that? The heat flow was calibrated at Ekene-1, a few miles away, and the age each trap formed is an interpretation.',
      do: async (d) => {
        await expectText(d, 'bf-trap-charge-0', /^37\.5$/, 'Ekene charge');
        await d.highlight(t(d, 'bf-trap-result-0'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'hf', chapter: 'Heat flow', chapterSub: 'Five runs of the engine',
      say: 'On the Sensitivity tab we vary the heat flow from fifty to sixty six milliwatts per square metre in five runs and read the charge reaching Ekene. Each value is a full run of the model.',
      sub: 'On the Sensitivity tab we vary the heat flow from 50 to 66 mW/m² in five runs and read the charge reaching Ekene. Each value is a full run of the model.',
      do: async (d) => {
        await tab(d, 'sensitivity', { onCamera: true });
        await d.type(t(d, 'bf-sens-min'), '50');
        await d.type(t(d, 'bf-sens-max'), '66');
        const ek = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-sens-output"] option')].find((o) => /Charge reaching Ekene/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-sens-output'), ek);
        await d.click(t(d, 'bf-sens-run'));
        await t(d, 'bf-sens-table').waitFor({ timeout: 180000 });
        await d.sleep(1500);
      } },
    { id: 'hf-read',
      say: 'The charge peaks near the calibrated heat flow. A cooler basin expels less: twenty nine million barrels at fifty. A hotter one expels earlier, before Ekene closed twelve million years ago, so less of it reaches the trap: about thirty one at sixty six.',
      sub: 'The charge peaks near the calibrated heat flow. A cooler basin expels less: 29.3 million barrels at 50. A hotter one expels earlier, before Ekene closed twelve million years ago, so less of it reaches the trap: about 31 at 66.',
      do: async (d) => {
        await expectText(d, 'bf-sens-table', /50\s*29\.3[\s\S]*58\s*37\.6[\s\S]*66\s*30\.8/, 'hf table');
        await d.highlight(t(d, 'bf-sens-table'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'factor',
      say: 'Read the charge factor instead, from the same runs without running again: zero point nine at every heat flow. Across the range the Ekene data allow, charge is not the risk at Ekene.',
      sub: 'Read the charge factor instead, from the same runs without running again: 0.9 at every heat flow. Across the range the Ekene data allow, charge is not the risk at Ekene.',
      do: async (d) => {
        const f = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-sens-output"] option')].find((o) => /Charge factor, Ekene/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-sens-output'), f);
        await d.sleep(3500);
        await expectText(d, 'bf-sens-table', /50\s*0\.9\s*54\s*0\.9\s*58\s*0\.9\s*62\s*0\.9\s*66\s*0\.9/, 'factor table');
      } },
    { id: 'trapage', chapter: 'Trap timing', chapterSub: 'When Ekene closed',
      say: 'Now the age Ekene formed, from the present back to twenty million years, read on the run on screen: the burial and maturity stay the same, and what moves is how much of the expulsion came after the trap.',
      do: async (d) => {
        await d.select(t(d, 'bf-sens-param'), 'trapAge');
        await d.sleep(800);
        await d.click(t(d, 'bf-sens-run'));
        await t(d, 'bf-sens-table').waitFor();
        await d.sleep(2000);
      } },
    { id: 'trapage-read',
      say: 'Timing is. Had Ekene closed only five million years ago it would catch nineteen million barrels, about half; closed ten million years ago, thirty two. Any time before fifteen million years ago it catches all thirty eight. The structural history decides how much oil the trap could have seen.',
      sub: 'Timing is. Had Ekene closed only 5 million years ago it would catch 19.4 million barrels, about half; closed 10 million years ago, 32.3. Any time before 15 million years ago it catches all 38. The structural history decides how much oil the trap could have seen.',
      do: async (d) => {
        await expectText(d, 'bf-sens-table', /0\s*0\s*5\s*19\.4\s*10\s*32\.3\s*15\s*38\.2\s*20\s*38\.2/, 'trap age table');
        await d.highlight(t(d, 'bf-sens-table'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'scenarios', chapter: 'Scenarios', chapterSub: 'Base and cool',
      say: 'Scenarios keep whole cases side by side. We save the base case, then a cool case at fifty two milliwatts per square metre, the low end of what the Ekene-1 data allow, run it and save it too.',
      sub: 'Scenarios keep whole cases side by side. We save the base case, then a cool case at 52 mW/m², the low end of what the Ekene-1 data allow, run it and save it too.',
      do: async (d) => {
        await tab(d, 'scenarios', { onCamera: true });
        await d.click(t(d, 'bf-scenario-new'));
        await d.type(t(d, 'bf-scenario-name'), 'Base, 58.5 mW/m2');
        await d.click(t(d, 'bf-scenario-save'));
        await d.sleep(800);
        await thermal(d, { hf: 52, onCamera: true });
        await simulate(d, { onCamera: true });
        await tab(d, 'scenarios', { onCamera: true });
        await d.click(t(d, 'bf-scenario-new'));
        await d.type(t(d, 'bf-scenario-name'), 'Cool, 52 mW/m2');
        await d.click(t(d, 'bf-scenario-save'));
        await d.sleep(800);
      } },
    { id: 'compare',
      say: 'Tick both to compare. The inputs that differ are marked, and each trap reads first: on the cool case Ekene takes thirty two point eight million barrels instead of thirty seven and a half, and Oboro eleven point seven instead of fourteen point three. Both keep their charge factors, zero point nine and zero point seven. For Ekene and Oboro, the charge holds up; the timing is what to defend.',
      sub: 'Tick both to compare. The inputs that differ are marked, and each trap reads first: on the cool case Ekene takes 32.8 million barrels instead of 37.5, and Oboro 11.7 instead of 14.3. Both keep their charge factors, 0.9 and 0.7. For Ekene and Oboro, the charge holds up; the timing is what to defend.',
      do: async (d) => {
        const ids = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid^="bf-scenario-pick-"]')].map((e) => e.dataset.testid));
        for (const id of ids.slice(0, 2)) { await d.click(t(d, id)); await d.sleep(500); }
        await t(d, 'bf-scenario-compare').waitFor();
        await t(d, 'bf-scenario-compare').scrollIntoViewIfNeeded();
        await expectText(d, 'bf-compare-row-trap-Ekene', /37\.5\s*32\.8/, 'compare ekene');
        await expectText(d, 'bf-compare-row-factor-Ekene', /0\.9\s*0\.9/, 'compare ekene f');
        await expectText(d, 'bf-compare-row-trap-Oboro', /14\.3\s*11\.7/, 'compare oboro');
        await expectText(d, 'bf-compare-row-factor-Oboro', /0\.7\s*0\.7/, 'compare oboro f');
        await t(d, 'bf-compare-row-trap-Ekene').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'bf-compare-row-trap-Ekene')); await d.sleep(3000);
        await d.highlight(t(d, 'bf-compare-row-factor-Oboro')); await d.sleep(3000);
        await d.unhighlight();
      } },
  ],
};
