// Geoscience module showcase, scene 9b ("and more" montage 1/3): the rock
// physics template in Rock Physics Studio, Ekene-1 over the Ekene Sand.
import { selectRpsWell, ZONE_LABEL } from './qi-common.mjs';
import { login, scene, t, park, openApp } from './geo-common.mjs';

export default {
  ...scene('geo-s09b'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'rock-physics-studio', 'rp-well-row');
    await selectRpsWell(d, 'Ekene-1');
    await t(d, 'rp-view-crossplot').click(); await d.sleep(1200);
    await t(d, 'rp-xplot-zone').selectOption({ label: ZONE_LABEL }); await d.sleep(1500);
    const tpl = t(d, 'rp-xplot-templates');
    if (await tpl.count() && !(await tpl.isChecked().catch(() => true))) await tpl.check().catch(() => {});
    await d.sleep(1500);
    await park(d);
  },
  steps: [
    { id: 'rpt', chapter: 'And more', chapterSub: 'Rock Physics Studio',
      say: 'And more on the same wells: rock physics templates,',
      do: async (d) => { await d.moveTo(t(d, 'rp-crossplot-panel'), { ms: 1500, dx: 0.4, dy: 0.6 }); } },
  ],
};
