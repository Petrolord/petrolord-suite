// Geoscience module showcase, scene 9c ("and more" montage 2/3): the pore
// pressure prognosis in Pore Pressure Studio on "PPS demo: Ekene-1" (the PPS
// demos' working copy; nothing is published here).
import { openStudio, pickWell, units, fitNct } from './pps-common.mjs';
import { login, scene, t, park } from './geo-common.mjs';

export default {
  ...scene('geo-s09c'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openStudio(d, shared);
    await pickWell(d);
    await units(d);
    await fitNct(d);
    await d.sleep(1500);
    await park(d);
  },
  steps: [
    { id: 'pp', chapterSub: 'Pore Pressure Studio',
      say: 'pore pressure and the drilling window,',
      do: async (d) => { await d.moveTo({ x: 1000, y: 790 }, { ms: 1500 }); } },
  ],
};
