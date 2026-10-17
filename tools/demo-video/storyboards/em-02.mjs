// Earth Modeling, demo 2: checking the model against ReservoirCalc Pro
// (3D grid upgrade, 2026-10-17). The booked case typed into the fine grid
// gives 12.09 MMstb, within half a percent of the booking; on the maps' own
// 100 m nodes, the cells ReservoirCalc Pro sums, it gives RCP's 12.14 exactly
// (18,058 acre-ft over 418 acres); Prospect to RCP carries it across; then
// the grid from the logs, and Sw from the SCAL saturation-height function.
import {
  login, expectText, openEm, stackEkene, fluids, methods, typedBooked, build, results, zonesAndCap, t, vol,
} from './em-common.mjs';

const rcpCard = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

export default {
  id: 'em-02',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 2 of 3',
  title: 'Checking the model against *ReservoirCalc Pro*',
  subtitle: 'The booked Ekene case on the fine grid and on the map cells, then the properties the logs and the capillary pressure give',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The booked number', chapterSub: '12.14 million barrels in ReservoirCalc Pro',
      say: 'ReservoirCalc Pro books the Ekene Sand at twelve point one four million stock tank barrels, from the same top and base maps, the contact at five thousand and thirty six feet, and the values the team signed off. Before a static model replaces that number, it should give it back on the same inputs.',
      sub: 'ReservoirCalc Pro books the Ekene Sand at 12.14 million stock tank barrels, from the same top and base maps, the contact at 5,036 ft, and the values the team signed off. Before a static model replaces that number, it should give it back on the same inputs.',
      do: async (d) => {
        await d.highlight(t(d, 'em-stack-0').locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'typed', chapter: 'The same inputs', chapterSub: 'Typed booked values',
      say: 'So we type the booked values into every cell: net to gross zero point eight, porosity zero point two and water saturation zero point three five, with Bo of one point two. Then build the grid.',
      sub: 'So we type the booked values into every cell: net-to-gross 0.8, porosity 0.2 and water saturation 0.35, with Bo of 1.2. Then build the grid.',
      do: async (d) => {
        await methods(d, { phi: 'typed', sw: 'typed', ntg: 'typed' }, { onCamera: true });
        await t(d, 'em-typed').scrollIntoViewIfNeeded();
        await typedBooked(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'fine', chapter: 'On the fine grid', chapterSub: 'Within half a percent',
      say: 'On the twenty five metre grid the oil in place is twelve point zero nine million barrels, within half a percent of the booking. Its cells are sixteen times smaller than the map\'s, and its edge is traced along the limit of the mapped data, where the map\'s own cells step.',
      sub: 'On the 25 m grid the oil in place is 12.09 million barrels, within half a percent of the booking. Its cells are sixteen times smaller than the map\'s, and its edge is traced along the limit of the mapped data, where the map\'s own cells step.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.088$/, 'fine STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'nodes', chapter: 'On the map cells', chapterSub: 'The cells ReservoirCalc Pro sums',
      say: 'ReservoirCalc Pro sums the map\'s own hundred metre cells. Clearing the cell size, choosing node cells and unticking the fine grid builds the model on those cells.',
      sub: 'ReservoirCalc Pro sums the map\'s own 100 m cells. Clearing the cell size, choosing node cells and unticking the fine grid builds the model on those cells.',
      do: async (d) => {
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-frame-cell'), '');
        await d.select(t(d, 'em-frame-edge'), 'nodes');
        await d.click(t(d, 'em-grid-on'));
        await build(d, { onCamera: true });
      } },
    { id: 'same', chapter: 'The same answer', chapterSub: 'Rock, area and oil',
      say: 'Now the rock above the contact is eighteen thousand and fifty eight acre feet over four hundred and eighteen acres, and the oil in place is twelve point one four million barrels: ReservoirCalc Pro\'s numbers exactly, because both apps sum the same cells.',
      sub: 'Now the rock above the contact is 18,058 acre-feet over 418 acres, and the oil in place is 12.14 million barrels: ReservoirCalc Pro\'s numbers exactly, because both apps sum the same cells.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'hcarea'), /^418$/, 'HC area');
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.142$/, 'booked STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'prospect', chapter: 'Prospect to ReservoirCalc Pro', chapterSub: 'The zone carried across',
      say: 'Prospect to R C P carries the zone across: the area with oil, the average column, and the properties that keep the model\'s pore volume. ReservoirCalc Pro opens with the same twelve point one four million barrels over the same four hundred and eighteen acres.',
      sub: 'Prospect to RCP carries the zone across: the area with oil, the average column, and the properties that keep the model\'s pore volume. ReservoirCalc Pro opens with the same 12.14 million barrels over the same 418 acres.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, rcpCard(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'RCP card');
        await d.highlight(rcpCard(d));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'back', chapter: 'From the logs', chapterSub: 'The 3D grid speaks',
      say: 'Back in Earth Modeling we build the full grid from what the wells measured: the sand in Upper, Middle and Lower zones under the cap, the logs upscaled into two and a half foot cells, simulated porosity, kriged net to gross, and water saturation by inverse distance.',
      do: async (d) => {
        await d.page.goBack({ waitUntil: 'domcontentloaded' });
        await t(d, `em-add-${'Ekene Sand top (6-well map)'}`).waitFor({ timeout: 120000 });
        await d.sleep(1500);
        if (!(await t(d, 'em-stack-0').count())) { await stackEkene(d); await fluids(d); }
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-frame-cell'), '25');
        await d.select(t(d, 'em-frame-edge'), 'smooth');
        if (!(await t(d, 'em-grid-on').isChecked())) await d.click(t(d, 'em-grid-on'));
        await zonesAndCap(d, { onCamera: true });
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await methods(d, { phi: 'sgs', ntg: 'okrige', sw: 'idw' }, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'logs', chapter: 'Why it moves', chapterSub: 'From the booking to the grid',
      say: 'Now the field holds ten point three one million barrels, against the booked twelve point one four. One change at a time: the fine grid itself gives twelve point zero nine. Net to gross from the logs, nearly all of the sand against the booked zero point eight, adds two point eight two million barrels. The simulated porosity takes away zero point eight one, and the logs\' water saturation takes away three point two. Splitting the sand at its shale breaks, with the Lower zone below the contact, moves it another zero point five nine.',
      sub: 'Now the field holds 10.31 million barrels, against the booked 12.14. One change at a time: the fine grid itself gives 12.09. Net-to-gross from the logs, nearly all of the sand against the booked 0.8, adds 2.82 million barrels. The simulated porosity takes away 0.81, and the logs\' water saturation takes away 3.2. Splitting the sand at its shale breaks, with the Lower zone below the contact, moves it another 0.59.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.31 MMstb[\s\S]*0\.006\.064\.240\.00/, 'logs volumes');
        await d.callout('waterfall', t(d, 'em-chart-volumes'), 'Booked 12.14 · fine grid 12.09 · NTG from the logs +2.82 · simulated porosity -0.81 · Sw from the logs -3.20 · three zones -0.59 · grid 10.31 MMstb', 'right');
        await d.highlight('em-chart-volumes');
        await d.sleep(9000);
        await d.unhighlight();
        await d.clearCallouts();
      } },
    { id: 'avg', chapter: 'The leg averages', chapterSub: 'Against the booking',
      say: 'In the Details tab, under each zone\'s table, are the averages over the oil leg. In the Upper sand the logs give net to gross zero point nine seven, porosity zero point one nine and water saturation zero point four six, against the booked zero point eight, zero point two and zero point three five. The difference is the water: the column is only sixty seven feet, much of it transition zone.',
      sub: 'In the Details tab, under each zone\'s table, are the averages over the oil leg. In the Upper sand the logs give net-to-gross 0.97, porosity 0.19 and water saturation 0.46, against the booked 0.8, 0.2 and 0.35. The difference is the water: the column is only 67 ft, much of it transition zone.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-hcavg-ekene-sand-upper').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-hcavg-ekene-sand-upper'), /NTG 0\.972, porosity 0\.193, Sw 0\.456/, 'upper leg averages');
        await d.highlight(t(d, 'em-hcavg-ekene-sand-upper'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'shm', chapter: 'Sw from capillary pressure', chapterSub: 'The SCAL Studio J function',
      say: 'Saturation height checks it from capillary pressure. It reads the J function fitted in SCAL Studio, with its free water level at five thousand and forty six feet, and gives every cell the water saturation for its height above that level.',
      sub: 'Saturation height checks it from capillary pressure. It reads the J function fitted in SCAL Studio, with its free-water level at 5,046 ft, and gives every cell the water saturation for its height above that level.',
      do: async (d) => {
        await methods(d, { sw: 'shm' }, { onCamera: true });
        await d.sleep(600);
        const sel = t(d, 'em-shm-project');
        await sel.scrollIntoViewIfNeeded();
        const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
        await d.select(sel, v);
        await build(d, { onCamera: true });
      } },
    { id: 'shmresult', chapter: 'The reconciliation', chapterSub: 'Every difference on the screen',
      say: 'The J function gives nine point five nine million barrels, close to the logs. The two apps agree exactly on the same inputs, and the model shows which inputs move the number, so the team can choose them with the evidence in front of them.',
      sub: 'The J function gives 9.59 million barrels, close to the logs. The two apps agree exactly on the same inputs, and the model shows which inputs move the number, so the team can choose them with the evidence in front of them.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 9\.59 MMstb[\s\S]*0\.006\.023\.570\.00/, 'SHM volumes');
        await d.highlight('em-chart-volumes');
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
