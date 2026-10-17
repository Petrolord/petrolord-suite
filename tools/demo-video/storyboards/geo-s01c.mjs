// Geoscience module showcase, scene 1c: the cold open's last shot, the
// Earth Modeling 3D grid with its skeleton, coloured by zone (VE 10, every
// fifth line), the cap hidden, turning slowly. Built off camera, not saved.
import { login, scene, park } from './geo-common.mjs';
import { openEm, gridModel, build, collapseDock, grid3d, t } from './geo-em.mjs';

export default {
  ...scene('geo-s01c', { leadIn: 0.3 }),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await gridModel(d);
    await build(d);
    await collapseDock(d);
    await grid3d(d, { ve: 10, onCamera: false });
    const dens = (await t(d, 'em-3d-density').locator('option').allInnerTexts()).find((x) => /5/.test(x));
    if (dens) await t(d, 'em-3d-density').selectOption({ label: dens });
    await t(d, 'em-3d-zone-0').click();
    await d.sleep(3000);
    await park(d, 1500, 900);
  },
  steps: [
    { id: 'model',
      say: 'From the first log to the last cell of the model.',
      do: async (d) => {
        const c = t(d, 'em-3d-canvas');
        const b = await c.boundingBox();
        const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
        await d.page.mouse.move(cx, cy); await d.page.mouse.down();
        for (let i = 1; i <= 30; i++) { await d.page.mouse.move(cx - (200 * i) / 30, cy); await d.sleep(45); }
        await d.page.mouse.up();
      },
      hold: 0.6 },
  ],
};
