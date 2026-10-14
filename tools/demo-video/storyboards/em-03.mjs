// Earth Modeling, demo 3: uncertainty and hand-offs (Ekene kit v4).
// The saved model opened again (logs upscaled to five layers, kriged
// porosity and NTG, Sw from the SCAL saturation-height function), the
// kriging variance, the volume distribution, then what leaves the app: a
// published porosity layer, the GRDECL for simulation with permeability
// from the logs, the report PDF, and the zone in ReservoirCalc Pro.
import {
  login, expectText, openEm, build, deleteModels, deleteSurfaces, logsModel, saveModel, modelRow, t, vol,
} from './em-common.mjs';

const NAME = 'EM demo: Ekene model with saturation height';

export default {
  id: 'em-03',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 3 of 3',
  title: 'Uncertainty and *hand-offs*',
  subtitle: 'The kriging variance, the volume distribution, and the model in Mapping, Simulation and ReservoirCalc Pro',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^EM demo: Ekene model with saturation height/);
    await deleteSurfaces(shared, /^EM demo: /);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await logsModel(d, { sw: 'shm' });
    await saveModel(d, NAME);
    // a fresh page, so the take opens the saved model like a colleague would
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'open', chapter: 'The saved model', chapterSub: 'Opened and rebuilt from the registry',
      say: 'The Ekene model was saved with its surfaces, its five layers from the logs, kriged porosity and net to gross, and water saturation from the SCAL Studio J function. Loading it and building again reads the registry as it is today.',
      do: async (d) => {
        const row = modelRow(d, NAME);
        await row.scrollIntoViewIfNeeded();
        await d.click(row.getByRole('button', { name: 'load' }));
        await d.sleep(1500);
        await build(d, { onCamera: true });
      } },
    { id: 'variance', chapter: 'How sure is the model?', chapterSub: 'The kriging variance',
      say: 'Kriging also says how sure it is. The variance of the porosity in the top layer is lowest at the four wells and grows away from them, out towards the edge of the mapped area.',
      do: async (d) => {
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(800);
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'phi_var');
        await d.sleep(4000);
      } },
    { id: 'mc', chapter: 'The volume distribution', chapterSub: 'Monte Carlo on the model',
      say: 'The volume distribution runs the model five hundred times with the Suite\'s Monte Carlo sampler: the contact within thirty feet either way, Bo within five percent, and the kriged properties moved by their own uncertainty.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-dist').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-dist'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('em-dist-run');
        await t(d, 'em-dist-table').waitFor({ timeout: 300000 });
        await d.sleep(800);
      } },
    { id: 'mcresult',
      say: 'P ninety is the low case and P ten the high case: seven point eight seven million barrels at P ninety, ten point two four at P fifty and eleven point four at P ten. The low side is the longer one: a shallower contact cuts hard into a sixty seven foot oil column, while a deeper one adds little, because ten feet below the contact is the free water level, and below it the J function says the rock holds water.',
      sub: 'P90 is the low case and P10 the high case: 7.87 million barrels at P90, 10.24 at P50 and 11.40 at P10. The low side is the longer one: a shallower contact cuts hard into a 67 ft oil column, while a deeper one adds little, because 10 ft below the contact is the free-water level, and below it the J function says the rock holds water.',
      do: async (d) => {
        await t(d, 'em-dist-table').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-dist-table'), /STOIIP \(MMstb\)\s*7\.867\s*10\.241\s*11\.402/, 'MC STOIIP');
        await d.highlight(t(d, 'em-dist-table'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Hand-offs', chapterSub: 'Mapping, Simulation, ReservoirCalc Pro',
      say: 'What the model makes, other apps can use. Publish layer sends the porosity of the top layer to the shared registry, where Mapping and Surface Studio and ReservoirCalc Pro can open it.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(1200);
        await d.click('em-publish');
        await d.waitText('em-status', /^Published /, { timeout: 60000 });
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'grdecl',
      say: 'GRDECL writes the model as a corner point grid for Reservoir Simulation Studio: twenty four by nineteen columns and five layers, with porosity, net to gross, the initial water saturation, and permeability from the logs.',
      do: async (d) => {
        const dl = d.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
        await d.click('em-grdecl');
        await dl;
        await expectText(d, 'em-status', /24 x 19 x 5/, 'GRDECL dims');
        await d.highlight('em-status');
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'report',
      say: 'The report PDF is the record a reviewer signs: the volumes, the contacts as used, every flag and the provenance of every property.',
      do: async (d) => {
        const dl = d.page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
        await d.click('em-report-pdf');
        await dl;
        await d.sleep(2000);
      } },
    { id: 'rcp',
      say: 'And Prospect to R C P opens ReservoirCalc Pro with the zone filled in, the model\'s volume reproduced, and a note of where every input came from.',
      sub: 'And Prospect to RCP opens ReservoirCalc Pro with the zone filled in, the model\'s volume reproduced, and a note of where every input came from.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, t(d, 'rcp-stooip'), /10\.36 MM/, 'RCP STOIIP');
        await d.highlight(t(d, 'rcp-em-prospect'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
