// Earth Modelling with Petrolord, Lesson C8: variograms, seeds and variance
// (3D grid upgrade, 2026-10-17). The simulation's variogram (range across
// and down the layers, nugget) and seed; another realisation; kriging's
// fitted variogram and its variance map for NTG; the property range.
import { login, expectText, openEm, stackEkene, fluids, methods, build, results, t, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-c8',
  ...emLessonMeta(8, 'C', 'Variograms, seeds *and variance*', 'The simulation\'s variogram and seed, other realisations, and how sure kriging is'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await methods(d, { phi: 'sgs', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'vario', chapter: 'The simulation\'s variogram', chapterSub: 'Across and down the layers',
      say: 'The simulation needs a variogram: how far porosity stays alike across the layers, nine hundred metres by default, and down them, ten feet. The nugget is the part that varies from one cell to the next, a tenth of the total.',
      do: async (d) => {
        await t(d, 'em-sgs').scrollIntoViewIfNeeded();
        await d.highlight('em-sgs');
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'look', chapter: 'What the variogram does', chapterSub: 'Bodies of alike porosity',
      say: 'In 3D, cut through the grid, the simulated porosity forms bodies about that wide and that thick. A shorter range makes them smaller and the porosity patchier.',
      do: async (d) => {
        await d.click('em-view-3d');
        await d.sleep(1500);
        await d.click('em-3d-ve-10');
        await d.select(t(d, 'em-3d-gridprop'), 'phi');
        await d.select(t(d, 'em-3d-mode'), 'slices');
        await d.sleep(4500);
      } },
    { id: 'seed', chapter: 'The seed', chapterSub: 'One realisation each',
      say: 'The seed picks one realisation. The same seed always gives the same model, so a saved model rebuilds exactly. Seed twenty twenty six gives ten point nine zero million barrels; seed seven gives ten point nine two.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.90 MMstb/, 'seed 2026');
        await t(d, 'em-sgs-seed').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-sgs-seed'), '7');
        await build(d, { onCamera: true });
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.92 MMstb/, 'seed 7');
        await d.highlight('em-chart-volumes');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'kriged', chapter: 'Kriging\'s variogram', chapterSub: 'Fitted from the wells',
      say: 'Net to gross is kriged. With fit from the wells ticked, its variogram comes from the wells\' own semivariogram, layer by layer, and the provenance lines give the fitted numbers.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-prov-ekene-sand-ntg').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-prov-ekene-sand-ntg'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'variance', chapter: 'How sure is kriging?', chapterSub: 'The variance map',
      say: 'Kriging gives a variance in every cell: lowest at the wells and growing away from them. The map of one layer\'s variance says where the model is guessing.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'ntg');
        await d.select(t(d, 'em-map-sublayer'), '10');
        await d.select(t(d, 'em-map-layer'), 'ntg_var');
        await d.sleep(4000);
      } },
    { id: 'range', chapter: 'A quick range', chapterSub: 'Every kriged cell moved at once',
      say: 'Under the volume table, the property range moves every kriged property one point two eight standard deviations the same way at once: a quick low and high case, here ten point eight seven to ten point nine seven around ten point nine two million barrels. The volume distribution in lesson eleven samples it properly.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-range-ekene-sand').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-range-ekene-sand'), /STOIIP P90 10\.865, P50 10\.916, P10 10\.967/, 'range');
        await d.highlight(t(d, 'em-range-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
