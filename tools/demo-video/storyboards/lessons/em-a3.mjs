// Earth Modelling with Petrolord, Lesson A3: zones, contacts and the volume
// table. With no contact the whole zone counts; the OWC and Bo; bulk against
// the rock above the contact and the area with oil; the open edge; bounding
// the leg by the closure and spill.
import { login, expectText, openEm, stackEkene, fluids, build, t, vol, emLessonMeta } from './em-common.mjs';

export default {
  id: 'lesson-em-a3',
  ...emLessonMeta(3, 'A', 'Zones, contacts and *the volume table*', 'The OWC, rock above the contact, the area with oil and the open edge'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'nocontact', chapter: 'With no contact', chapterSub: 'The whole zone counts',
      say: 'The volume table gives each zone\'s bulk rock, net rock, pore volume and hydrocarbon pore volume. With no contact, the amber line says the whole zone counts as hydrocarbon, all fifty two thousand five hundred and fifty nine acre feet of it.',
      sub: 'The volume table gives each zone\'s bulk rock, net rock, pore volume and hydrocarbon pore volume. With no contact, the amber line says the whole zone counts as hydrocarbon, all 52,559 acre-feet of it.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'bulk').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'bulk'), /^52559\.4$/, 'bulk');
        await d.highlight(t(d, 'em-nocontact-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'contact', chapter: 'The contact', chapterSub: 'OWC and Bo',
      say: 'The contacts are typed per zone as depth below sea level, in feet here: the oil water contact at five thousand and thirty six point one, and Bo of one point two. The line beneath says how each value was read.',
      sub: 'The contacts are typed per zone as depth below sea level, in feet here: the oil-water contact at 5,036.1, and Bo of 1.2. The line beneath says how each value was read.',
      do: async (d) => {
        await fluids(d, { onCamera: true });
        await expectText(d, t(d, 'em-fluids-read-0'), /OWC 1535\.0 m, Bo 1\.2/, 'fluids read');
        await d.highlight(t(d, 'em-fluids-0'));
        await d.sleep(2500);
        await d.unhighlight();
        await build(d, { onCamera: true });
      } },
    { id: 'hc', chapter: 'Above the contact', chapterSub: 'HC bulk and HC area',
      say: 'Now two more columns: the rock above the contact, eighteen thousand and fifty eight acre feet, and the area that holds oil, four hundred and eighteen acres. These are the numbers ReservoirCalc Pro reports from the same maps. The hydrocarbon pore volume counts only the oil leg, and with Bo the table gives the stock tank oil initially in place.',
      sub: 'Now two more columns: the rock above the contact, 18,058 acre-feet, and the area that holds oil, 418 acres. These are the numbers ReservoirCalc Pro reports from the same maps. The hydrocarbon pore volume counts only the oil leg, and with Bo the table gives the stock tank oil initially in place.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'hcbulk').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'hcarea'), /^418$/, 'HC area');
        await d.highlight(vol(d, 'total', 'hcbulk'));
        await d.sleep(2000);
        await d.highlight(vol(d, 'total', 'hcarea'));
        await d.sleep(2000);
        await d.highlight(vol(d, 'total', 'stoiip'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'edge', chapter: 'The open edge', chapterSub: 'Where the map stops',
      say: 'The amber note says the oil leg reaches the edge of the model at thirty four nodes. The maps stop at the outer wells, so the accumulation is not closed inside them, and the volume depends on where the frame stops. It is a minimum.',
      sub: 'The amber note says the oil leg reaches the edge of the model at 34 nodes. The maps stop at the outer wells, so the accumulation is not closed inside them, and the volume depends on where the frame stops. It is a minimum.',
      do: async (d) => {
        await expectText(d, t(d, 'em-openedge-ekene-sand'), /at 34 nodes/, 'open edge');
        await d.highlight(t(d, 'em-openedge-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'trap', chapter: 'Closure and spill', chapterSub: 'Bound the leg by the trap',
      say: 'Bound the leg by the closure and spill asks Mapping\'s closure engine where the trap spills. On these maps it spills at the edge, only a few feet below the crest, so the bounded leg is tiny. That says the map is too small for the trap: the structure needs mapping beyond the outer wells.',
      do: async (d) => {
        await t(d, 'em-trap-0').scrollIntoViewIfNeeded();
        await d.click('em-trap-0');
        await build(d, { onCamera: true });
        await d.click('em-view-qc');
        await d.sleep(1200);
        await t(d, 'em-trap-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-trap-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
