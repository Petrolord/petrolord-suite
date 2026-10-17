// Geoscience module showcase, scene 3: Petrophysics Studio on Ekene-1 (kit
// v2 logs, oilfield units). The state of the Petrophysics demo 1 (linear Vsh
// 18/125, Pickett on the water leg, Indonesia with Rsh 2.2; set off camera,
// as every Petrophysics storyboard does), the triple combo round the Ekene
// Sand, the density-neutron crossplot coloured by gamma ray and by the rock
// physics facies, the Pickett plot and the net pay.
import { login, scene, t, park, expectText, note } from './geo-common.mjs';
import { openWell, video1State, ensureZones, zoomTracks, ZONE } from './petro-common.mjs';

const pickOpt = async (d, id, re, { quiet = false } = {}) => {
  const o = (await t(d, id).locator('option').allInnerTexts()).find((x) => re.test(x));
  if (!o) return false;
  if (quiet) await t(d, id).selectOption({ label: o }); else await d.select(id, { label: o });
  return true;
};

export default {
  ...scene('geo-s03'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openWell(d, shared);
    await video1State(d);
    await ensureZones(d);
    await pickOpt(d, 'petro-layout-template', /^Standard triple combo/, { quiet: true });
    await d.sleep(1500);
    await zoomTracks(d, 5130, 13);
    await d.sleep(1200);
    await park(d);
  },
  steps: [
    { id: 'tracks', chapter: 'Petrophysics', chapterSub: 'Petrophysics Studio',
      say: 'In Petrophysics Studio, the interpretation runs down the whole well: shale volume, porosity, water saturation and permeability, with the pay flagged in green.',
      do: async (d) => { await d.moveTo(t(d, 'petro-tracks-canvas'), { ms: 1800, dx: 0.7, dy: 0.5 }); } },
    { id: 'nd',
      say: 'On the density neutron crossplot, coloured by gamma ray, the clean sand separates from the shale.',
      do: async (d) => {
        await d.click('petro-view-crossplot');
        await d.click('petro-plot-nd');
        await pickOpt(d, 'petro-colorby', /^GR/);
        await d.sleep(2000);
      } },
    { id: 'facies',
      say: 'Coloured by the rock physics facies instead, the hydrocarbon sand, the brine sand and the shale each take their own place.',
      do: async (d) => {
        if (!(await pickOpt(d, 'petro-colorby', /RP_FACIES|rock physics facies/i))) console.log('MISMATCH no RP_FACIES colour-by option');
        await d.sleep(2500);
      } },
    { id: 'pickett',
      say: 'The Pickett plot fits the water line through the water leg, below the contact: a cementation exponent of one point six one five.',
      sub: 'The Pickett plot fits the water line through the water leg, below the contact: a cementation exponent of 1.615.',
      do: async (d, shared) => {
        await d.click('petro-plot-pickett');
        await d.type('petro-pickett-top', '5118.1');
        await d.type('petro-pickett-base', '5183.7');
        await d.click('petro-pickett-fit');
        await d.sleep(1500);
        await expectText(d, 'petro-pickett-result', /m = 1\.615 · a·Rw = 0\.1329/, 'Pickett fit');
        await d.highlight('petro-pickett-result');
      } },
    { id: 'netpay',
      say: 'Back on the tracks, the Ekene Sand carries thirty one feet of net pay at the cutoffs.',
      sub: 'Back on the tracks, the Ekene Sand carries 31.0 ft of net pay at the cutoffs.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.click('petro-view-tracks');
        await d.sleep(1500);
        await note(d, shared, 'net', `petro-zone-net-${ZONE}`);
        await expectText(d, `petro-zone-net-${ZONE}`, /31\.0/, 'net pay');
        await d.highlight(`petro-zone-net-${ZONE}`);
      } },
  ],
};
