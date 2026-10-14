// Earth Modelling with Petrolord, Lesson D11: volume uncertainty. The volume
// distribution with only the contact, then Bo, then the kriged properties;
// P90, P50 and P10 and why the low side is longer.
import { login, expectText, openEm, stackEkene, fluids, methods, build, t, emLessonMeta } from './em-common.mjs';

const run = async (d) => {
  await d.click('em-dist-run');
  await d.page.waitForFunction(() => /trials, seed/.test(document.querySelector('[data-testid="em-status"]')?.textContent || ''), null, { timeout: 300000 });
  await d.sleep(800);
};

export default {
  id: 'lesson-em-d11',
  ...emLessonMeta(11, 'D', 'Volume *uncertainty*', 'The Monte Carlo distribution on the model: contact, Bo and kriged properties'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await t(d, 'em-control').selectOption('logs');
    await t(d, 'em-layers-0').fill('5');
    await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' });
    await fluids(d);
    await build(d);
    await t(d, 'em-view-qc').click();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'card', chapter: 'The distribution', chapterSub: 'What can vary',
      say: 'The volume distribution re-runs the model\'s volume many times with the Suite\'s Monte Carlo sampler. The contact moves within a triangle either side, Bo within a percentage, and each kriged property by a number of its own standard deviations. The seed makes a run repeatable.',
      do: async (d) => {
        await t(d, 'em-dist').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-dist'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'contact', chapter: 'The contact alone', chapterSub: 'Thirty feet either way',
      say: 'First the contact alone, thirty feet either way. Untick the properties and set Bo to zero, then run. The oil column is only sixty seven feet, so the field ranges from seven point five four million barrels at P ninety to fourteen point six six at P ten.',
      sub: 'First the contact alone, 30 ft either way. Untick the properties and set Bo to zero, then run. The oil column is only 67 ft, so the field ranges from 7.54 million barrels at P90 to 14.66 at P10.',
      do: async (d) => {
        await d.click('em-dist-props');
        await d.type(t(d, 'em-dist-bo'), '0');
        await run(d);
        await t(d, 'em-dist-table').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-dist-ekene-sand-stoiip-p90'), /^7\.538$/, 'contact P90');
        await expectText(d, t(d, 'em-dist-ekene-sand-stoiip-p10'), /^14\.663$/, 'contact P10');
        await d.highlight(t(d, 'em-dist-table'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'all', chapter: 'Everything together', chapterSub: 'P90, P50 and P10',
      say: 'Now Bo within five percent and the kriged properties as well. P ninety is the low case, the tenth percentile of outcomes, and P ten the high case: seven point six six, eleven point one and fourteen point four nine million barrels. The range hardly moves. On Ekene the contact is the uncertainty that matters, and the one to pin down with pressure data.',
      sub: 'Now Bo within five percent and the kriged properties as well. P90 is the low case, the tenth percentile of outcomes, and P10 the high case: 7.66, 11.10 and 14.49 million barrels. The range hardly moves. On Ekene the contact is the uncertainty that matters, and the one to pin down with pressure data.',
      do: async (d) => {
        await d.type(t(d, 'em-dist-bo'), '5');
        await d.click('em-dist-props');
        await run(d);
        await t(d, 'em-dist-table').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'em-dist-ekene-sand-stoiip-p50'), /^11\.096$/, 'all P50');
        await expectText(d, t(d, 'em-dist-ekene-sand-stoiip-p10'), /^14\.493$/, 'all P10');
        await d.highlight(t(d, 'em-dist-table'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
  ],
};
