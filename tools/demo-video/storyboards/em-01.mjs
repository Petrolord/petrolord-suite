// Earth Modeling, demo 1: from maps and logs to a static model (Ekene kit v4).
// The booked six-well Ekene Sand top and base from the registry, the ties
// and zone filled in by name, the well logs Petrophysics Studio published
// upscaled to five proportional layers, kriging, the contact, the map, the
// section, the property QC and the volume. Numbers from the dry run
// (LENIENT=1 prints mismatches instead of stopping).
import {
  login, expectText, openEm, stackEkene, fluids, methods, build, deleteModels,
  t, vol, TOP, BASE, DEMO_MODEL,
} from './em-common.mjs';

export default {
  id: 'em-01',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 1 of 3',
  title: 'From maps and logs to a *static model*',
  subtitle: 'The Ekene Sand framework, the well logs upscaled to layers, kriged properties and the volume',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^EM demo: /);
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Earth Modeling', chapterSub: 'A static model of the Ekene field',
      say: 'Earth Modeling builds the static model of a field: the framework between mapped surfaces, the rock properties between the wells, and the volume. On the left are the surfaces Mapping and Surface Studio published for the Ekene field, and the wells.',
      do: async (d) => {
        await d.sleep(1500);
        await d.moveTo(t(d, `em-add-${TOP}`));
        await d.sleep(2500);
      } },
    { id: 'stack', chapter: 'The framework', chapterSub: 'Top and base of the Ekene Sand',
      say: 'We stack the top and the base of the Ekene Sand, mapped from the six development wells. The surfaces are tied to the well tops of the same name, and the zone between them reads the Ekene Sand zone the wells carry.',
      do: async (d) => {
        await stackEkene(d, { onCamera: true });
        await expectText(d, t(d, 'em-top-0'), /Ekene Sand/, 'tie top');
        await d.highlight(t(d, 'em-top-0').locator('xpath=ancestor::div[1]/..'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'logs', chapter: 'Rock properties from the logs', chapterSub: 'Upscaled to layers',
      say: 'For the rock properties we use the well logs. Petrophysics Studio published effective porosity, shale volume, water saturation and permeability on Ekene one to four, and the model averages them at each well over each layer. We cut the sand into five proportional layers.',
      do: async (d) => {
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await d.sleep(800);
        await d.highlight('em-cutoffs');
        await d.sleep(2000);
        await d.unhighlight();
        await t(d, 'em-layers-0').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-layers-0'), '5');
      } },
    { id: 'methods',
      say: 'Porosity and net to gross are kriged with a variogram fitted from the wells. Only two wells have oil above the contact, so water saturation uses inverse distance.',
      do: async (d) => {
        await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' }, { onCamera: true });
        await d.sleep(800);
      } },
    { id: 'contact', chapter: 'The contact', chapterSub: 'Oil down to 5,036 ft TVDSS',
      say: 'The oil water contact is at five thousand and thirty six feet true vertical depth sub sea, and the oil formation volume factor is one point two. Then build.',
      sub: 'The oil-water contact is at 5,036 ft TVDSS, and the oil formation volume factor is 1.2. Then build.',
      do: async (d) => {
        await fluids(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'built',
      say: 'The status line says what the build did: a twenty five by twenty frame at a hundred metres, one zone, net to gross falling back to a plane in two layers where every well reads all clean sand, and that the oil reaches the edge of the mapped area, so the volume is a minimum.',
      sub: 'The status line says what the build did: a 25 by 20 frame at 100 m, one zone, net-to-gross falling back to a plane in two layers where every well reads all clean sand, and that the oil reaches the edge of the mapped area, so the volume is a minimum.',
      do: async (d) => {
        await expectText(d, 'em-status', /25×20 frame at 100 m, 1 zones[\s\S]*2 properties fell back[\s\S]*reaches the model edge/, 'build status');
        await d.highlight('em-status');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'map', chapter: 'The model', chapterSub: 'Porosity by layer',
      say: 'The map shows the porosity of the whole zone, and each layer on its own. The top layer is the cleanest sand, near zero point two; the middle of the sand is tighter.',
      do: async (d) => {
        await d.select(t(d, 'em-map-layer'), 'phi');
        await d.sleep(2500);
        await d.select(t(d, 'em-map-sublayer'), '0');
        await d.sleep(2500);
        await d.select(t(d, 'em-map-sublayer'), '1');
        await d.sleep(2500);
      } },
    { id: 'section', chapter: 'The section', chapterSub: 'Layers and the contact',
      say: 'The section from Ekene one to Ekene four crosses the crest past the Ekene eight and nine pad. It shows the five layers coloured by porosity, the wells with their gamma ray, and the contact, dashed, cutting the sand.',
      do: async (d) => {
        await d.click('em-view-section');
        await d.sleep(1000);
        const ids = await d.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="em-sec-b"] option')].map((o) => [o.textContent, o.value])));
        await d.select(t(d, 'em-sec-b'), ids['Ekene-4']);
        await d.sleep(1500);
        await d.select(t(d, 'em-sec-colour'), 'phi');
        await d.sleep(3500);
      } },
    { id: 'qc', chapter: 'Quality control', chapterSub: 'The model against the wells',
      say: 'Quality control lists the logs as upscaled at every well and layer. The wet wells, Ekene two and four, still give porosity and net to gross, so all four wells shape the model. Kriging honours every well, and the histograms show the model spans the values the wells measured.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        const qc = t(d, 'em-propqc-ekene-sand');
        await qc.scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
        await t(d, 'em-hists-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-hists-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Rock above the contact and STOIIP',
      say: 'Above the contact the sand holds eighteen thousand and fifty eight acre feet of rock over four hundred and eighteen acres, the same rock volume ReservoirCalc Pro reports from these maps. On the modelled properties the stock tank oil initially in place is eleven point one million barrels.',
      sub: 'Above the contact the sand holds 18,058 acre-feet of rock over 418 acres, the same rock volume ReservoirCalc Pro reports from these maps. On the modelled properties the stock tank oil initially in place is 11.1 million barrels.',
      do: async (d) => {
        await vol(d, 'total', 'hcbulk').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'hcarea'), /^418$/, 'HC area');
        await expectText(d, vol(d, 'total', 'stoiip'), /^11\.102$/, 'STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'save', chapter: 'Save', chapterSub: 'The model definition',
      say: 'Saving keeps the model definition: the surfaces, ties, layers, methods and contact. The grids are rebuilt from the registry whenever it opens, so the model always reads the latest interpretation.',
      do: async (d) => {
        await t(d, 'em-model-name').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-model-name'), DEMO_MODEL);
        await t(d, 'em-save-model').scrollIntoViewIfNeeded();
        await d.click('em-save-model');
        await d.sleep(2500);
      } },
  ],
};
