// Earth Modelling with Petrolord, Lesson A3: zones, contacts and the volumes
// (3D grid upgrade, 2026-10-17). Zones from the well tops and the cap; the
// contact typed per zone; the volumes by zone and the Details table (bulk
// against rock above the contact and HC area); the contact as a plane in 3D,
// the fluid zone of every cell and the contact lines on the map; the open edge.
import {
  login, expectText, openEm, stackEkene, zonesAndCap, fluids, build, results, grid3d, t, zvol, emLessonMeta,
} from './em-common.mjs';

export default {
  id: 'lesson-em-a3',
  ...emLessonMeta(3, 'A', 'Zones, contacts and *the volumes*', 'Zones from the well tops, the cap, the contact in 3D and on the maps, and the volume of each zone'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'tops', chapter: 'Zones from the well tops', chapterSub: 'Two shale breaks in the sand',
      say: 'Every Ekene well picks two shale breaks inside the sand: Ekene Sand Middle, about a fifth of the way down, and Ekene Sand Lower, at seven tenths. The builder lists the tops picked between the zone\'s top and base. Ticking both splits the sand into Upper, Middle and Lower.',
      do: async (d) => {
        await t(d, 'em-split-0').scrollIntoViewIfNeeded();
        await d.highlight('em-split-0');
        await d.sleep(2500);
        await d.unhighlight();
        await zonesAndCap(d, { onCamera: true, cap: false });
        await expectText(d, t(d, 'em-split-names-0'), /Upper, Middle and Lower/, 'split names');
        await d.sleep(1500);
      } },
    { id: 'cap', chapter: 'The cap', chapterSub: 'A slab of the seal',
      say: 'The cap adds a slab of the seal above the top surface, fifty feet thick by default, as a zone of its own. The Ogbia Shale over the Ekene Sand is about eight hundred and fifty feet thick, so the cap is the part next to the reservoir.',
      do: async (d) => {
        await zonesAndCap(d, { onCamera: true, split: false });
        await d.highlight('em-cap');
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'contact', chapter: 'Contacts per zone', chapterSub: 'Typed in feet',
      say: 'Contacts are typed per zone as depth below sea level, in feet here: the oil water contact at five thousand and thirty six point one, and Bo of one point two. The line beneath says how each value was read. The cap and the three zones take the contact of the sand.',
      do: async (d) => {
        await fluids(d, { onCamera: true });
        await expectText(d, t(d, 'em-fluids-read-0'), /OWC 1535\.0 m, Bo 1\.2/, 'fluids read');
        await d.highlight(t(d, 'em-fluids-0'));
        await d.sleep(2500);
        await d.unhighlight();
        await build(d, { onCamera: true });
      } },
    { id: 'byzone', chapter: 'The volume of each zone', chapterSub: 'STOIIP by zone',
      say: 'The results open on charts. The volume by zone shows six point one nine million barrels in the Upper sand and six point one four in the Middle, none in the Lower, which lies below the contact, and none in the cap: twelve point three three in all. These properties are the published zone averages; module B builds them from the logs.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 12\.33 MMstb[\s\S]*0\.006\.196\.140\.00/, 'volumes by zone');
        await d.highlight('em-chart-volumes');
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'table', chapter: 'The volume table', chapterSub: 'Bulk and the rock above the contact',
      say: 'The Details tab has each zone\'s table: bulk rock, net rock, pore volume and hydrocarbon pore volume, then the rock above the contact and the area that holds oil. In the Upper sand the bulk is eleven thousand six hundred and eighty two acre feet, and nine thousand one hundred and eighty four of it lies above the contact.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-vol-ekene-sand-upper').scrollIntoViewIfNeeded();
        await expectText(d, zvol(d, 'Ekene Sand Upper', 'total', 'bulk'), /^11682\.0$/, 'upper bulk');
        await expectText(d, zvol(d, 'Ekene Sand Upper', 'total', 'hcbulk'), /^9183\.7$/, 'upper hc bulk');
        await d.highlight('em-vol-ekene-sand-upper');
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'plane', chapter: 'The contact in 3D', chapterSub: 'A plane where it cuts the sand',
      say: 'In 3D the contact is a blue plane drawn where it cuts the reservoir, with its outline. Coloured by fluid zone, the cells above it are oil and the cells below are water. The cap is seal rock, so it is grey.',
      do: async (d) => {
        await grid3d(d, { ve: 10, prop: 'fluid' });
        await d.sleep(4500);
      } },
    { id: 'maplines', chapter: 'The contact on the map', chapterSub: 'Where it meets the zone top and base',
      say: 'On the map of a zone, the contact is drawn where it meets the zone top, solid, and the zone base, dashed. Between the two lines the column is part oil and part water.',
      do: async (d) => {
        await d.click('em-view-map');
        await d.sleep(800);
        await d.select(t(d, 'em-map-zone'), '1');
        await d.sleep(3500);
      } },
    { id: 'edge', chapter: 'The open edge', chapterSub: 'A minimum volume',
      say: 'The status line warns that the oil leg reaches the model edge. The six well maps stop at the outer wells, so the accumulation is not closed inside them, and the volume depends on where the frame stops. It is a minimum.',
      do: async (d) => {
        await expectText(d, 'em-status', /reaches the model edge/, 'open edge');
        await d.highlight('em-status');
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
