// Earth Modelling with Petrolord, Lesson D12: delivering the model (3D grid
// upgrade, 2026-10-17). Save, the report PDF with its pictures, the volumes
// CSV, the GRDECL with every fine layer and permeability, a published layer.
import { login, expectText, openEm, gridModel, build, deleteModels, deleteSurfaces, t, emLessonMeta } from './em-common.mjs';

const NAME = 'Lesson D12: Ekene grid';
const dl = async (d, id) => { const p = d.page.waitForEvent('download', { timeout: 180000 }).catch(() => null); await d.click(id); await p; await d.sleep(1500); };

export default {
  id: 'lesson-em-d12',
  ...emLessonMeta(12, 'D', 'Delivering *the model*', 'Save, the report PDF with its pictures, the volumes CSV, the fine-layer GRDECL and a published layer'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^Lesson D12/);
    await deleteSurfaces(shared, /^Lesson D12/);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d, { sw: 'shm' });
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'save', chapter: 'Save', chapterSub: 'The definition, not the grids',
      say: 'Save keeps the model definition: the surfaces and ties, the zones and the cap, the grid, the methods with the seed, and the contact. The grid is rebuilt from the registry when it opens, so it always reads the latest interpretation, and the seed makes it the same model.',
      do: async (d) => {
        await t(d, 'em-model-name').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-model-name'), NAME);
        await d.click('em-save-model');
        await d.waitText('em-status', /^Saved model/, { timeout: 60000 });
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'report', chapter: 'The report PDF', chapterSub: 'What a reviewer signs',
      say: 'The report PDF gathers what a reviewer signs: the volumes, the contacts as used, every flag, the provenance of each property, the grid and the simulation settings, and the pictures. It steps through the 3D window, the player and the charts to take them.',
      do: async (d) => {
        await dl(d, 'em-report-pdf');
        await expectText(d, 'em-status', /exported as Lesson_D12_Ekene_grid-report\.pdf with 8 pictures/, 'report');
        await d.highlight('em-status');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'csv', chapter: 'The volumes CSV', chapterSub: 'Every zone and block',
      say: 'Volumes CSV writes every zone\'s volumes in the chosen units with a reviewer header: field, analyst, date, build, datum, contacts and formation volume factors.',
      do: async (d) => {
        await dl(d, 'em-volumes-csv');
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'grdecl', chapter: 'GRDECL for simulation', chapterSub: 'Every fine layer',
      say: 'GRDECL writes the corner point grid for Reservoir Simulation Studio with every fine layer: ninety nine by seventy nine columns and sixty one layers, a hundred and eighty six thousand nine hundred and four active cells, with porosity, net to gross, the modelled permeability and the initial water saturation beside it.',
      do: async (d) => {
        await dl(d, 'em-grdecl');
        await expectText(d, 'em-status', /99 x 79 x 61, 186904 active cells/, 'grdecl');
        await d.highlight('em-status');
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'publish', chapter: 'Publish a layer', chapterSub: 'To the shared registry',
      say: 'Publish layer sends what the map shows to the shared registry: here the porosity of one layer of the Upper sand. Mapping and Surface Studio and ReservoirCalc Pro open it from there.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-zone'), '1');
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(1500);
        await d.click('em-publish');
        await d.waitText('em-status', /^Published /, { timeout: 60000 });
        await d.highlight('em-status');
        await d.sleep(3000);
        await d.unhighlight();
      } },
  ],
};
