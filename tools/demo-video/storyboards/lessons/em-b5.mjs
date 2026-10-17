// Earth Modelling with Petrolord, Lesson B5: upscaling the logs (3D grid
// upgrade, 2026-10-17). How a well's curves become one value per 2.5 ft cell:
// net reservoir by cutoffs, NTG in true vertical thickness, porosity over the
// net rock, Sw over the net rock above the contact, the facies code that fills
// the cell; the histograms of logs and cells; changing the Vsh cutoff.
import { login, expectText, openEm, stackEkene, fluids, build, results, t, emLessonMeta } from './em-common.mjs';

const row = (d, well, k) => t(d, `em-logrow-ekene-sand-${well}-${k}`);

export default {
  id: 'lesson-em-b5',
  ...emLessonMeta(5, 'B', 'Upscaling *the logs*', 'Net reservoir cutoffs, 2.5 ft cells along each well, porosity over net, Sw above the contact and the facies'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await fluids(d);
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'curves', chapter: 'The curves', chapterSub: 'As Petrophysics Studio published them',
      say: 'The model reads the curves Petrophysics Studio published for each well: effective porosity, shale volume, water saturation, permeability and the rock physics facies. Each sample stands for the true vertical thickness it spans, so a deviated well weighs the same as a vertical one.',
      do: async (d) => {
        await t(d, 'em-cutoffs').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-cutoffs'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'cells', chapter: 'Into the cells', chapterSub: 'One row per well and layer',
      say: 'The grid cuts the sand into forty two layers, so each well gives forty two cells. The Details tab lists them. In the top cell at Ekene one, two and a half feet of sand, two feet of it net, porosity zero point one six seven, water saturation zero point five three and fifty six millidarcies.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-logrows-ekene-sand').scrollIntoViewIfNeeded();
        await expectText(d, row(d, 'Ekene-1', 1), /Ekene-1\s*1\s*2\.5\s*2\.0\s*0\.787\s*0\.167\s*0\.532\s*56\.2/, 'Ekene-1 cell 1');
        await d.highlight(row(d, 'Ekene-1', 1));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'net', chapter: 'Net reservoir', chapterSub: 'Shale volume and porosity cutoffs',
      say: 'A sample is net reservoir when its shale volume is at most zero point five and its porosity at least zero point zero eight, the Petrophysics defaults. Net to gross is the net thickness over the gross. A shale break gives a cell little or no net.',
      do: async (d) => {
        await t(d, 'em-logrows-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'sw', chapter: 'Water saturation', chapterSub: 'Above the contact only',
      say: 'Porosity is averaged over the net rock. Water saturation is averaged over the net rock above the contact, weighted by pore volume, because below the contact the logs read water. A cell wholly below the contact gives no water saturation; the model fills it from the cells that do.',
      do: async (d) => {
        await d.sleep(3500);
      } },
    { id: 'hist', chapter: 'Logs and cells', chapterSub: 'The histograms',
      say: 'On the charts, the histogram puts the porosity samples, the upscaled cells and the model side by side. Thin cells keep the spread of the logs, so the cells follow the samples closely.',
      do: async (d) => {
        await results(d, 'charts', { onCamera: true });
        await d.highlight('em-chart-hist');
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'facies', chapter: 'Facies', chapterSub: 'The code that fills each cell',
      say: 'Each cell also takes the rock physics facies code that fills most of it: shale, oil sand, brine sand or shaly sand. Porosity against permeability is coloured by those codes.',
      do: async (d) => {
        await d.highlight('em-chart-phik');
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'cutoff', chapter: 'Cutoffs belong to the team', chapterSub: 'Shale volume at 0.3',
      say: 'Tighten the shale cutoff to zero point three and build: the shalier samples drop out of the net, and the field goes from ten point seven one to eight point nine four million barrels.',
      do: async (d) => {
        await expectText(d, t(d, 'em-chart-volumes'), /Total 10\.71 MMstb/, 'before');
        await t(d, 'em-cut-vsh').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-cut-vsh'), '0.3');
        await build(d, { onCamera: true });
        await results(d, 'charts', { onCamera: true });
        await t(d, 'em-chart-volumes').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-chart-volumes'), /Total 8\.94 MMstb/, 'after');
        await d.highlight('em-chart-volumes');
        await d.sleep(3500);
        await d.unhighlight();
      } },
  ],
};
