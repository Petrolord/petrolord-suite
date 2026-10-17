// Geoscience module showcase, scene 9a: the volumes in ReservoirCalc Pro.
// The booked Ekene Sand case on the six-well map (RCP 12.14) run as a Monte
// Carlo with the evidenced ranges of rcp-02 (50,000 realisations, fixed seed).
import { bookedCase, stoiip, toProbabilistic, setDist, runSettings, RANGES, openRcp, dialog } from './rcp-common.mjs';
import { login, expectText, scene, t, park } from './geo-common.mjs';

const next = (d) => d.page.getByRole('button', { name: /^Next/ });
const body = (d) => d.page.locator('body');

export default {
  ...scene('geo-s09'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await stoiip(d);
    await toProbabilistic(d);
    await t(d, 'rcp-sim-setup-toggle').click();
    for (const [k, v] of Object.entries(RANGES.after)) await setDist(d, k, v);
    await next(d).click(); await d.sleep(400);
    await runSettings(d);
    await next(d).click(); await d.sleep(400);
    await park(d);
  },
  steps: [
    { id: 'run', chapter: 'Volumes', chapterSub: 'ReservoirCalc Pro',
      say: 'The volumes go to ReservoirCalc Pro: the mapped structure, the contact and the rock properties, sampled fifty thousand times.',
      do: async (d) => {
        await d.click('rcp-mc-run');
        await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
        await d.sleep(1200);
      } },
    { id: 'dist',
      say: 'P ninety, eleven point three two; P fifty, twelve point one four; and P ten, thirteen million stock tank barrels.',
      sub: 'P90, 11.32; P50, 12.14; and P10, 13.00 million stock tank barrels.',
      do: async (d, shared) => {
        await expectText(d, body(d), /12\.14[\s\S]{0,120}11\.32[\s\S]{0,120}13\.00/, 'P50, P90 and P10');
        await d.click(d.page.getByRole('button', { name: /View Full Analysis/ }));
        await dialog(d).waitFor({ timeout: 30000 });
        await d.sleep(2500);
      } },
  ],
};
