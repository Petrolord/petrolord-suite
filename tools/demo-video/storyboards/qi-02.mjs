// QI Studio, video 2: tie the wells, then build the angle stacks (Ekene kit v3.3).
// Figures from the 2026-10-10 dry run on main fd93d53 + kit v3.3; `expect`
// steps stop the take if the screen disagrees with the narration.
// Before a take (setup, off camera): Ekene-1's committed tie is cleared so it
// is committed on camera; Ekene-2..4 stay tied; gather stores and angle
// stacks from an earlier take are removed (the raw gather upload stays).
import {
  login, expectText, openSynthetics, clearTie, clearPrestackProducts, openQiProject, RMS_VELOCITY,
} from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'qi-02',
  app: 'QI Studio',
  eyebrow: 'QI Studio · 2 of 3',
  title: 'Tie the wells, *build the angle stacks*',
  subtitle: 'Seismolord well ties and QI Studio prestack gathers on the Ekene field',
  outroTitle: 'Next: *AVO and inversion*',
  outroSub: 'Intercept and gradient checked at the wells, then the elastic inversion · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openQiProject(d, shared);
    await clearPrestackProducts(d);
    await openSynthetics(d, shared);
    await clearTie(d, 'Ekene-1');
    await openSynthetics(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'why', chapter: 'Tie the wells', chapterSub: 'Seismolord · Synthetics',
      say: 'The rock physics said the oil should dim the top of the Ekene Sand. Before we look for that in the seismic, each well has to sit at the right time on it. That is the well tie.',
      do: async (d) => {
        await d.highlight('synth', { pad: -6 });
        await d.sleep(800);
        await d.unhighlight();
      } },
    { id: 'synth',
      say: 'For Ekene one we build a synthetic from the sonic and the density, timed by the checkshots, with a wavelet extracted from the seismic at the well.',
      sub: 'For Ekene-1 we build a synthetic from the sonic and the density, timed by the checkshots, with a wavelet extracted from the seismic at the well.',
      do: async (d) => {
        const wells = await t(d, 'synth-well').locator('option').allInnerTexts();
        await d.select('synth-well', { label: wells.find((x) => /^Ekene-1(?!\d)/.test(x)) });
        await d.sleep(2500);
        await d.click('synth-extract');
        await expectText(d, 'synth-wavelet-info', /statistical wavelet, peak \d+\.\d Hz/, 'extracted wavelet');
        await d.click('synth-run');
        await d.sleep(4000);
      } },
    { id: 'suggest',
      say: 'Suggest searches for the best bulk shift: four milliseconds, at a correlation of about point seven. For real data, that is a good tie.',
      sub: 'Suggest searches for the best bulk shift: 4 ms, at a correlation of about 0.7. For real data, that is a good tie.',
      do: async (d) => {
        await d.click('synth-suggest');
        await expectText(d, d.page.getByTestId('synth-suggest-result').first(), /best -4 ms \(r = 0\.(6[89]|70)\)/, 'suggested shift');
        await d.highlight(d.page.getByTestId('synth-suggest-result').first());
      } },
    { id: 'commit',
      say: 'We apply it, pin it with two anchors, and commit. The well\'s whole time-depth now carries the tie, for every application that reads the well.',
      sub: 'We apply it, pin it with two anchors, and commit. The well\'s whole time-depth now carries the tie, for every application that reads the well.',
      do: async (d) => {
        await d.unhighlight();
        const apply = d.page.getByTestId('synth-apply-shift');
        if (await apply.count()) await d.click(apply);
        const box = await t(d, 'synth-canvas').boundingBox();
        const vh = await d.page.evaluate(() => window.innerHeight);
        const top = Math.max(box.y, 0) + 60; const bottom = Math.min(box.y + box.height, vh) - 40;
        for (const y of [top, bottom]) {
          await d.moveTo({ x: box.x + box.width * 0.85, y });
          await d.page.mouse.dblclick(box.x + box.width * 0.85, y);
          await d.sleep(600);
        }
        await d.click('synth-commit-checkshots');
        await d.sleep(3000);
      } },
    { id: 'ties', chapter: 'Every well tied', chapterSub: 'QI Studio · Well ties',
      say: 'QI Studio gathers the ties. The four wells correlate at about point six to point seven, and their extracted wavelets agree, so their average becomes the field wavelet for the inversion.',
      sub: 'QI Studio gathers the ties. The four wells correlate at about 0.6 to 0.7, and their extracted wavelets agree, so their average becomes the field wavelet for the inversion.',
      do: async (d, shared) => {
        await openQiProject(d, shared);
        await d.click('qi-tab-ties');
        await expectText(d, 'qi-ties', /Ekene-1\s*0\.\d\d[\s\S]*Ekene-4\s*0\.\d\d[\s\S]*Average \(field wavelet\)/, 'tie table');
        await d.highlight('qi-ties-table');
      } },
    { id: 'gathers', chapter: 'From gathers to angle stacks', chapterSub: 'QI Studio · Prestack',
      say: 'The prestack gathers live on the seismic worker. Built into a gather store with two hundred metre offset bins, they are fifty three thousand traces in thirteen bins.',
      sub: 'The prestack gathers live on the seismic worker. Built into a gather store with 200 m offset bins, they are 53,248 traces in 13 bins.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-prestack');
        await d.type('qi-pre-bin', '200');
        await d.click(d.page.locator('[data-testid^="qi-pre-build-"]').first());
        await expectText(d, 'qi-pre-stores', /53248 traces, 13 offset bins of 200 m/, 'gather store');
        await d.highlight(d.page.getByText(/53248 traces, 13 offset bins of 200 m/));
      } },
    { id: 'velocity',
      say: 'An R M S velocity function turns each offset into an incidence angle. We take the kit\'s velocity table and stack five to fifteen, fifteen to twenty five, and twenty five to thirty five degrees.',
      sub: 'An RMS velocity function turns each offset into an incidence angle. We take the kit\'s velocity table and stack 5 to 15, 15 to 25 and 25 to 35 degrees.',
      do: async (d) => {
        await d.unhighlight();
        await d.type('qi-pre-vel', RMS_VELOCITY, { delay: 8 });
        const R = [['near', 5, 15], ['mid', 15, 25], ['far', 25, 35]];
        for (const [k, [n, a, b]] of R.entries()) {
          await d.type(d.page.getByLabel(`Range ${k + 1} name`), n, { delay: 30 });
          await d.type(d.page.getByLabel(`Range ${k + 1} from`), String(a), { delay: 30 });
          await d.type(d.page.getByLabel(`Range ${k + 1} to`), String(b), { delay: 30 });
        }
      } },
    { id: 'stacks',
      say: 'Three angle stacks of four thousand traces each. The usable angle is thirty three degrees at every C D P, so the far stack has full fold up to about thirty three of its thirty five degrees.',
      sub: 'Three angle stacks of 4,096 traces each. The usable angle is 33 degrees at every CDP, so the far stack has full fold up to about 33 of its 35 degrees.',
      do: async (d) => {
        await d.click(d.page.locator('[data-testid^="qi-pre-stack-"]').first());
        // the project keeps the last run's line; wait for this run to finish and list its stacks
        await d.page.locator('[data-testid="qi-pre-stores"] .text-pl-success-text').last().waitFor({ timeout: 600000 });
        await d.page.locator('[data-testid^="qi-pre-convert-"]').nth(2).waitFor({ timeout: 120000 });
        const res = d.page.locator('[data-testid^="qi-pre-result-"]').first();
        await expectText(d, res, /near 5 to 15 degrees \(4096 traces\)[\s\S]*Q50 3[23]\.\d/, 'angle stacks');
        await d.highlight(res);
      } },
    { id: 'next',
      say: 'The gathers cover the wells\' part of the survey. The full survey near, mid and far stacks are already in Seismolord, and the next video runs the A V O on them.',
      sub: 'The gathers cover the wells\' part of the survey. The full-survey near, mid and far stacks are already in Seismolord, and the next video runs the AVO on them.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight('qi-pre-stacks');
      } },
  ],
};
