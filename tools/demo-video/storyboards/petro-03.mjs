// Petrophysics Studio, video 3: how sure are we? (Ekene-1, feet)
// Figures from the 2026-10-09 dry run on main b2ce75e (kit v2) (200 realisations,
// seed 1); `expect` steps stop the take if the screen disagrees.
// The probabilistic Publish (percentile curves into the well's logs) is
// named, not clicked, so later takes of videos 1 and 2 start clean.
import { login, ZONE, openWell, ensureZones, video1State, zoomTracks, zoneCard, expectText } from './petro-common.mjs';

const zoneOption = async (d) => (await d.page.getByTestId('rcp-reg-zone').locator('option').allTextContents())
  .find((x) => x.startsWith(`${ZONE} (`));

export default {
  id: 'petro-03',
  app: 'Petrophysics Studio',
  eyebrow: 'Petrophysics Studio · 3 of 3',
  title: 'How sure are we? *P90, P50, P10*',
  subtitle: 'A probabilistic run on Ekene-1, what drives the range, and the hand-over to ReservoirCalc Pro',
  outroTitle: 'One suite, *one set of data*',
  outroSub: 'From raw logs to the volumes, every number traceable · petrolord.com',
  async setup(d, shared) {
    const t = (id) => d.page.getByTestId(id);
    await login(d.page, shared.baseUrl, shared.env);
    await openWell(d, shared);
    await ensureZones(d);
    await video1State(d);
    // video 2's result: the brine Rw at formation temperature
    await t('petro-rwtools').click(); await d.waitFor('petro-rwtools-dialog');
    await t('petro-rw-sal-ppm').fill('35000'); await t('petro-rw-sal-tempc').fill('182');
    await t('petro-rw-sal-apply').click(); await d.sleep(500); await d.page.keyboard.press('Escape');
    await d.sleep(800);
    await t(`petro-zone-publish-${ZONE}`).click(); await d.waitFor(`petro-zone-published-${ZONE}`);
    await zoomTracks(d, 5130, 9);
    await d.page.evaluate(() => window.__demo.moveTo(1500, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'From ranges to probabilities', chapterSub: 'Ekene-1, Ekene Sand at 39.0 ft',
      say: 'The low and high cases put every input at its pessimistic or optimistic end at the same time, which almost never happens. A probabilistic run samples all the uncertain inputs together, and counts how often each outcome occurs.',
      do: async (d) => { await expectText(d, zoneCard(d), /net pay 39\.0 ft/, 'starting net pay'); await d.highlight(zoneCard(d)); await d.sleep(2500); await d.unhighlight(); } },
    { id: 'dialog',
      say: 'The dialog starts from the same ranges. Six inputs vary: the clean sand line, shale porosity, matrix density, m, n and R w. Each takes a triangular distribution, set by its tenth, fiftieth and ninetieth percentiles.',
      sub: 'The dialog starts from the same ranges. Six inputs vary: the clean sand line, shale porosity, matrix density, m, n and Rw. Each takes a triangular distribution, set by its 10th, 50th and 90th percentiles.',
      do: async (d) => { await d.click('petro-probabilistic'); await d.waitFor('petro-prob-dialog'); await d.highlight('petro-prob-row-rw'); } },
    { id: 'run',
      say: 'Two hundred realisations, with a fixed seed so anyone can repeat the run exactly. It takes about two seconds.',
      sub: '200 realisations, with a fixed seed so anyone can repeat the run exactly. It takes about 2 seconds.',
      do: async (d) => {
        await d.unhighlight(); await d.click('petro-prob-run');
        await expectText(d, 'petro-prob-state', /200 realisations, seed 1, 6 parameters varied/, 'run state');
        await d.highlight('petro-prob-state');
      } },
    { id: 'pcases', chapter: 'P90, P50, P10', chapterSub: 'Net pay, Ekene Sand',
      say: 'For the Ekene Sand, net pay is thirty three feet at P ninety, thirty nine point seven at P fifty, and sixty six point two at P ten. So there is a ninety percent chance of at least thirty three feet, above the low case of thirty and a half, and the high case of ninety five is far out in the tail.',
      sub: 'For the Ekene Sand, net pay is 33.0 ft at P90, 39.7 ft at P50 and 66.2 ft at P10. So there is a 90% chance of at least 33.0 ft, above the low case of 30.5 ft, and the high case of 95.0 ft is far out in the tail.',
      do: async (d) => {
        await expectText(d, `petro-prob-net-${ZONE}-p90`, /^33\.0$/, 'P90');
        await expectText(d, `petro-prob-net-${ZONE}-p50`, /^39\.7$/, 'P50');
        await expectText(d, `petro-prob-net-${ZONE}-p10`, /^66\.2$/, 'P10');
        await d.unhighlight();
        await d.highlight(d.page.getByTestId(`petro-prob-net-${ZONE}-p50`).locator('xpath=ancestor::tr[1]'));
      } },
    { id: 'tornado', chapter: 'What drives the range', chapterSub: 'The tornado',
      say: 'The tornado shows which input moves the answer most. R w comes first, from thirty three and a half to sixty six and a half feet, ahead of m and matrix density. That is why we checked R w twice.',
      sub: 'The tornado shows which input moves the answer most. Rw comes first, from 33.5 to 66.5 ft, ahead of m and matrix density. That is why we checked Rw twice.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, `petro-prob-tornado-${ZONE}`, /rw\s*33\.5 to 66\.5/, 'tornado');
        await d.highlight(`petro-prob-tornado-${ZONE}`);
      } },
    { id: 'curves',
      say: 'The percentile curves and a pay probability curve can be published to the well as well. Here we take the zone on into a volume calculation.',
      do: async (d) => { await d.unhighlight(); await d.click(d.page.getByTestId('petro-prob-dialog').getByRole('button', { name: 'Close' })); } },
    { id: 'rcp', chapter: 'Into ReservoirCalc Pro', chapterSub: 'Same registry, no re-typing',
      say: 'ReservoirCalc Pro reads the published zone from the same registry.',
      do: async (d) => {
        await d.click('petro-home');
        await d.sleep(1200);
        await d.click(d.page.getByText('ReservoirCalc Pro', { exact: true }).first());
        await d.waitFor('rcp-tab-registry');
      } },
    { id: 'preview',
      say: 'We choose the Ekene Sand. Other wells have published it too, and this estimate is for Ekene one, so we untick them. The preview shows the porosity, water saturation, net to gross and gross thickness we just published.',
      sub: 'We choose the Ekene Sand. Other wells have published it too, and this estimate is for Ekene-1, so we untick them. The preview shows the porosity, water saturation, net-to-gross and gross thickness we just published.',
      do: async (d) => {
        await d.click('rcp-tab-registry');
        await d.select('rcp-reg-zone', { label: await zoneOption(d) });
        await d.sleep(800);
        const boxes = d.page.locator('[data-testid^="rcp-reg-use-"]');
        for (let i = 0; i < await boxes.count(); i++) {
          const b = boxes.nth(i);
          if ((await b.getAttribute('data-testid')) !== 'rcp-reg-use-Ekene-1' && await b.isChecked() && await b.isEnabled()) await d.click(b);
        }
        await expectText(d, 'rcp-reg-preview', /porosity 0\.184, Sw 0\.412, NTG 0\.371, gross thickness 105\.0 ft from Ekene-1$/, 'ReservoirCalc Pro preview');
        await d.highlight('rcp-reg-preview');
      } },
    { id: 'apply',
      say: 'Apply carries them into the volumetrics with their source recorded, and the oil in place recalculates at once. The report can trace every input back to the log.',
      do: async (d) => { await d.unhighlight(); await d.click('rcp-reg-apply-zone'); await expectText(d, 'rcp-reg-note', /Applied porosity/, 'applied'); await d.highlight('rcp-reg-note'); } },
    { id: 'close',
      say: 'From raw logs to a net pay we can defend, checked twice, with honest ranges, and handed on to the volumes. One suite, one set of data.',
      do: async (d) => { await d.unhighlight(); await d.moveTo({ x: 1200, y: 560 }); } },
  ],
};
