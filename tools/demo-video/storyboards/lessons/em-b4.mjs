// Earth Modelling with Petrolord, Lesson B4: zone averages or the logs.
// The published zone summaries are pay averages: the wells below the contact
// give no porosity; NTG is read as net reservoir over gross; switching the
// control to the well logs brings all four wells in.
import { login, expectText, openEm, stackEkene, fluids, build, t, vol, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-b4',
  ...emLessonMeta(4, 'B', 'Zone averages *or the logs*', 'What Petrophysics publishes per zone, why wet wells are empty, and the logs as the control'),
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
    { id: 'source', chapter: 'Where properties come from', chapterSub: 'The published zone averages',
      say: 'By default the model reads the zone summaries Petrophysics Studio published: one value per well for the Ekene Sand. The provenance line under the volume table says how many wells each property came from.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-prov-ekene-sand-phi').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-prov-ekene-sand-phi').locator('xpath=..'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'pay', chapter: 'Pay averages', chapterSub: 'Wet wells are empty',
      say: 'Porosity and water saturation come from two wells only. A zone summary averages the pay, and Ekene two and Ekene four sit below the contact, so they have no pay and no average. Two wells cannot be kriged, so the model uses their mean everywhere.',
      do: async (d) => {
        await expectText(d, t(d, 'em-prov-ekene-sand-phi'), /from 2 wells/, 'phi wells');
        await d.highlight(t(d, 'em-prov-ekene-sand-phi'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'ntg', chapter: 'Net to gross', chapterSub: 'Net reservoir over gross',
      say: 'Net to gross comes from all four wells, because the model reads it as net reservoir over gross: the rock cutoffs only. The pay net to gross also cuts the water, and the contact cuts the water again, so it would count it twice.',
      do: async (d) => {
        await expectText(d, t(d, 'em-prov-ekene-sand-ntg'), /from 4 wells[\s\S]*net reservoir over gross/, 'ntg');
        await d.highlight(t(d, 'em-prov-ekene-sand-ntg'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'logs', chapter: 'The logs', chapterSub: 'Every well speaks',
      say: 'Rock properties from the well logs reads the curves themselves. Every well has porosity and shale volume, wet or not, so all four wells shape the porosity and the net to gross. Build again.',
      do: async (d) => {
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await d.sleep(800);
        await build(d, { onCamera: true });
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-prov-ekene-sand-phi').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-prov-ekene-sand-phi'), /from 4 wells/, 'phi wells from logs');
        await d.highlight(t(d, 'em-prov-ekene-sand-phi'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'table', chapter: 'The upscaled values', chapterSub: 'One row per well',
      say: 'The table under the volumes gives what the model read at each well: gross and net sand in true vertical feet, net to gross, porosity, water saturation above the contact, and permeability. The wet wells read below O W C for water saturation and still give the rest.',
      sub: 'The table under the volumes gives what the model read at each well: gross and net sand in true vertical feet, net-to-gross, porosity, water saturation above the contact, and permeability. The wet wells read below OWC for water saturation and still give the rest.',
      do: async (d) => {
        await t(d, 'em-logrows-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
  ],
};
