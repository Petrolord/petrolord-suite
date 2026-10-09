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
      say: 'Six inputs vary: the clean sand line, shale porosity, matrix density, m, n and R w. Each takes a triangular distribution, set by its tenth, fiftieth and ninetieth percentiles. We use the same tightened ranges for R w and m as in the low and high cases.',
      sub: 'Six inputs vary: the clean sand line, shale porosity, matrix density, m, n and Rw. Each takes a triangular distribution, set by its 10th, 50th and 90th percentiles. We use the same tightened ranges for Rw and m as in the low and high cases.',
      do: async (d) => {
        await d.click('petro-probabilistic'); await d.waitFor('petro-prob-dialog'); await d.highlight('petro-prob-row-rw');
        await d.type('petro-prob-rw-q10', '0.0699'); await d.type('petro-prob-rw-q90', '0.0854');
        await d.unhighlight(); await d.highlight('petro-prob-row-m');
        await d.type('petro-prob-m-q10', '1.565'); await d.type('petro-prob-m-q90', '1.665');
      } },
    { id: 'run',
      say: 'Two hundred realisations, with a fixed seed so anyone can repeat the run exactly. It takes about two seconds.',
      sub: '200 realisations, with a fixed seed so anyone can repeat the run exactly. It takes about 2 seconds.',
      do: async (d) => {
        await d.unhighlight(); await d.click('petro-prob-run');
        await expectText(d, 'petro-prob-state', /200 realisations, seed 1, 6 parameters varied/, 'run state');
        await d.highlight('petro-prob-state');
      } },
    { id: 'pcases', chapter: 'P90, P50, P10', chapterSub: 'Net pay, Ekene Sand',
      say: 'For the Ekene Sand, net pay is thirty four and a half feet at P ninety, thirty nine at P fifty, and fifty four point three at P ten. So there is a ninety percent chance of at least thirty four and a half feet, above the low case of thirty two and a half.',
      sub: 'For the Ekene Sand, net pay is 34.5 ft at P90, 39.0 ft at P50 and 54.3 ft at P10. So there is a 90% chance of at least 34.5 ft, above the low case of 32.5 ft.',
      do: async (d) => {
        await expectText(d, `petro-prob-net-${ZONE}-p90`, /^34\.5$/, 'P90');
        await expectText(d, `petro-prob-net-${ZONE}-p50`, /^39\.0$/, 'P50');
        await expectText(d, `petro-prob-net-${ZONE}-p10`, /^54\.3$/, 'P10');
        await d.unhighlight();
        await d.highlight(d.page.getByTestId(`petro-prob-net-${ZONE}-p50`).locator('xpath=ancestor::tr[1]'));
      } },
    { id: 'tornado', chapter: 'What drives the range', chapterSub: 'The tornado',
      say: 'The tornado shows which input moves the answer most. With R w pinned down, matrix density now comes first, from thirty six to fifty one point seven feet, ahead of R w. So the next measurement worth paying for is grain density from core.',
      sub: 'The tornado shows which input moves the answer most. With Rw pinned down, matrix density now comes first, from 36.0 to 51.7 ft, ahead of Rw. So the next measurement worth paying for is grain density from core.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, `petro-prob-tornado-${ZONE}`, /rhoMa\s*36\.0 to 51\.7\s*rw\s*36\.2 to 47\.5/, 'tornado');
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
