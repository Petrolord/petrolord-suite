// Earth Modelling with Petrolord, Lesson B6: layers.
// The Ekene Sand as one layer, then five proportional layers: each layer's
// own upscaled values, the layer maps, the section bands and the volume
// added layer by layer.
import { login, expectText, openEm, stackEkene, fluids, methods, build, t, vol, emLessonMeta, sectionPair } from './em-common.mjs';

export default {
  id: 'lesson-em-b6',
  ...emLessonMeta(6, 'B', 'Layers', 'Proportional layers inside a zone, their own properties, maps and sections'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'one', chapter: 'One layer', chapterSub: 'The zone as a whole',
      say: 'As one layer, each well gives one porosity for the whole sand, and the model holds ten point zero six million barrels. The logs show the sand varies with depth: cleaner at the top, tighter in the middle.',
      sub: 'As one layer, each well gives one porosity for the whole sand, and the model holds 10.06 million barrels. The logs show the sand varies with depth: cleaner at the top, tighter in the middle.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^10\.055$/, 'one layer STOIIP');
        await d.highlight(vol(d, 'total', 'stoiip'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'five', chapter: 'Five layers', chapterSub: 'Proportional between top and base',
      say: 'The number beside the zone in the builder cuts it into proportional layers. Each layer takes the same fraction of the sand at every node, so the layers thin and thicken with it. We use five, and build.',
      do: async (d) => {
        await t(d, 'em-layers-0').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-layers-0'), '5');
        await build(d, { onCamera: true });
      } },
    { id: 'rows', chapter: 'Five sets of values', chapterSub: 'Per well and layer',
      say: 'Now every well gives five sets of values. At Ekene one the top layer reads porosity zero point two zero five, the second zero point one seven six.',
      sub: 'Now every well gives five sets of values. At Ekene-1 the top layer reads porosity 0.205, the second 0.176.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await expectText(d, t(d, 'em-logrow-ekene-sand-Ekene-1-1'), /0\.205/, 'layer 1 phi');
        await expectText(d, t(d, 'em-logrow-ekene-sand-Ekene-1-2'), /0\.176/, 'layer 2 phi');
        await t(d, 'em-logrows-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'maps', chapter: 'Layer maps', chapterSub: 'One layer at a time',
      say: 'The map shows each layer on its own, or the zone as a whole. Layer one is the cleanest sand, layer two the tightest.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(1500);
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(2500);
        await d.select(t(d, 'em-map-sublayer'), '1');
        await d.sleep(2500);
      } },
    { id: 'section', chapter: 'In section', chapterSub: 'Bands of porosity',
      say: 'In section the layers are bands of porosity between the wells, with the contact dashed across the sand.',
      do: async (d) => {
        await d.click('em-view-section');
        await d.sleep(800);
        await sectionPair(d, 'Ekene-1', 'Ekene-4');
        await d.select(t(d, 'em-sec-colour'), 'phi');
        await d.sleep(3500);
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Added layer by layer',
      say: 'The volume is added layer by layer, each with its own properties: eleven point one million barrels. The rock is unchanged; the top layers, which hold most of the oil, have lower water saturation than the zone average, and the layered model counts that.',
      sub: 'The volume is added layer by layer, each with its own properties: 11.1 million barrels. The rock is unchanged; the top layers, which hold most of the oil, have lower water saturation than the zone average, and the layered model counts that.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^11\.102$/, 'five layer STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
