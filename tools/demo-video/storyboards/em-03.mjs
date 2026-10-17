// Earth Modeling, demo 3: uncertainty and hand-offs (Ekene kit v4, 3D grid
// upgrade 2026-10-17). The saved grid model opened again (three zones under
// the cap, simulated porosity, Sw from the SCAL saturation-height function),
// another seed, the STOIIP tornado, the volume distribution and its
// probability curve, then what leaves the app: a published layer, the GRDECL
// with every fine layer, the report PDF with its pictures, and ReservoirCalc Pro.
import {
  login, expectText, openEm, build, deleteModels, deleteSurfaces, gridModel, saveModel, modelRow, results, t,
} from './em-common.mjs';

const NAME = 'EM demo: Ekene grid with saturation height';

export default {
  id: 'em-03',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 3 of 3',
  title: 'Uncertainty and *hand-offs*',
  subtitle: 'Seeds, the tornado, the probability curve, and the grid in Mapping, Simulation and ReservoirCalc Pro',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^EM demo: Ekene (grid|model) with saturation height/);
    await deleteSurfaces(shared, /^EM demo: /);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d, { sw: 'shm' });
    await saveModel(d, NAME);
    // a fresh page, so the take opens the saved model like a colleague would
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'open', chapter: 'The saved model', chapterSub: 'Opened and rebuilt from the registry',
      say: 'The Ekene grid was saved with its surfaces, its three zones under the cap, porosity simulated from the logs, and water saturation from the SCAL Studio J function. Loading it and building again reads the registry as it is today.',
      do: async (d) => {
        const row = modelRow(d, NAME);
        await row.scrollIntoViewIfNeeded();
        await d.click(row.getByRole('button', { name: 'load' }));
        await build(d, { onCamera: true });
      } },
    { id: 'base', chapter: 'One realisation', chapterSub: 'Seed 2026',
      say: 'This realisation, seed twenty twenty six, holds nine point five nine million barrels.',
      sub: 'This realisation, seed 2026, holds 9.59 million barrels.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 9\.59 MMstb[\s\S]*0\.006\.023\.570\.00/, 'base volumes');
        await d.highlight('em-chart-volumes');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'seed', chapter: 'Another seed', chapterSub: 'Equally likely',
      say: 'Another seed gives another porosity model, just as consistent with the wells. Seed seven holds ten point three five million barrels: the porosity between the wells is uncertain, and the seed shows by how much.',
      sub: 'Another seed gives another porosity model, just as consistent with the wells. Seed 7 holds 10.35 million barrels: the porosity between the wells is uncertain, and the seed shows by how much.',
      do: async (d) => {
        await t(d, 'em-sgs-seed').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-sgs-seed'), '7');
        await build(d, { onCamera: true });
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.35 MMstb[\s\S]*0\.006\.314\.040\.00/, 'seed 7 volumes');
        await d.highlight('em-chart-volumes');
        await d.sleep(2500);
        await d.unhighlight();
        await t(d, 'em-sgs-seed').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-sgs-seed'), '2026');
        await build(d, { onCamera: true });
      } },
    { id: 'tornado', chapter: 'What matters most', chapterSub: 'The STOIIP tornado',
      say: 'The tornado moves one input at a time. The contact matters most: thirty feet shallower drops the oil to four point six six million barrels, while thirty feet deeper adds almost nothing, because just below the contact is the free water level, and there the J function says the rock holds water. Water saturation comes next, eight point five one to ten point six seven, then the rock volume, porosity and net to gross.',
      sub: 'The tornado moves one input at a time. The contact matters most: 30 ft shallower drops the oil to 4.66 million barrels, while 30 ft deeper adds almost nothing, because just below the contact is the free-water level, and there the J function says the rock holds water. Water saturation comes next, 8.51 to 10.67, then the rock volume, porosity and net-to-gross.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-tornado').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-tornado'), /Base 9\.59 MMstb[\s\S]*Contact: 4\.66 to\s*9\.61[\s\S]*Sw: 8\.51 to\s*10\.67/, 'tornado');
        await d.highlight('em-chart-tornado');
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'mc', chapter: 'The volume distribution', chapterSub: 'Monte Carlo on the grid',
      say: 'The volume distribution runs the grid two hundred times with the Suite\'s Monte Carlo sampler: the contact within thirty feet either way, Bo within five percent and porosity within five percent, with one draw per trial for all three zones, because they share the contact.',
      do: async (d) => {
        await t(d, 'em-dist').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-dist'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('em-dist-run');
        await t(d, 'em-dist-table').waitFor({ timeout: 300000 });
        await d.sleep(800);
      } },
    { id: 'curve', chapter: 'The probability curve', chapterSub: 'P90, P50 and P10',
      say: 'The curve gives the chance the field holds at least each volume. P ninety, the low case, is seven point six five million barrels, P fifty nine point three six and P ten nine point eight six. The base case, nine point five nine, sits between P fifty and P ten, and the curve leans low: as the tornado showed, a shallower contact costs far more oil than a deeper one adds.',
      sub: 'The curve gives the chance the field holds at least each volume. P90, the low case, is 7.65 million barrels, P50 9.36 and P10 9.86. The base case, 9.59, sits between P50 and P10, and the curve leans low: as the tornado showed, a shallower contact costs far more oil than a deeper one adds.',
      do: async (d) => {
        await t(d, 'em-chart-probability').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-probability'), /P90 7\.65, P50 9\.36, P10 9\.86 MMstb/, 'probability');
        await d.highlight('em-chart-probability');
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Hand-offs', chapterSub: 'Mapping, Simulation, ReservoirCalc Pro',
      say: 'What the model makes, other apps can use. Publish layer sends the porosity of a layer to the shared registry, where Mapping and Surface Studio and ReservoirCalc Pro can open it.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(1200);
        await d.select(t(d, 'em-map-zone'), '1');
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(1500);
        await d.click('em-publish');
        await d.waitText('em-status', /^Published /, { timeout: 60000 });
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'grdecl',
      say: 'GRDECL writes the grid for Reservoir Simulation Studio with every fine layer: ninety nine by seventy nine columns and sixty one layers, a hundred and eighty six thousand nine hundred and four active cells, with porosity, net to gross, the initial water saturation and permeability.',
      sub: 'GRDECL writes the grid for Reservoir Simulation Studio with every fine layer: 99 by 79 columns and 61 layers, 186,904 active cells, with porosity, net-to-gross, the initial water saturation and permeability.',
      do: async (d) => {
        const dl = d.page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
        await d.click('em-grdecl');
        await dl;
        await expectText(d, 'em-status', /99 x 79 x 61, 186904 active cells/, 'GRDECL dims');
        await d.highlight('em-status');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'report',
      say: 'The report PDF is the record a reviewer signs: the volumes, the contacts as used, every flag, the provenance of every property, and the pictures of the grid, the player and the charts.',
      do: async (d) => {
        const dl = d.page.waitForEvent('download', { timeout: 180000 }).catch(() => null);
        await d.click('em-report-pdf');
        await dl;
        await d.waitText('em-status', /^Model report exported/, { timeout: 60000 }).catch(() => {});
        await d.sleep(1500);
      } },
    { id: 'rcp',
      say: 'And Prospect to R C P opens ReservoirCalc Pro with the zone on the map, the Upper sand, filled in: its six point zero two million barrels reproduced, and a note of where every input came from.',
      sub: 'And Prospect to RCP opens ReservoirCalc Pro with the zone on the map, the Upper sand, filled in: its 6.02 million barrels reproduced, and a note of where every input came from.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, t(d, 'rcp-stooip'), /6\.02 MM/, 'RCP STOIIP');
        await d.highlight(t(d, 'rcp-em-prospect'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
