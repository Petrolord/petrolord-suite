// Earth Modelling with Petrolord, Lesson C7: constant, trend, inverse
// distance, kriging and simulation (3D grid upgrade, 2026-10-17). The same
// upscaled porosity cells populated five ways, seen on one layer in the
// player; the model against the wells; the histograms.
import { login, expectText, openEm, stackEkene, fluids, methods, build, results, setRange, t, emLessonMeta } from './em-common.mjs';

const head = (d) => t(d, 'em-match-head-ekene-sand');

/** Build with a porosity method and show layer 10 in the player. */
async function show(d, phi) {
  await methods(d, { phi }, { onCamera: true });
  await build(d, { onCamera: true });
  await d.click('em-view-player');
  await d.sleep(1500);
  await d.select(t(d, 'em-player-prop'), 'phi');
  await setRange(t(d, 'em-player-k'), 9);
  await d.sleep(3500);
}

export default {
  id: 'lesson-em-c7',
  ...emLessonMeta(7, 'C', 'Constant, trend, kriging *and simulation*', 'Five ways to fill the grid between the wells, and how to tell them apart'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await methods(d, { phi: 'constant', ntg: 'idw', sw: 'idw' });
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'constant', chapter: 'Constant', chapterSub: 'The weighted mean everywhere',
      say: 'Four wells give porosity in every layer of the Ekene Sand. Constant puts the layer\'s thickness weighted mean in every cell of that layer: one colour across the map.',
      do: async (d) => { await show(d, 'constant'); } },
    { id: 'misfit', chapter: 'The model against the wells', chapterSub: 'What a constant misses',
      say: 'The Details tab sets the model against the wells. A constant misses the wells by up to zero point zero one nine in porosity.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await head(d).scrollIntoViewIfNeeded();
        await expectText(d, head(d), /Porosity 0\.019/, 'constant misfit');
        await d.highlight(head(d));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'trend', chapter: 'Trend', chapterSub: 'A plane through the wells',
      say: 'Trend fits a plane through the wells by least squares. It shows the direction the porosity changes, but a plane through four wells still misses them.',
      do: async (d) => { await show(d, 'trend'); } },
    { id: 'idw', chapter: 'Inverse distance', chapterSub: 'Through every well',
      say: 'Inverse distance weighs each well by one over the distance squared. It needs no variogram and passes through every well, and it makes bull\'s eyes around them.',
      do: async (d) => { await show(d, 'idw'); } },
    { id: 'okrige', chapter: 'Kriging', chapterSub: 'Smooth, and honest about it',
      say: 'Ordinary kriging weighs the wells by a variogram fitted from them. It passes through every well, smoothly, and gives the best single guess between them. Smooth is its weakness: real porosity is not that smooth.',
      do: async (d) => { await show(d, 'okrige'); } },
    { id: 'sgs', chapter: 'Simulation', chapterSub: 'Sequential Gaussian simulation',
      say: 'Sequential Gaussian simulation also honours every well, but draws each cell from the range of values the wells and its neighbours allow. The layer varies the way the logs vary, with the same histogram and the same variogram.',
      do: async (d) => { await show(d, 'sgs'); } },
    { id: 'hist', chapter: 'The histograms', chapterSub: 'The test that tells them apart',
      say: 'The histograms tell them apart. The simulated model keeps the spread of the logs; kriging would squeeze the porosity into a narrow peak near the mean. The volume is close either way, but flow in a simulator follows the spread.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await expectText(d, t(d, 'em-chart-hist'), /means 0\.187, 0\.185, 0\.187/, 'sgs histogram');
        await d.highlight('em-chart-hist');
        await d.sleep(5000);
        await d.unhighlight();
      } },
  ],
};
