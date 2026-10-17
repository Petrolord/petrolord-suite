// Earth Modelling with Petrolord, Lesson A2: tying the surfaces to the wells.
// The well-tie table (the six-well maps honour Ekene-1 to -4 exactly; Ekene-8
// and Ekene-9, drilled after the maps, miss), adjusting the surfaces to the
// tops, and the section with the tie residuals.
import { zonesAndCap, results, login, expectText, openEm, stackEkene, build, t, emLessonMeta, sectionPair } from './em-common.mjs';

const tie = (d, well, top) => t(d, `em-tie-${well}-${top}`);

export default {
  id: 'lesson-em-a2',
  ...emLessonMeta(2, 'A', 'Tying the surfaces *to the wells*', 'The tie table, wells drilled after the maps, and adjusting the surfaces to the tops'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await zonesAndCap(d, { cap: false });
    await build(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'table', chapter: 'The tie table', chapterSub: 'Pick depth minus the surface',
      say: 'Every well top that a surface is tied to is checked against it, in the Details tab of the results. The residual is the pick\'s depth below sea level minus the surface at that point, positive when the pick is deeper. The maps were gridded from Ekene one to four, so those ties are within a tenth of a foot.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-ties').scrollIntoViewIfNeeded();
        await expectText(d, tie(d, 'Ekene-1', 'Ekene Sand'), /^-?0\.0\d$/, 'Ekene-1 tie');
        await d.highlight(t(d, 'em-ties'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'misties', chapter: 'Wells drilled after the maps', chapterSub: 'Ekene-8 and Ekene-9',
      say: 'Ekene eight and Ekene nine were drilled from the platform after the maps were made. The surface is four point three feet deep of the pick at Ekene eight and eight point four feet shallow of it at Ekene nine. Ekene two sits on the edge of the mapped area.',
      sub: 'Ekene-8 and Ekene-9 were drilled from the platform after the maps were made. The surface is 4.3 ft deep of the pick at Ekene-8 and 8.4 ft shallow of it at Ekene-9. Ekene-2 sits on the edge of the mapped area.',
      do: async (d) => {
        await expectText(d, tie(d, 'Ekene-8', 'Ekene Sand'), /^-4\.27$/, 'Ekene-8 tie');
        await expectText(d, tie(d, 'Ekene-9', 'Ekene Sand'), /^8\.42$/, 'Ekene-9 tie');
        await d.highlight(tie(d, 'Ekene-8', 'Ekene Sand').locator('xpath=..'));
        await d.sleep(2500);
        await d.highlight(tie(d, 'Ekene-9', 'Ekene Sand').locator('xpath=..'));
        await d.sleep(2500);
        await d.highlight(tie(d, 'Ekene-2', 'Ekene Sand').locator('xpath=..'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'splits', chapter: 'Tops inside the zone', chapterSub: 'Ekene Sand Middle and Lower',
      say: 'The two tops inside the sand, Ekene Sand Middle and Ekene Sand Lower, split it into three zones. Each split surface sits at the fraction of the sand the wells pick it at, so it ties those wells: within a tenth of a foot at Ekene one.',
      do: async (d) => {
        await expectText(d, tie(d, 'Ekene-1', 'Ekene Sand Middle'), /^-?0\.0\d$/, 'Ekene-1 middle tie');
        await expectText(d, tie(d, 'Ekene-1', 'Ekene Sand Lower'), /^-?0\.0\d$/, 'Ekene-1 lower tie');
        await d.highlight(tie(d, 'Ekene-1', 'Ekene Sand Middle').locator('xpath=..'));
        await d.sleep(2000);
        await d.highlight(tie(d, 'Ekene-1', 'Ekene Sand Lower').locator('xpath=..'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'adjust', chapter: 'Adjust the surfaces', chapterSub: 'Through every tie',
      say: 'Adjust surfaces to the well tops warps each tied surface through its residuals, with a correction that fades to zero beyond the radius, three times the typical spacing between ties unless you type one. Build again.',
      do: async (d) => {
        await t(d, 'em-adjust-on').scrollIntoViewIfNeeded();
        await d.click('em-adjust-on');
        await d.sleep(800);
        await build(d, { onCamera: true });
      } },
    { id: 'after', chapter: 'After the adjustment', chapterSub: 'Every tie honoured',
      say: 'The adjustment card gives the largest residual before and after for each surface: eight point four feet on the top, now honoured to a fraction of a foot. The new wells are in the framework, the crest moves with them, and the zones inside the sand follow.',
      sub: 'The adjustment card gives the largest residual before and after for each surface: 8.4 ft on the top, now honoured to a fraction of a foot. The new wells are in the framework, the crest moves with them, and the zones inside the sand follow.',
      do: async (d) => {
        await results(d, 'details', { onCamera: true });
        await t(d, 'em-adjust-report').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-adjust-report'), /top \(6-well map\)\d8\.42/, 'max before');
        await d.highlight(t(d, 'em-adjust-report'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'section', chapter: 'The section', chapterSub: 'Through the platform wells',
      say: 'The section from Ekene one to Ekene four passes the platform. Each well shows its gamma ray and its tops, with the residual beside each tie, so a mis-tie is seen where it sits, and the three zones of the sand lie between the surfaces.',
      do: async (d) => {
        await d.click('em-view-section');
        await d.sleep(1000);
        await sectionPair(d, 'Ekene-1', 'Ekene-4');
        await d.sleep(4000);
      } },
  ],
};
