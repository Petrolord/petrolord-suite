// Basin Modelling with Petrolord, Lesson D10: traps and charge timing.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, seedModel, t, deleteModels, bfLessonMeta, fixtureWith } from './bf-common.mjs';

const NAME = 'Lesson D10: East kitchen';
export default {
  id: 'lesson-bf-d10',
  ...bfLessonMeta(10, 'D', 'Traps *and charge timing*', 'A trap by hand, the charge it takes, the factor bands and a trap that formed too late'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    const settings = { ...fixtureWith('kitchen-run', (r) => r).settings, traps: [] };
    await seedModel(shared, 'kitchen-run', NAME, { settings });
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await simulate(d);
    await resultsTab(d, 'timing');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'empty', chapter: 'Traps and charge', chapterSub: 'What a 1D model can say',
      say: 'A one-dimensional model knows how much its sources expelled per square metre, and when. To say how much reached a trap it needs four things from the interpreter: when the trap formed, the area of source that drains to it, the share that survives migration, and which source is on its path.',
      do: async (d) => { await d.highlight(t(d, 'bf-traps')); await d.sleep(5000); await d.unhighlight(); } },
    { id: 'add', chapter: 'A trap by hand', chapterSub: 'Ekene',
      say: 'Add trap. Ekene closed about twelve million years ago, once the Ogbia Shale sealed the rollover. Twenty five square kilometres of the upper source drain to it, at a migration efficiency of ten percent, and it holds twelve point one four million stock tank barrels.',
      sub: 'Add trap. Ekene closed about twelve million years ago, once the Ogbia Shale sealed the rollover. 25 km² of the upper source drain to it, at a migration efficiency of 10 %, and it holds 12.14 MMstb.',
      do: async (d) => {
        await d.click(t(d, 'bf-trap-add'));
        await d.type(t(d, 'bf-trap-name-0'), 'Ekene');
        await d.type(t(d, 'bf-trap-age-0'), '12');
        await d.type(t(d, 'bf-trap-area-0'), '25');
        const up = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-trap-src-0"] option')].find((o) => /Upper Akata/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-trap-src-0'), up);
        await d.type(t(d, 'bf-trap-vol-0'), '12.14');
        await d.select(t(d, 'bf-trap-unit-0'), 'MMstb');
        await d.sleep(1000);
      } },
    { id: 'read', chapter: 'The charge', chapterSub: 'And the factor',
      say: 'Ninety eight percent of the upper source\'s expulsion came after Ekene formed, thirty seven and a half million barrels of oil equivalent, all of it oil, three point one times what the trap holds. More than twice the fill gives a charge factor of zero point nine; one to two times, zero point seven; half to one, zero point five; less, lower still.',
      sub: '98 % of the upper source\'s expulsion came after Ekene formed, 37.5 MMboe, all of it oil, 3.1 times what the trap holds. More than twice the fill gives a charge factor of 0.9; one to two times, 0.7; half to one, 0.5; less, lower still.',
      do: async (d) => {
        await expectText(d, 'bf-trap-charge-0', /^37\.5$/, 'charge');
        await expectText(d, 'bf-trap-factor-0', /^0\.9$/, 'factor');
        await d.highlight(t(d, 'bf-trap-result-0')); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'late', chapter: 'Too late', chapterSub: 'A trap that formed after the peak',
      say: 'Now suppose the structure only closed two million years ago. Only ten percent of the expulsion comes after it: three point nine million barrels of oil equivalent, a third of what the trap holds, and the factor falls to zero point three.',
      sub: 'Now suppose the structure only closed two million years ago. Only 10 % of the expulsion comes after it: 3.92 MMboe, a third of what the trap holds, and the factor falls to 0.3.',
      do: async (d) => {
        await d.type(t(d, 'bf-trap-age-0'), '2');
        await d.sleep(1500);
        await expectText(d, 'bf-trap-result-0', /Ekene\s*10 %\s*3\.92[\s\S]*0\.32\s*0\.3/, 'late');
        await d.highlight(t(d, 'bf-trap-result-0')); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'chart', chapter: 'On the events chart', chapterSub: 'Trap against critical moment',
      say: 'The events chart draws the trap from the age it formed. Closed at two million years, it starts after the critical moment: the classic timing risk. Back to twelve, it is there long before.',
      do: async (d) => {
        await t(d, 'bf-events-chart').scrollIntoViewIfNeeded();
        await d.sleep(3000);
        await t(d, 'bf-trap-age-0').scrollIntoViewIfNeeded();
        await d.type(t(d, 'bf-trap-age-0'), '12');
        await t(d, 'bf-events-chart').scrollIntoViewIfNeeded();
        await d.sleep(3000);
      } },
  ],
};
