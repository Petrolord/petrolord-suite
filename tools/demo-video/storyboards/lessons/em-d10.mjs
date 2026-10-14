// Earth Modelling with Petrolord, Lesson D10: reconciling with ReservoirCalc
// Pro. Typed booked values give RCP's 18,058 acre-ft, 418 acres and 12.14
// MMstb; why the two apps agree; the leg averages; Prospect to RCP.
import { login, expectText, openEm, stackEkene, fluids, methods, typedBooked, build, t, vol, emLessonMeta } from './em-common.mjs';

const rcpCard = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

export default {
  id: 'lesson-em-d10',
  ...emLessonMeta(10, 'D', 'Reconciling with *ReservoirCalc Pro*', 'The booked case in both apps, the averages over the oil leg, and the prospect handoff'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Two apps, one field', chapterSub: 'They must agree on the same inputs',
      say: 'ReservoirCalc Pro and Earth Modeling read the same registry maps. On the same inputs they must give the same volume, or one of them is wrong. Typed value puts a single number on every node, so we type the booked values.',
      do: async (d) => {
        await methods(d, { phi: 'typed', sw: 'typed', ntg: 'typed' }, { onCamera: true });
        await t(d, 'em-typed').scrollIntoViewIfNeeded();
        await typedBooked(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'same', chapter: 'The same numbers', chapterSub: 'Cell by cell',
      say: 'Eighteen thousand and fifty eight acre feet of rock above the contact, over four hundred and eighteen acres, and twelve point one four million barrels. Both apps sum each map cell\'s thickness above the contact times its area, the same cells, so the numbers agree to the last figure ReservoirCalc Pro prints.',
      sub: '18,058 acre-feet of rock above the contact, over 418 acres, and 12.14 million barrels. Both apps sum each map cell\'s thickness above the contact times its area, the same cells, so the numbers agree to the last figure ReservoirCalc Pro prints.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.142$/, 'STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'avg', chapter: 'The leg averages', chapterSub: 'What a single tank needs',
      say: 'Under the table, the averages over the oil leg are the numbers a single tank calculation needs to give this volume. Here they are the booked values back. For a model built from the logs, they are what to set beside the booking, and the difference is explained property by property.',
      do: async (d) => {
        await expectText(d, t(d, 'em-hcavg-ekene-sand'), /NTG 0\.800, porosity 0\.200, Sw 0\.350/, 'leg averages');
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'prospect', chapter: 'Prospect to RCP', chapterSub: 'The zone carried across',
      say: 'Prospect to R C P opens ReservoirCalc Pro with the zone: the area with oil, the average column over it, and the properties that keep the model\'s pore volume. Its card reads the same twelve point one four million barrels, eighteen thousand and fifty eight acre feet and four hundred and eighteen acres, and the note says where each input came from.',
      sub: 'Prospect to RCP opens ReservoirCalc Pro with the zone: the area with oil, the average column over it, and the properties that keep the model\'s pore volume. Its card reads the same 12.14 million barrels, 18,058 acre-feet and 418 acres, and the note says where each input came from.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, rcpCard(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'RCP card');
        await d.highlight(rcpCard(d));
        await d.sleep(2500);
        await d.highlight(t(d, 'rcp-em-prospect'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
  ],
};
