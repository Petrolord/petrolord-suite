// Earth Modelling with Petrolord, Lesson A1: the workspace and the framework
// (3D grid upgrade, 2026-10-17). The explorer, the views and the dock;
// stacking the booked Ekene Sand top and base; ties and zone by name; the 3D
// grid's frame (25 m cells, the edge traced at the data limit against the
// stepped node cells); the clamp report and the thickness; the grid in 3D.
import { login, expectText, openEm, stackEkene, build, results, grid3d, t, emLessonMeta, TOP } from './em-common.mjs';

export default {
  id: 'lesson-em-a1',
  ...emLessonMeta(1, 'A', 'The workspace and *the framework*', 'Surfaces from the registry, ties, zones, the 3D grid frame and its edge'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'panels', chapter: 'The workspace', chapterSub: 'Explorer, views and the builder',
      say: 'Earth Modeling has three parts. On the left, the explorer lists what the shared registry holds: the surfaces published from Mapping and Seismolord, fault polygons and faults, and the wells. In the middle are the views: map, section, results, 3D and the player. On the right, the builder holds everything that defines the model.',
      do: async (d) => {
        await d.moveTo(t(d, `em-add-${TOP}`));
        await d.sleep(2500);
        await d.moveTo(t(d, 'em-view-player'));
        await d.sleep(2000);
        await d.moveTo(t(d, 'em-model-name'));
        await d.sleep(2000);
      } },
    { id: 'stack', chapter: 'The framework', chapterSub: 'Zones between surfaces',
      say: 'A model starts from a stack of depth surfaces, shallow to deep, and each pair makes a zone. The plus button adds a surface. We stack the Ekene Sand top and base mapped from the six development wells.',
      do: async (d) => { await stackEkene(d, { onCamera: true }); } },
    { id: 'ties',
      say: 'Each surface is tied to the well top of the same name, Ekene Sand and Ekene Sand Base, and the zone between them reads the Ekene Sand zone the wells carry. You can change any of these in the builder.',
      do: async (d) => {
        await t(d, 'em-top-0').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-top-0'), /Ekene Sand/, 'tie 0');
        await d.highlight(t(d, 'em-top-0'));
        await d.sleep(1500);
        await d.highlight(t(d, 'em-top-1'));
        await d.sleep(1500);
        await d.highlight(t(d, 'em-zone-reg-0'));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'frame', chapter: 'The model frame', chapterSub: '25 m cells and a traced edge',
      say: 'Under model frame, a new model has twenty five metre cells and a smooth edge. Below it, the 3D grid cuts each zone into layers two and a half feet thick. Build model.',
      sub: 'Under model frame, a new model has 25 m cells and a smooth edge. Below it, the 3D grid cuts each zone into layers 2.5 ft thick. Build model.',
      do: async (d) => {
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-frame-cell').locator('xpath=ancestor::div[1]/..'));
        await d.sleep(3500);
        await d.unhighlight();
        await build(d, { onCamera: true });
      } },
    { id: 'built',
      say: 'The frame is a hundred by eighty nodes, twenty five metres apart: the map\'s extent grown by half of its own hundred metre cell on every side, where each of its cells ends. The grid holds a hundred and thirty four thousand eight hundred and twenty cells in forty two layers.',
      sub: 'The frame is 100 by 80 nodes, 25 m apart: the map\'s extent grown by half of its own 100 m cell on every side, where each of its cells ends. The grid holds 134,820 cells in 42 layers.',
      do: async (d) => {
        await expectText(d, 'em-status', /100×80 frame at 25 m, 134,820 cells in 42 layers/, 'status');
        await d.highlight('em-status');
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'edge', chapter: 'The edge', chapterSub: 'Traced at the data limit',
      say: 'The map shows the top of the zone. The six well map only covers the ground between the wells, so the model edge is that data limit, traced halfway past the last mapped node. It runs straight across the corners where the map\'s own cells would make steps.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(3500);
      } },
    { id: 'nodes',
      say: 'Node cells shows the difference: each mapped node becomes one whole hundred metre cell, and the edge steps from node to node. The fine grid keeps the same area with smaller cells.',
      sub: 'Node cells shows the difference: each mapped node becomes one whole 100 m cell, and the edge steps from node to node. The fine grid keeps the same area with smaller cells.',
      do: async (d) => {
        await t(d, 'em-frame-edge').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-frame-edge'), 'nodes');
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-frame-cell'), '');
        await build(d, { onCamera: true });
        await d.sleep(2500);
        await d.select(t(d, 'em-frame-edge'), 'smooth');
        await d.type(t(d, 'em-frame-cell'), '25');
        await build(d, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'clamp', chapter: 'Quality control', chapterSub: 'The clamp report and the thickness',
      say: 'Where a base map crosses above its top, the model clamps the zone to zero thickness and counts the nodes in the Details tab. These maps are consistent, so nothing is clamped. The thickness map is the isochore, thickest on the flanks.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await d.highlight('em-clamps');
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'thickness');
        await d.sleep(3000);
      } },
    { id: '3d', chapter: 'In 3D', chapterSub: 'The grid and its skeleton',
      say: 'In 3D the zone is a grid of cells. The lines are the grid skeleton, every fifth cell, and they can be drawn every cell or turned off. Drag to turn the model; the vertical exaggeration is in the toolbar.',
      do: async (d) => {
        await grid3d(d, { ve: 10 });
        await d.sleep(2500);
        await d.select(t(d, 'em-3d-density'), '1');
        await d.sleep(2500);
        await d.select(t(d, 'em-3d-density'), '5');
        await d.sleep(1500);
      } },
  ],
};
