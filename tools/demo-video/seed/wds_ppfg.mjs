// The Well Design Studio videos' pore pressure prognosis (run as a probe):
//   node tools/demo-video/probe.mjs tools/demo-video/seed/wds_ppfg.mjs   (PUBLISH=1 to publish)
// Pore Pressure Studio on Ekene-8, the Ekene Alpha platform's Oboro producer
// with sonic and density: the water column from the kit (35 m of water,
// mudline 60 m MD), Eaton's Poisson's ratio 0.30 (it puts the fracture
// gradient on the Ekene-1 leak-off tests, 13.74 ppg at 1,450 m, as the kit's
// designed prognosis does), the normal compaction trend fitted on shale
// picks between 300 and 4,000 ft below the mudline (GR at or above 60 API
// for the picks, one per 100 ft), Eaton sonic n 3, pressures from shale
// samples at GR 82 API (VSH 0.6 on the kit's 18/125 API lines). Publish
// writes PP, FP and OBG to Ekene-8, where the Well Design Studio mud window
// reads them by subsea depth (Prognosis from: Ekene-8). Adds three curves to
// Ekene-8 and replaces them on a re-run; no other well is touched.
import { login } from '../lib/session.mjs';

export const PPS = '/dashboard/apps/geoscience/pore-pressure-studio';
export const PP_SETTINGS = { wdFt: '114.83', mudlineFt: '196.85', nu: '0.3', pickCut: '60', from: '300', to: '4000', every: '100', cut: '82' };

export default {
  viewport: { w: 1440, h: 810 },
  async probe(d, shared, log) {
    const p = d.page;
    const s = PP_SETTINGS;
    p.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(p, shared.baseUrl, shared.env);
    await p.goto(`${shared.baseUrl}${PPS}`, { waitUntil: 'domcontentloaded' });
    await p.getByTestId('pp-well-row').first().waitFor({ timeout: 120000 });
    await d.sleep(3000);
    await p.getByTestId('pp-well-row').filter({ hasText: 'Ekene-8' }).first().click();
    await p.getByTestId('pp-prognosis-chart').waitFor({ timeout: 120000 });
    await d.sleep(3000);
    if (!(await p.getByTestId('pp-param-wd').isVisible().catch(() => false))) await p.getByRole('button', { name: 'Parameters' }).first().click();
    await p.getByTestId('pp-param-wd').fill(s.wdFt);
    await p.getByTestId('pp-param-mudline').fill(s.mudlineFt);
    await p.getByTestId('pp-param-nu').fill(s.nu);
    await p.getByTestId('pp-apply-params').click();
    await d.sleep(2500);
    await p.getByTestId('pp-view-nct').click();
    await d.sleep(2000);
    await p.getByTestId('pp-shale-cutoff').fill(s.pickCut);
    await p.getByTestId('pp-shale-from').fill(s.from);
    await p.getByTestId('pp-shale-to').fill(s.to);
    await p.getByTestId('pp-shale-every').fill(s.every);
    await p.getByTestId('pp-auto-pick').click();
    await d.sleep(1500);
    log('picks', await p.getByTestId('pp-fit-nct').innerText());
    await p.getByTestId('pp-fit-nct').click();
    await d.sleep(2500);
    log('nct', await p.getByTestId('pp-nct-current').innerText().catch(() => '?'));
    await p.getByTestId('pp-shale-cutoff').fill(s.cut);
    await d.sleep(1000);
    const cb = p.getByTestId('pp-shale-pressures');
    if (!(await cb.isChecked())) await cb.check();
    await p.getByTestId('pp-apply-params').click();
    await d.sleep(2500);
    await p.getByTestId('pp-view-prognosis').click().catch(() => {});
    await d.sleep(2500);
    log(await p.getByTestId('pp-drilling-window').innerText().catch(() => '?'));
    for (const z of ['3000', '4500', '5000', '6000', '6500']) {
      await p.getByTestId('pp-readout-depth').fill(z);
      await d.sleep(500);
      log(z, 'ft bml', await p.getByTestId('pp-readout-pp').innerText(), await p.getByTestId('pp-readout-fg').innerText(), await p.getByTestId('pp-readout-obg').innerText());
    }
    await p.screenshot({ path: '/tmp/wds-ppfg-seed.png' });
    if (process.env.PUBLISH) {
      await p.getByTestId('pp-publish').click();
      await d.sleep(4000);
      log('status', await p.getByTestId('pp-status').innerText().catch(() => '?'));
    }
  },
};
