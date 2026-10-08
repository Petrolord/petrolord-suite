// Petrophysics Studio, video 2: is our Rw right? (Ekene-1, feet)
// Figures from the 2026-10-08 dry run on main 053a117; `expect` steps stop
// the take if the screen disagrees with the narration.
import { login, ZONE, openWell, ensureZones, video1State, zoomTracks, zoneCard, expectText } from './petro-common.mjs';

export default {
  id: 'petro-02',
  app: 'Petrophysics Studio',
  eyebrow: 'Petrophysics Studio · 2 of 3',
  title: 'Is our *Rw* right?',
  subtitle: 'Two independent checks on the water resistivity, then low, mid and high cases for Ekene-1',
  outroTitle: 'Next: from ranges to *probabilities*',
  outroSub: 'P90, P50 and P10 net pay, and the hand-over to the volumes · petrolord.com',
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openWell(d, shared);
    await ensureZones(d);
    await video1State(d);
    await d.page.getByTestId(`petro-zone-publish-${ZONE}`).click();
    await d.waitFor(`petro-zone-published-${ZONE}`);
    await zoomTracks(d, 5130, 9);
    await d.page.evaluate(() => window.__demo.moveTo(1500, 500, 10));
  },
  steps: [
    { id: 'recap', chapter: 'Where we left off', chapterSub: 'Ekene-1, Ekene Sand',
      say: 'In the first video, Ekene one gave thirty one and a half feet of net pay, using a water resistivity from the Pickett plot. Before anyone books that number, we check the R w.',
      sub: 'In the first video, Ekene-1 gave 31.5 ft of net pay, using a water resistivity from the Pickett plot. Before anyone books that number, we check the Rw.',
      do: async (d) => {
        await expectText(d, zoneCard(d), /net pay 31\.5 ft/, 'starting net pay');
        await d.highlight(zoneCard(d)); await d.callout('start', zoneCard(d), '31.5 ft · Rw 0.0916 from the Pickett plot', 'left');
      } },
    { id: 'hingle', chapter: 'Check one: Hingle', chapterSub: 'Same water leg, another method',
      say: 'The Hingle plot fits the water leg a different way: a straight line through the origin, at our cementation exponent.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.click('petro-view-crossplot'); await d.click('petro-plot-hingle'); await d.type('petro-hingle-top', '5118.1'); await d.type('petro-hingle-base', '5183.7'); } },
    { id: 'hfit',
      say: 'It agrees: an R w of point zero nine two. That is reassuring, but it is not independent, because it reads the same samples as the Pickett fit.',
      sub: 'It agrees: an Rw of 0.092. That is reassuring, but it is not independent, because it reads the same samples as the Pickett fit.',
      do: async (d) => {
        await d.click('petro-hingle-fit');
        await expectText(d, 'petro-hingle-result', /Rw = 0\.091630 at m = 1\.843 · 76 pts · 55 shaly left out/, 'Hingle fit');
        await d.highlight('petro-hingle-result');
      } },
    { id: 'rwtools', chapter: 'Check two: the water itself', chapterSub: 'Rw from salinity at formation temperature',
      say: 'For an independent check we go to the water. The produced water in this field is thirty five thousand parts per million sodium chloride, and the formation is at one hundred and eighty two degrees Fahrenheit.',
      sub: 'For an independent check we go to the water. The produced water in this field is 35,000 ppm NaCl, and the formation is at 182 °F.',
      do: async (d) => {
        await d.unhighlight(); await d.click('petro-rwtools'); await d.waitFor('petro-rwtools-dialog');
        await d.type('petro-rw-sal-ppm', '35000'); await d.type('petro-rw-sal-tempc', '182');
      } },
    { id: 'brine',
      say: 'The brine gives an R w of point zero seven eight. Our log fit implies water near twenty nine thousand parts per million, fresher than the real thing. That gap is the clay, which conducts in the water leg too and makes the water line read high.',
      sub: 'The brine gives an Rw of 0.078. Our log fit implies water near 29,000 ppm, fresher than the real thing. That gap is the clay, which conducts in the water leg too and makes the water line read high.',
      do: async (d) => {
        await expectText(d, 'petro-rw-sal-result', /Rw = 0\.077617 at 182 °F/, 'brine Rw');
        await expectText(d, 'petro-rw-sal-implied', /about 29100 ppm/, 'implied salinity');
        await d.highlight('petro-rw-salinity-card');
      } },
    { id: 'apply',
      say: 'The water analysis is the better number, so we apply it.',
      do: async (d) => { await d.unhighlight(); await d.click('petro-rw-sal-apply'); await d.sleep(500); await d.page.keyboard.press('Escape'); await d.click('petro-view-tracks'); } },
    { id: 'pay',
      say: 'Net pay moves from thirty one and a half to thirty three feet. A small change, and the answer now rests on two independent measurements instead of one.',
      sub: 'Net pay moves from 31.5 to 33.0 ft. A small change, and the answer now rests on two independent measurements instead of one.',
      do: async (d) => {
        await expectText(d, zoneCard(d), /net pay 33\.0 ft/, 'net pay with brine Rw');
        await d.highlight(zoneCard(d)); await d.callout('pay', zoneCard(d), 'Brine Rw 0.0776: 33.0 ft', 'left');
      } },
    { id: 'cases', chapter: 'Low, mid and high', chapterSub: 'Every input has a range',
      say: 'Every input we chose has a range. The low, mid, high dialog moves them together: the clean sand line, shale porosity, matrix density, m and n, and R w.',
      sub: 'Every input we chose has a range. The Low, mid, high dialog moves them together: the clean sand line, shale porosity, matrix density, m and n, and Rw.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.click('petro-scenarios'); await d.waitFor('petro-scenarios-dialog'); await d.highlight('petro-sc-Low-rw'); await d.sleep(1500); await d.unhighlight(); } },
    { id: 'nets',
      say: 'For the Ekene Sand, net pay runs from twenty five feet in the low case to fifty and a half in the high case, with thirty three in the middle.',
      sub: 'For the Ekene Sand, net pay runs from 25.0 ft in the low case to 50.5 ft in the high case, with 33.0 ft in the middle.',
      do: async (d) => {
        await expectText(d, `petro-sc-net-${ZONE}-low`, /^25\.0$/, 'low case');
        await expectText(d, `petro-sc-net-${ZONE}-mid`, /^33\.0$/, 'mid case');
        await expectText(d, `petro-sc-net-${ZONE}-high`, /^50\.5$/, 'high case');
        await d.highlight(d.page.getByTestId(`petro-sc-net-${ZONE}-mid`).locator('xpath=ancestor::tbody[1]'));
      } },
    { id: 'bands',
      say: 'Apply draws the three cases as bands on the tracks, so the spread sits right against the logs.',
      do: async (d) => { await d.unhighlight(); await d.click('petro-scenarios-apply'); await d.sleep(800); } },
    { id: 'publish', chapter: 'Publish', chapterSub: 'The checked numbers',
      say: 'We publish the zone again, so the rest of the Suite reads the checked numbers.',
      do: async (d) => { await d.click(`petro-zone-publish-${ZONE}`); await expectText(d, `petro-zone-published-${ZONE}`, /matches these numbers/, 'published'); await d.highlight(`petro-zone-published-${ZONE}`); } },
    { id: 'close',
      say: 'The low and high cases stack every pessimistic or optimistic choice at once, which is unlikely. In the next video we turn these ranges into probabilities.',
      do: async (d) => { await d.unhighlight(); await d.moveTo({ x: 1300, y: 600 }); } },
  ],
};
