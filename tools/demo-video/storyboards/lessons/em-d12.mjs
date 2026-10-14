// Earth Modelling with Petrolord, Lesson D12: delivering the model. Save, the
// volumes CSV, the report PDF, the GRDECL for simulation, publishing a layer
// and opening it in Mapping.
import { login, expectText, openEm, logsModel, build, deleteModels, deleteSurfaces, t, emLessonMeta } from './em-common.mjs';

const NAME = 'Lesson D12: Ekene model';
const dl = async (d, id) => { const p = d.page.waitForEvent('download', { timeout: 120000 }).catch(() => null); await d.click(id); await p; await d.sleep(1500); };

export default {
  id: 'lesson-em-d12',
  ...emLessonMeta(12, 'D', 'Delivering *the model*', 'Save, the CSV and report, the GRDECL for simulation and a published layer'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^Lesson D12/);
    await deleteSurfaces(shared, /^Lesson D12/);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await logsModel(d, { sw: 'shm' });
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'save', chapter: 'Save', chapterSub: 'The definition of the model',
      say: 'Save keeps the model\'s definition: the surfaces, ties, layers, methods, contacts and the SCAL project. The grids are rebuilt from the registry on every build, so the saved model always uses the latest maps and logs. Saving again overwrites; save as a new model makes a copy.',
      do: async (d) => {
        await t(d, 'em-model-name').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-model-name'), NAME);
        await d.type(t(d, 'em-report-field'), 'Ekene');
        await d.type(t(d, 'em-report-analyst'), 'Lesson D12');
        await t(d, 'em-save-model').scrollIntoViewIfNeeded();
        await d.click('em-save-model');
        await d.sleep(2500);
      } },
    { id: 'csv', chapter: 'Volumes CSV and report', chapterSub: 'For the reviewer',
      say: 'Volumes CSV writes the tables in the chosen units, headed with the field, the analyst, the date, the build and the contacts as used. The report PDF adds the map, the ties, every flag and the provenance of each property.',
      do: async (d) => {
        await dl(d, 'em-volumes-csv');
        await dl(d, 'em-report-pdf');
        await d.highlight('em-status');
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'grdecl', chapter: 'For simulation', chapterSub: 'A corner point grid',
      say: 'GRDECL writes a corner point grid for Reservoir Simulation Studio: one cell layer per model layer, porosity, net to gross, the initial water saturation in its own include, and permeability from the logs, with the vertical permeability a tenth of the horizontal for you to check.',
      do: async (d) => {
        await dl(d, 'em-grdecl');
        await expectText(d, 'em-status', /24 x 19 x 5/, 'GRDECL dims');
        await d.highlight('em-status');
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Publish a layer', chapterSub: 'Back to the registry',
      say: 'Publish layer sends the map on screen to the shared registry. Here the porosity of the top layer: Mapping and Surface Studio can contour it and ReservoirCalc Pro can read it, and the ribbon offers both.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(800);
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(1200);
        await d.click('em-publish');
        await d.waitText('em-status', /^Published Lesson D12/, { timeout: 60000 });
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
        await d.moveTo(t(d, 'em-open-mapping'));
        await d.sleep(1500);
      } },
    { id: 'end', chapter: 'Earth Modelling with Petrolord', chapterSub: 'Twelve lessons',
      say: 'That completes the series: the framework, the rock properties, the methods and the checks, the volumes and what leaves the app. The data for every lesson is in the Ekene kit linked below.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
