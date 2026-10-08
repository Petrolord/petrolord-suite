// Petrophysics Studio, video 1: from raw logs to defensible net pay (Ekene-1).
// Every number spoken was read off the screen in the 2026-10-08 dry run on
// main 9d66e06 with the demo org on oilfield units (feet); `expect` steps
// stop the take if the screen ever disagrees with the narration.
import { login, APP, ZONE, clearZones, zoomTracks, zoneCard, expectText } from './petro-common.mjs';

export default {
  id: 'petro-01',
  app: 'Petrophysics Studio',
  eyebrow: 'Petrophysics Studio · 1 of 3',
  title: 'From raw logs to *net pay you can defend*',
  subtitle: 'One well, Ekene-1: shale volume, porosity, water resistivity from the well itself, and the saturation model that changes the answer',
  outroTitle: 'Next: is our *Rw* right?',
  outroSub: 'Two independent checks, then ranges on the answer · petrolord.com',
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    // reset: no zones left from an earlier take
    await d.page.goto(`${shared.baseUrl}${APP}`, { waitUntil: 'domcontentloaded' });
    await d.page.locator('[data-well-name="Ekene-1"]').first().click({ timeout: 120000 });
    await d.waitFor('petro-curve-inventory');
    await d.sleep(2000);
    await clearZones(d);
    await d.page.goto(`${shared.baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await d.sleep(1500);
  },
  steps: [
    { id: 'open', chapter: 'Petrophysics Studio', chapterSub: 'Geoscience module',
      say: 'This is Petrophysics Studio, part of the Petrolord Suite. In the next few minutes we take one well from raw logs to a net pay figure we can defend, and we check each step against the data.',
      do: async (d) => {
        if (process.env.DEMO_SKIP_HUB) { await d.page.goto(`${d.page.url().replace(/\/dashboard.*$/, '')}${APP}`); } else {
          await d.click(d.page.getByRole('link', { name: 'Geoscience' }).first());
          await d.sleep(1500);
          await d.click(d.page.getByText('Petrophysics Studio', { exact: true }).first());
        }
        await d.waitFor(d.page.locator('[data-well-name="Ekene-1"]'));
      } },
    { id: 'well',
      say: 'On the left are the wells in the shared registry. They were loaded once, in Well Data Manager, so there is nothing to import here. We open Ekene one.',
      sub: 'On the left are the wells in the shared registry. They were loaded once, in Well Data Manager, so there is nothing to import here. We open Ekene-1.',
      do: async (d) => { await d.highlight('petro-explorer'); await d.sleep(1200); await d.unhighlight(); await d.click(d.page.locator('[data-well-name="Ekene-1"]').first()); await d.waitFor('petro-curve-inventory'); } },
    { id: 'inventory',
      say: 'The inventory lists what the studio found: gamma ray, bulk density, neutron, sonic and deep resistivity, each with its unit. Everything the calculation needs is here.',
      do: async (d) => { await d.highlight('petro-curve-inventory'); await d.callout('inv', 'petro-curve-inventory', 'Curves found in the well, mapped to the inputs', 'right'); } },
    { id: 'zoom',
      say: 'Our target is the Ekene Sand, at about five thousand and eighty feet. We zoom the tracks onto it.',
      sub: 'Our target is the Ekene Sand, at about 5,080 ft. We zoom the tracks onto it.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await zoomTracks(d, 5130, 9); } },

    { id: 'hist', chapter: 'Shale volume', chapterSub: 'Gamma ray histogram',
      say: 'Shale volume comes from the gamma ray. The histogram shows two populations: clean sand on the left, and shale on the right.',
      do: async (d) => { await d.click('petro-view-histogram'); await d.waitFor('petro-histogram'); } },
    { id: 'gr',
      say: 'We set the clean sand line at eighteen API and the shale line at one hundred and twenty five. In this field the gamma ray responds linearly to clay, so we choose the linear model.',
      sub: 'We set the clean sand line at 18 API and the shale line at 125 API. In this field the gamma ray responds linearly to clay, so we choose the linear model.',
      do: async (d) => {
        await d.type('petro-param-grClean', '18');
        await d.type('petro-param-grClay', '125');
        await d.select('petro-param-vshMethod', 'linear');
        await d.click('petro-params-apply');
      } },
    { id: 'phi',
      say: 'Porosity comes from the density log, with a sandstone matrix of two point six five grams per cubic centimetre.',
      sub: 'Porosity comes from the density log, with a sandstone matrix of 2.65 g/cc.',
      do: async (d) => { await d.highlight('petro-param-rhoMa'); await d.sleep(2500); await d.unhighlight(); } },

    { id: 'pickett', chapter: 'Water resistivity', chapterSub: 'Pickett plot on the water leg',
      say: 'Water saturation needs the formation water resistivity, R w. The best source is the well itself: the water leg below the oil water contact. We open the Pickett plot.',
      sub: 'Water saturation needs the formation water resistivity, Rw. The best source is the well itself: the water leg below the oil-water contact. We open the Pickett plot.',
      do: async (d) => { await d.click('petro-view-crossplot'); await d.click('petro-plot-pickett'); } },
    { id: 'window',
      say: 'The water leg runs from five thousand one hundred and eighteen to five thousand one hundred and eighty four feet.',
      sub: 'The water leg runs from 5,118 to 5,184 ft.',
      do: async (d) => { await d.type('petro-pickett-top', '5118.1'); await d.type('petro-pickett-base', '5183.7'); } },
    { id: 'fit',
      say: 'The fit leaves out the shaly samples, fifty five of them here, because shale beds would flatten the line. On the clean sand it returns a cementation exponent of one point eight four, and a times R w of point zero nine two.',
      sub: 'The fit leaves out the shaly samples, 55 of them here, because shale beds would flatten the line. On the clean sand it returns a cementation exponent m of 1.84, and a·Rw of 0.092.',
      do: async (d) => {
        await d.highlight('petro-pickett-clean-vsh');
        await d.click('petro-pickett-fit');
        await expectText(d, 'petro-pickett-result', /m = 1\.843 · a·Rw = 0\.0916 · 76 pts · 55 shaly left out/, 'Pickett fit');
        await d.unhighlight();
        await d.highlight('petro-pickett-result');
      } },
    { id: 'apply',
      say: 'Apply writes both values into the parameters.',
      do: async (d) => { await d.unhighlight(); await d.click('petro-pickett-apply'); await d.highlight('petro-param-rw'); await d.sleep(1200); await d.unhighlight(); } },

    { id: 'zones', chapter: 'Zones and net pay', chapterSub: 'Built from the formation tops',
      say: 'Back on the tracks, we build the zones straight from the formation tops.',
      do: async (d, shared) => { await d.click('petro-view-tracks'); await d.sleep(600); shared.values.zoom = await zoomTracks(d, 5130, 9); await d.click('petro-zone-mode-tops'); await d.click('petro-zone-fill-between-tops'); await d.waitFor(`petro-zone-net-${ZONE}`); } },
    { id: 'archie',
      say: 'The Ekene Sand is one hundred and five feet gross. With Archie, only twelve feet pass the cutoffs.',
      sub: 'The Ekene Sand is 105 ft gross. With Archie, only 12 ft pass the cutoffs.',
      do: async (d) => {
        await expectText(d, zoneCard(d), /net pay 12\.0 ft[\s\S]*gross 105\.0 ft/, 'Archie net pay');
        await d.highlight(zoneCard(d)); await d.callout('pay', zoneCard(d), 'Archie: 12 ft of net pay', 'left');
      } },
    { id: 'why',
      say: 'Twelve feet of pay in a thirty nine foot oil column is too little. The resistivity in the oil leg is only three to seven ohm metres, and Archie reads all of that conductivity as water. Part of it is the clay.',
      sub: '12 ft of pay in a 39 ft oil column is too little. The resistivity in the oil leg is only 3 to 7 ohm·m, and Archie reads all of that conductivity as water. Part of it is the clay.',
      do: async (d, shared) => {
        await d.clearCallouts(); await d.unhighlight();
        const { y, b } = shared.values.zoom;
        await d.moveTo({ x: b.x + b.width * 0.17, y: y - 30 }, { ms: 900 });   // RT track, oil leg
        await d.sleep(1500);
        await d.moveTo({ x: b.x + b.width * 0.17, y: y + 10 }, { ms: 1400 });
      } },
    { id: 'indonesia',
      say: 'So we switch to the Indonesia equation, which separates the clay conductivity from the water. It needs the shale resistivity, which we read in the Ogbia Shale just above: about two point one ohm metres.',
      sub: 'So we switch to the Indonesia equation, which separates the clay conductivity from the water. It needs the shale resistivity, which we read in the Ogbia Shale just above: about 2.1 ohm·m.',
      do: async (d) => {
        await d.select('petro-param-swMethod', 'indonesia');
        await d.type('petro-param-rsh', '2.1');
        await d.click('petro-params-apply');
      } },
    { id: 'result',
      say: 'Net pay is now thirty one and a half feet, which agrees with the oil column and the net to gross of this sand. The saturation model moved the answer by a factor of two and a half, and the studio shows exactly why.',
      sub: 'Net pay is now 31.5 ft, which agrees with the oil column and the net-to-gross of this sand. The saturation model moved the answer by a factor of 2.5, and the studio shows exactly why.',
      do: async (d) => {
        await expectText(d, zoneCard(d), /net pay 31\.5 ft/, 'Indonesia net pay');
        await d.highlight(zoneCard(d)); await d.callout('pay2', zoneCard(d), 'Indonesia, Rsh 2.1: 31.5 ft', 'left');
      } },

    { id: 'publish', chapter: 'Publish', chapterSub: 'For the rest of the Suite',
      say: 'Publish sends the zone to the shared registry, with every parameter that produced it. ReservoirCalc Pro and the other studios read it from there.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.click(`petro-zone-publish-${ZONE}`); await d.waitFor(`petro-zone-published-${ZONE}`); await d.highlight(`petro-zone-published-${ZONE}`); } },
    { id: 'close',
      say: 'In the next video we check that water resistivity two independent ways, and then we put ranges on the answer.',
      do: async (d) => { await d.unhighlight(); await d.moveTo({ x: 1300, y: 600 }); } },
  ],
};
