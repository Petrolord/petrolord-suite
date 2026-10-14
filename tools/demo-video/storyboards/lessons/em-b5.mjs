// Earth Modelling with Petrolord, Lesson B5: upscaling the logs.
// How a well's curves become one value per zone: net reservoir by cutoffs,
// NTG in true vertical thickness, porosity over the net rock, Sw over the net
// rock above the contact; changing the Vsh cutoff and what moves.
import { login, expectText, openEm, stackEkene, fluids, build, t, vol, emLessonMeta } from './em-common.mjs';

const row = (d, well) => t(d, `em-logrow-ekene-sand-${well}-1`);

export default {
  id: 'lesson-em-b5',
  ...emLessonMeta(5, 'B', 'Upscaling *the logs*', 'Net reservoir cutoffs, true vertical thickness, porosity over net and Sw above the contact'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await fluids(d);
    await build(d);
    await t(d, 'em-view-qc').click();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'curves', chapter: 'The curves', chapterSub: 'As Petrophysics Studio published them',
      say: 'The model reads four curves Petrophysics Studio published for each well: effective porosity, shale volume, water saturation and permeability. Between the zone\'s top and base at the well, each sample stands for the true vertical thickness it spans, so a deviated well weighs the same as a vertical one.',
      do: async (d) => {
        await t(d, 'em-cutoffs').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-cutoffs'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'net', chapter: 'Net reservoir', chapterSub: 'Two cutoffs',
      say: 'A sample is net reservoir when its shale volume is at most zero point five and its porosity at least zero point zero eight, the Petrophysics defaults. Net to gross is the net thickness over the gross. At Ekene one that is ninety nine and a half feet of a hundred and five, zero point nine four eight.',
      sub: 'A sample is net reservoir when its shale volume is at most 0.5 and its porosity at least 0.08, the Petrophysics defaults. Net-to-gross is the net thickness over the gross. At Ekene-1 that is 99.5 ft of 105.0, 0.948.',
      do: async (d) => {
        await row(d, 'Ekene-1').scrollIntoViewIfNeeded();
        await expectText(d, row(d, 'Ekene-1'), /105\.0\s*99\.5\s*0\.948/, 'Ekene-1 net');
        await d.highlight(row(d, 'Ekene-1'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'phisw', chapter: 'Porosity and Sw', chapterSub: 'Over the net rock',
      say: 'Porosity is averaged over the net rock. Water saturation is averaged over the net rock above the contact, weighted by pore volume, because below the contact the logs read water. Ekene one gives zero point five five; Ekene three, higher on the structure, zero point five.',
      sub: 'Porosity is averaged over the net rock. Water saturation is averaged over the net rock above the contact, weighted by pore volume, because below the contact the logs read water. Ekene-1 gives 0.55; Ekene-3, higher on the structure, 0.50.',
      do: async (d) => {
        await expectText(d, row(d, 'Ekene-1'), /0\.550/, 'Ekene-1 Sw');
        await expectText(d, row(d, 'Ekene-3'), /0\.500/, 'Ekene-3 Sw');
        await d.highlight(row(d, 'Ekene-3'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'cutoff', chapter: 'Changing a cutoff', chapterSub: 'Shale volume 0.3',
      say: 'Cutoffs belong to the team. Tighten the shale cutoff to zero point three and build: the shalier samples drop out of the net. At Ekene one net to gross falls to zero point seven five, and the field from nine point eight one to eight point zero eight million barrels.',
      sub: 'Cutoffs belong to the team. Tighten the shale cutoff to 0.3 and build: the shalier samples drop out of the net. At Ekene-1 net-to-gross falls to 0.75, and the field from 9.81 to 8.08 million barrels.',
      do: async (d) => {
        await t(d, 'em-cut-vsh').scrollIntoViewIfNeeded();
        await d.type(t(d, 'em-cut-vsh'), '0.3');
        await build(d, { onCamera: true });
        await d.click('em-view-qc');
        await d.sleep(1200);
        await row(d, 'Ekene-1').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^8\.080$/, 'cut STOIIP');
        await d.highlight(vol(d, 'total', 'stoiip'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
  ],
};
