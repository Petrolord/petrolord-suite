// Basin Modelling with Petrolord, Lesson A3: burial history and decompaction.
import { login, expectText, openBf, enterExpert, openModel, simulate, resultsTab, deleteModels, seedModel, t, tab, bfLessonMeta } from './bf-common.mjs';

const NAME = 'Lesson A3: Ekene-1';
export default {
  id: 'lesson-bf-a3',
  ...bfLessonMeta(3, 'A', 'Burial history *and decompaction*', 'How the layers were buried, deposition through time, the step and compaction'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await seedModel(shared, 'ek1-calibrated', NAME);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await openModel(d, NAME);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'run', chapter: 'The burial history', chapterSub: 'Ekene-1, thirty million years',
      say: 'Ekene-1 is dated and has its lithologies. Simulate, and open the burial plot: depth against time, each layer drawn from when it was laid down to the present, the oldest at the left.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'burial', { onCamera: true });
        await d.sleep(3000);
      } },
    { id: 'decompaction', chapter: 'Decompaction', chapterSub: 'Thicker when young',
      say: 'Each layer is thicker near the surface than it is today. The engine keeps the solid grains of every layer and lets the pore space close with depth, following Sclater and Christie\'s porosity curves: sand at forty nine percent at the surface, shale at sixty three, shale compacting faster.',
      do: async (d) => {
        await d.moveTo(t(d, 'bf-results-tab-burial')); await d.sleep(500);
        await d.page.mouse.move(900, 600, { steps: 20 }); await d.sleep(5000);
      } },
    { id: 'eroded',
      say: 'The hatched band is the eroded section at the Oboro Unconformity: deposited during the hiatus, then removed sixteen point four million years ago. Below it, the burial curves step back up as the load comes off.',
      do: async (d) => { await d.sleep(4500); } },
    { id: 'instant', chapter: 'Deposition through time', chapterSub: 'Instant against continuous',
      say: 'Compare instant deposition, where each layer appears whole at its start age: switch it in Global History and run. The Benin Formation, two thousand six hundred feet of sand, now drops in at once five point three million years ago, and every curve below it jumps. Continuous deposition builds each layer at its own rate, which is what a delta does.',
      sub: 'Compare instant deposition, where each layer appears whole at its start age: switch it in Global History and run. The Benin Formation, 2,625 ft of sand, now drops in at once 5.3 million years ago, and every curve below it jumps. Continuous deposition builds each layer at its own rate, which is what a delta does.',
      do: async (d) => {
        await tab(d, 'properties', { onCamera: true });
        await t(d, 'bf-deposition').scrollIntoViewIfNeeded();
        await d.select(t(d, 'bf-deposition'), 'instant');
        await d.select(t(d, 'bf-time-step'), '1');
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'burial', { onCamera: true });
        await d.sleep(5000);
      } },
    { id: 'step',
      say: 'The time step matters for the same reason: at one million years, the Ekene Sand, laid down over six hundred thousand years, falls inside a single step. Back to continuous at a quarter of a million.',
      do: async (d) => {
        await tab(d, 'properties', { onCamera: true });
        await d.select(t(d, 'bf-deposition'), 'continuous');
        await d.select(t(d, 'bf-time-step'), '0.25');
        await simulate(d, { onCamera: false });
        await d.sleep(1000);
      } },
    { id: 'compaction', chapter: 'Compaction on unroofing', chapterSub: 'Elastic or maximum burial',
      say: 'Under Erosion, one more choice. Elastic compaction lets a layer re-expand as it is unroofed; maximum burial keeps it as tight as it was at its deepest, which is how shales behave. With four hundred and ninety two feet removed near the surface, the two hardly differ at Ekene, but in an uplifted basin they do.',
      sub: 'Under Erosion, one more choice. Elastic compaction lets a layer re-expand as it is unroofed; maximum burial keeps it as tight as it was at its deepest, which is how shales behave. With 492 ft removed near the surface, the two hardly differ at Ekene, but in an uplifted basin they do.',
      do: async (d) => {
        await tab(d, 'properties', { onCamera: true });
        await d.click(t(d, 'bf-history-tab-erosion'));
        await t(d, 'bf-compaction-mode').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'bf-compaction-mode')); await d.sleep(4500); await d.unhighlight();
      } },
  ],
};
