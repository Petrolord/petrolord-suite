// Well Testing with Petrolord, Lesson C9: splitting the skin. Ekene-5:
// partial penetration (Papatzacos), kv/kh, and the mechanical skin left; the
// slant term of a deviated well (Ekene-11).
import { expectText, setupTest, tab, kpi, fill, pick, railRow, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-c9',
  ...wtLessonMeta(9, 'C', 'Splitting *the skin*', 'Partial penetration, kv/kh, a slanted well, and the damage that is left'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson C9: Ekene-5 skin', test: 'e5', tabName: 'Match' });
    await pick(d, 'Reservoir model', /Homogeneous \+ sealing fault/);
    await d.page.getByRole('button', { name: /Auto-fit model/ }).click();
    await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
  },
  steps: [
    { id: 'total', chapter: 'A total skin', chapterSub: 'Five point three five',
      say: 'The match gave Ekene-5 a skin of five point three five. A skin is every extra pressure drop near the well, lumped together: damage, but also geometry. Only damage can be removed, so the total has to be split before anyone pays for a stimulation.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Skin'), /^5\.35/, 'skin');
        await d.highlight(kpi(d, 'Skin')); await d.sleep(3000); await d.unhighlight();
        await tab(d, 'Data', { onCamera: true });
      } },
    { id: 'perfs', chapter: 'Partial penetration', chapterSub: 'Four metres of eight',
      say: 'Ekene-5 is perforated over the top four metres of an eight metre oil column, to stay away from the water. Flow converges on that interval, and Papatzacos gives the pseudo-skin it costs from the perforated length, its position and k v over k h: two point one six.',
      do: async (d) => {
        const r = t(d, 'wts-completion-readout');
        await r.scrollIntoViewIfNeeded();
        await expectText(d, r, /Partial-penetration pseudo-skin 2\.16/, 'spp');
        await d.highlight(r); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'kvkh', chapter: 'kv over kh', chapterSub: 'Assumed unless entered',
      say: 'The vertical permeability is rarely measured, so the studio assumes zero point one and says so. Type zero point five and the geometry costs less, one point six seven: the split depends on an input you should source.',
      do: async (d) => {
        await fill(d, [[/^kv\/kh/, '0.5']], { onCamera: true }); await d.sleep(1000);
        await expectText(d, t(d, 'wts-completion-readout'), /Partial-penetration pseudo-skin 1\.67/, 'spp 0.5');
        await d.highlight(t(d, 'wts-completion-readout')); await d.sleep(2500); await d.unhighlight();
        await fill(d, [[/^kv\/kh/, '']], { onCamera: true }); await d.sleep(800);
      } },
    { id: 'mech', chapter: 'The damage', chapterSub: 'What is left',
      say: 'What is left is the mechanical skin, scaled back to the perforated length: one point nine nine. That is the part a stimulation could remove. The Report tab lays the split out with the formula and the reference for each term.',
      do: async (d) => {
        await expectText(d, railRow(d, 'Mechanical skin'), /1\.99/, 'mech');
        await d.highlight(railRow(d, 'Mechanical skin')); await d.sleep(2000); await d.unhighlight();
        await tab(d, 'Report', { onCamera: true });
        const tbl = d.page.getByText('Skin components', { exact: false }).first();
        await tbl.scrollIntoViewIfNeeded(); await d.highlight(tbl.locator('xpath=..')); await d.sleep(3000); await d.unhighlight();
      } },
    { id: 'slant', chapter: 'A slanted well', chapterSub: 'Ekene-11',
      say: 'A deviated well adds a slant term, from the measured and vertical depths of its perforations. Ekene-11 crosses the sand at twenty three degrees; with k v over k h of zero point one that is worth almost nothing, minus zero point zero three, and its mechanical skin of two point nine nine is nearly all of the damage. Demo two of this series reads that test.',
      do: async (d) => { await d.sleep(6000); } },
  ],
};
