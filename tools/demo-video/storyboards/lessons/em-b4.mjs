// Earth Modelling with Petrolord, Lesson B4: zone averages or the logs (3D
// grid upgrade, 2026-10-17). The published zone summaries give one value per
// well (pay averages: the wet wells give no porosity or Sw; NTG read as net
// reservoir over gross); the well logs give every well, in every 2.5 ft cell.
import { login, expectText, openEm, stackEkene, fluids, build, results, t, vol, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-b4',
  ...emLessonMeta(4, 'B', 'Zone averages *or the logs*', 'One value per well from the zone summaries, or the logs upscaled into every cell'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'summaries', chapter: 'Zone summaries', chapterSub: 'One value per well',
      say: 'By default the model reads the zone summaries Petrophysics Studio published: one value per well for the Ekene Sand, given to every layer of the grid at that well. The provenance lines in the Details tab say how many wells each property came from.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-prov-ekene-sand-phi').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-prov-ekene-sand-phi').locator('xpath=..'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'pay', chapter: 'Pay averages', chapterSub: 'Two wells for porosity and Sw',
      say: 'Porosity and water saturation come from two wells only. A zone summary averages the pay, and Ekene two and Ekene four sit below the contact, so they have no pay and no average.',
      do: async (d) => {
        await expectText(d, t(d, 'em-prov-ekene-sand-phi'), /sgs from 2 wells/, 'phi wells');
        await d.highlight(t(d, 'em-prov-ekene-sand-phi'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'ntg', chapter: 'Net to gross', chapterSub: 'Net reservoir over gross',
      say: 'Net to gross comes from all four wells, because the model reads it as net reservoir over gross: the rock cutoffs only. The pay net to gross also cuts the water, and the contact cuts the water again, so it would count it twice.',
      do: async (d) => {
        await expectText(d, t(d, 'em-prov-ekene-sand-ntg'), /from 4 wells[\s\S]*net reservoir over gross/, 'ntg');
        await d.highlight(t(d, 'em-prov-ekene-sand-ntg'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'logs', chapter: 'From the logs', chapterSub: 'Every well, every cell',
      say: 'Rock properties from the well logs reads the curves themselves. Every well has porosity and shale volume, wet or not, and the logs are averaged into each two and a half foot cell along the well. Build again.',
      do: async (d) => {
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await d.sleep(800);
        await build(d, { onCamera: true });
      } },
    { id: 'four', chapter: 'Four wells', chapterSub: 'Wet or not',
      say: 'Now porosity comes from all four wells, cell by cell down each well, and the simulation fills the grid between them.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-prov-ekene-sand-phi').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-prov-ekene-sand-phi'), /sgs from 4 wells/, 'phi wells from logs');
        await d.highlight(t(d, 'em-prov-ekene-sand-phi'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'hist', chapter: 'What changed', chapterSub: 'The logs, the cells and the model',
      say: 'On the charts, the histogram compares the porosity logs, the upscaled cells and the model. The three agree: means of zero point one eight seven, zero point one eight five and zero point one eight seven.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await expectText(d, t(d, 'em-chart-hist'), /means 0\.187, 0\.185, 0\.187/, 'histogram');
        await d.highlight('em-chart-hist');
        await d.sleep(4500);
        await d.unhighlight();
      } },
  ],
};
