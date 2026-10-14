// Earth Modelling with Petrolord, Lesson A1: the workspace and the framework.
// The explorer, the views and the dock; stacking the booked Ekene Sand top
// and base; ties and zone filled by name; the frame, the cell size, the
// clamp report and the thickness.
import { login, expectText, openEm, stackEkene, build, t, emLessonMeta, TOP } from './em-common.mjs';

export default {
  id: 'lesson-em-a1',
  ...emLessonMeta(1, 'A', 'The workspace and *the framework*', 'Surfaces from the registry, ties, zones, the model frame and the clamp report'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'panels', chapter: 'The workspace', chapterSub: 'Explorer, views and the builder',
      say: 'Earth Modeling has three parts. On the left, the explorer lists what the shared registry holds: the surfaces published from Mapping and Seismolord, fault polygons and faults, and the wells. In the middle are the views: map, section, quality control and volumes, and 3D. On the right, the builder holds everything that defines the model.',
      do: async (d) => {
        await d.moveTo(t(d, `em-add-${TOP}`));
        await d.sleep(2500);
        await d.moveTo(t(d, 'em-view-qc'));
        await d.sleep(2000);
        await d.moveTo(t(d, 'em-model-name'));
        await d.sleep(2000);
      } },
    { id: 'stack', chapter: 'The framework', chapterSub: 'A layer cake between surfaces',
      say: 'A model is a stack of depth surfaces, shallow to deep, and each pair makes a zone. The plus button adds a surface. We stack the Ekene Sand top and base mapped from the six development wells.',
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
    { id: 'build', chapter: 'The model frame', chapterSub: 'Built from the top surface',
      say: 'Build model. The frame is the top surface\'s own: twenty five by twenty nodes a hundred metres apart. The map shows the top of the zone, from four thousand nine hundred and sixty nine and a half feet at the crest down the flanks.',
      sub: 'Build model. The frame is the top surface\'s own: 25 by 20 nodes 100 m apart. The map shows the top of the zone, from 4,969.5 ft at the crest down the flanks.',
      do: async (d) => {
        await build(d, { onCamera: true });
        await expectText(d, 'em-status', /25×20 frame at 100 m/, 'frame');
        await d.sleep(2500);
      } },
    { id: 'cell',
      say: 'Cell size sets a finer frame. At fifty metres the same extent has forty nine by thirty nine nodes; the surfaces are resampled onto it. The frame stays in the map\'s own units, metres here, while depths read in feet.',
      sub: 'Cell size sets a finer frame. At 50 m the same extent has 49 by 39 nodes; the surfaces are resampled onto it. The frame stays in the map\'s own units, metres here, while depths read in feet.',
      do: async (d) => {
        await t(d, 'em-frame-cell').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-frame-cell'), '50');
        await build(d, { onCamera: true });
        await expectText(d, 'em-status', /49×39 frame at 50 m/, 'fine frame');
        await d.highlight('em-status');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'clamp', chapter: 'Quality control', chapterSub: 'The clamp report and the thickness',
      say: 'Where a base map crosses above its top, the model clamps the zone to zero thickness and counts the nodes. These maps are consistent, so nothing is clamped. The thickness map is the isochore, a hundred and six feet on average.',
      sub: 'Where a base map crosses above its top, the model clamps the zone to zero thickness and counts the nodes. These maps are consistent, so nothing is clamped. The thickness map is the isochore, 106 ft on average.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await expectText(d, t(d, 'em-clamps'), /0[\s\S]*0/, 'clamps');
        await d.highlight(t(d, 'em-clamps'));
        await d.sleep(2500);
        await d.unhighlight();
        await expectText(d, t(d, 'em-isopach-ekene-sand'), /Mean isochore \(TVT\) 106\.2 ft/, 'isochore');
        await d.highlight(t(d, 'em-isopach-ekene-sand'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('em-view-map');
        await d.sleep(600);
        await d.select(t(d, 'em-map-layer'), 'thickness');
        await d.sleep(2500);
      } },
    { id: '3d', chapter: 'In 3D', chapterSub: 'The framework and the wells',
      say: 'The 3D view shows the two surfaces with the wells and their tops. Drag to turn it; the vertical exaggeration is set in the toolbar.',
      do: async (d) => {
        await d.click('em-view-3d');
        await d.sleep(2500);
        const c = d.page.locator('canvas').last();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 });
        await d.page.mouse.down();
        for (let i = 0; i < 20; i++) { await d.page.mouse.move(b.x + b.width * (0.5 + i * 0.008), b.y + b.height * 0.5); await d.sleep(40); }
        await d.page.mouse.up();
        await d.sleep(2500);
      } },
  ],
};
