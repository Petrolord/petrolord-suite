// Earth Modelling with Petrolord, Lesson C7: constant, trend, inverse
// distance and kriging on the same control (porosity from the logs, one
// layer), each map, and the model against the wells.
import { login, expectText, openEm, stackEkene, fluids, methods, build, t, emLessonMeta } from './em-common.mjs';

const head = (d) => t(d, 'em-match-head-ekene-sand');
async function showPhi(d) {
  await d.click('em-view-map');
  await d.sleep(800);
  await d.select(t(d, 'em-map-layer'), 'phi');
  await d.sleep(2500);
}

export default {
  id: 'lesson-em-c7',
  ...emLessonMeta(7, 'C', 'Constant, trend, inverse distance, *kriging*', 'Four ways to fill the space between the wells, and how well each honours them'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'constant', chapter: 'Constant', chapterSub: 'The weighted mean',
      say: 'Four wells give porosity for the Ekene Sand. Constant puts their thickness weighted mean on every node: one colour on the map. The model against the wells shows what it misses: up to zero point zero two six in water saturation and zero point zero one six in net to gross at a well.',
      sub: 'Four wells give porosity for the Ekene Sand. Constant puts their thickness-weighted mean on every node: one colour on the map. The model against the wells shows what it misses: up to 0.026 in water saturation and 0.016 in net-to-gross at a well.',
      do: async (d) => {
        await methods(d, { phi: 'constant', ntg: 'constant', sw: 'constant' }, { onCamera: true });
        await build(d, { onCamera: true });
        await showPhi(d);
        await d.click('em-view-qc');
        await d.sleep(1200);
        await head(d).scrollIntoViewIfNeeded();
        await expectText(d, head(d), /Sw 0\.026, NTG 0\.016/, 'constant misfit');
        await d.highlight(head(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'trend', chapter: 'Trend', chapterSub: 'A plane through the wells',
      say: 'Trend fits a plane through the wells by least squares. It shows the direction the porosity changes, but a plane through four wells still misses them.',
      do: async (d) => {
        await methods(d, { phi: 'trend' }, { onCamera: true });
        await build(d, { onCamera: true });
        await showPhi(d);
      } },
    { id: 'idw', chapter: 'Inverse distance', chapterSub: 'Nearer wells weigh more',
      say: 'Inverse distance weighs each well by one over the distance squared. It needs no variogram and passes through every well, so it suits a field with few wells. It makes bull\'s eyes around them.',
      do: async (d) => {
        await methods(d, { phi: 'idw' }, { onCamera: true });
        await build(d, { onCamera: true });
        await showPhi(d);
      } },
    { id: 'okrige', chapter: 'Kriging', chapterSub: 'A variogram from the wells',
      say: 'Ordinary kriging weighs the wells by a variogram fitted from them, removing the trend first. It also passes through every well, smoothly, and it knows how sure it is.',
      do: async (d) => {
        await methods(d, { phi: 'okrige' }, { onCamera: true });
        await build(d, { onCamera: true });
        await showPhi(d);
      } },
    { id: 'match', chapter: 'Against the wells', chapterSub: 'Honoured or missed',
      say: 'The table confirms it: with kriging the porosity at every well is the well\'s own value, to the third decimal. The histogram sets the model\'s nodes, in blue, against the wells, in red.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await head(d).scrollIntoViewIfNeeded();
        await expectText(d, head(d), /Porosity 0\.00[0-2]/, 'kriging honours');
        await d.highlight(t(d, 'em-match-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
        await t(d, 'em-hist-ekene-sand-phi').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-hist-ekene-sand-phi'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
  ],
};
