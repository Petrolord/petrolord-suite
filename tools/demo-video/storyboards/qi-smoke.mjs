// Recording check for the QI series: does the recorder's Chrome (Xvfb, no GPU,
// software WebGL) draw Seismolord's seismic and QI Studio smoothly at 30 fps?
import { login } from '../lib/session.mjs';

export default {
  id: 'qi-smoke',
  app: 'Seismolord and QI Studio',
  eyebrow: 'Pipeline check',
  title: 'Seismic on *camera*',
  subtitle: 'Software WebGL on the recording host',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await d.page.goto(`${shared.baseUrl}/dashboard/apps/geoscience/seismolord`, { waitUntil: 'domcontentloaded' });
    await d.page.getByTestId('sl-start-toggle').waitFor({ timeout: 120000 });
    await d.sleep(4000);
    const skip = d.page.getByTestId('sl-tour-skip');
    if (await skip.count()) await skip.click();
    const opt = d.page.locator('option', { hasText: 'EKENE3D-full.sgy' }).first();
    await opt.waitFor({ state: 'attached', timeout: 60000 });
    await d.page.locator('select', { has: opt }).first().selectOption({ label: 'EKENE3D-full.sgy' });
    await d.sleep(8000);
  },
  steps: [
    { id: 'section', chapter: 'Seismolord', chapterSub: 'Ekene 3D full stack',
      say: 'This is the Ekene three D full stack, open in Seismolord. We step through the inlines to see how smoothly the section redraws on camera.',
      do: async (d) => {
        await d.moveTo(d.page.getByTestId('sl-step-next'));
        for (let i = 0; i < 10; i++) { await d.page.getByTestId('sl-step-next').click(); await d.sleep(450); }
      } },
    { id: 'zoom',
      say: 'The player steps through the lines on its own. The Ekene Sand is the strong peak just above thirteen hundred milliseconds.',
      do: async (d) => {
        await d.page.getByTestId('sl-play').click();
        await d.sleep(5000);
        await d.page.getByTestId('sl-play').click();
      } },
    { id: 'qi', chapter: 'QI Studio', chapterSub: 'Setup',
      say: 'And QI Studio, where the wells, the targets and the seismic volumes for a quantitative interpretation are chosen.',
      do: async (d, shared) => {
        await d.page.goto(`${shared.baseUrl}/dashboard/apps/geoscience/qi-studio`, { waitUntil: 'domcontentloaded' });
        await d.waitFor('qi-tab-setup');
        await d.moveTo({ x: 500, y: 400 });
      } },
  ],
};
