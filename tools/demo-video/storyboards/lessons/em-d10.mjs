// Earth Modelling with Petrolord, Lesson D10: reconciling with ReservoirCalc
// Pro (3D grid upgrade, 2026-10-17). The booked case typed into the fine grid
// (12.09 MMstb, within half a percent: smaller cells and the traced edge);
// on the maps' own 100 m nodes the model gives RCP's numbers exactly (18,058
// acre-ft, 418 acres, 12.14 MMstb); the leg averages; Prospect to RCP.
import { login, expectText, openEm, stackEkene, fluids, methods, typedBooked, build, results, t, vol, emLessonMeta } from './em-common.mjs';

const rcpCard = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

export default {
  id: 'lesson-em-d10',
  ...emLessonMeta(10, 'D', 'Reconciling with *ReservoirCalc Pro*', 'The booked case on the fine grid and on the map cells: why the numbers agree, and by how much'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Two apps, one field', chapterSub: 'They must agree on the same inputs',
      say: 'ReservoirCalc Pro and Earth Modeling read the same registry maps. On the same inputs they must give the same volume, or one of them is wrong. Typed value puts a single number in every cell, so we type the booked values: net to gross zero point eight, porosity zero point two, water saturation zero point three five.',
      do: async (d) => {
        await methods(d, { phi: 'typed', sw: 'typed', ntg: 'typed' }, { onCamera: true });
        await t(d, 'em-typed').scrollIntoViewIfNeeded();
        await typedBooked(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'fine', chapter: 'On the fine grid', chapterSub: 'Within half a percent',
      say: 'On the fine grid the oil in place is twelve point zero nine million barrels, against the booked twelve point one four: within half a percent. The rock above the contact is seventeen thousand nine hundred and seventy seven acre feet.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.088$/, 'fine STOIIP');
        await expectText(d, vol(d, 'total', 'hcbulk'), /^17977\.1$/, 'fine HC bulk');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'whydiff', chapter: 'Where the half percent goes', chapterSub: 'The edge and the cell',
      say: 'The difference is the edge. ReservoirCalc Pro counts each mapped node as a whole hundred metre cell, a staircase along the edge of the six well map. The fine grid traces that edge straight, halfway past the last node, and cuts its corners. The tests in the Suite hold the two within one percent.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(4000);
      } },
    { id: 'nodes', chapter: 'On the map cells', chapterSub: 'The same cells as ReservoirCalc Pro',
      say: 'To compare cell for cell, clear the cell size, choose node cells and untick the fine grid, then build.',
      do: async (d) => {
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-frame-cell'), '');
        await d.select(t(d, 'em-frame-edge'), 'nodes');
        await d.click(t(d, 'em-grid-on'));
        await build(d, { onCamera: true });
      } },
    { id: 'same', chapter: 'The same numbers', chapterSub: 'Cell by cell',
      say: 'Eighteen thousand and fifty eight acre feet of rock above the contact, over four hundred and eighteen acres, and twelve point one four million barrels. Both apps now sum the same cells, so the numbers agree to the last figure ReservoirCalc Pro prints.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'hcarea'), /^418$/, 'HC area');
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.142$/, 'booked STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'avg', chapter: 'The leg averages', chapterSub: 'What a single tank needs',
      say: 'Under the table, the averages over the oil leg are the numbers a single tank calculation needs to give this volume. Here they are the booked values back. For a model built from the logs, they are what to set beside the booking, property by property.',
      do: async (d) => {
        await expectText(d, t(d, 'em-hcavg-ekene-sand'), /NTG 0\.800, porosity 0\.200, Sw 0\.350/, 'leg averages');
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'waterfall', chapter: 'From the booking to the grid', chapterSub: 'Why the 3D model holds less',
      say: 'The 3D model in the other videos holds ten point three one million barrels, from the same maps. One change at a time from the booking: the fine grid gives twelve point zero nine; net to gross from the logs adds two point eight two; the simulated porosity takes away zero point eight one; the logs\' water saturation takes away three point two, the transition zone; and splitting the sand into three zones takes away zero point five nine. Each number can be checked, and the team decides which inputs to book.',
      do: async (d) => {
        await d.callout('waterfall', t(d, 'em-vol-ekene-sand'), 'Booked 12.14 · fine grid 12.09 · NTG from the logs +2.82 · simulated porosity -0.81 · Sw from the logs -3.20 · three zones -0.59 · 3D grid 10.31 MMstb', 'right');
        await d.sleep(12000);
        await d.clearCallouts();
      } },
    { id: 'prospect', chapter: 'Prospect to RCP', chapterSub: 'The zone carried across',
      say: 'Prospect to R C P opens ReservoirCalc Pro with the zone: the area with oil, the average column over it, and the properties that keep the model\'s pore volume. Its card reads the same twelve point one four million barrels, eighteen thousand and fifty eight acre feet and four hundred and eighteen acres.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, rcpCard(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'RCP card');
        await d.highlight(rcpCard(d));
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
