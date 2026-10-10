// QI lesson C9: a well without density, bulk shift, anchors, and committing
// the tie to the time-depth record. Figures from the 2026-10-10 probes (kit v3,
// after #977): Ekene-9 (sonic only, constant density 2.3 g/cc) statistical
// wavelet 26.9 Hz, best 0 ms r 0.58, tie QC mean 0.37; Ekene-1 best 0 ms r 0.76.
// Ekene-9's tie is not committed (it would weaken the field wavelet average).
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openSynthetics, clearTie } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const pickWell = async (d, name) => {
  const wells = await t(d, 'synth-well').locator('option').allInnerTexts();
  await d.select('synth-well', { label: wells.find((x) => new RegExp(`^${name}(?!\\d)`).test(x)) });
  await d.sleep(2500);
};

export default {
  id: 'lesson-qi-c9',
  ...qiLessonMeta(9, 'C', 'Shifts, anchors and *the time-depth record*', 'Tying a well with no density log, and committing a tie so every application reads the corrected time-depth'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await openSynthetics(d, shared);
    await clearTie(d, 'Ekene-1');
    await openSynthetics(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 9', chapterSub: 'Module C · Tying the wells',
      say: 'Last lesson built synthetics and compared wavelets. Now the tie itself: what to do when the synthetic is off, and how to make the correction stick, so that every application reading the well uses the same time-depth.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 9', title: 'Shifts, anchors and the time-depth record',
        body: '<ul><li>A well with no density log</li><li><b>Bulk shift</b> and <b>anchors</b></li><li><b>Commit</b>: one time-depth for every application</li></ul>' }) },
    { id: 'e9', chapter: 'No density', chapterSub: 'Seismolord · Synthetics · Ekene-9',
      say: 'Ekene nine was logged with a sonic but no density tool, so the only density on offer is a constant two point three grams per cc. Impedance contrasts then come from velocity alone. We extract a statistical wavelet, twenty six point nine hertz, and synthesize.',
      sub: 'Ekene-9 was logged with a sonic but no density tool, so the only density on offer is a constant 2.3 g/cc. Impedance contrasts then come from velocity alone. We extract a statistical wavelet, 26.9 Hz, and synthesize.',
      do: async (d) => {
        await d.hideSlide();
        await pickWell(d, 'Ekene-9');
        await d.highlight('synth-density');
        await d.click('synth-extract'); await d.sleep(5000);
        await expectText(d, 'synth-wavelet-info', /statistical wavelet, peak 26\.9 Hz/, 'Ekene-9 wavelet');
        await d.click('synth-run'); await d.sleep(4000);
      } },
    { id: 'e9tie',
      say: 'Suggest finds zero shift at a correlation of point five eight, and the tie quality down the well averages point three seven. On the wells with density it is point five to point six. Density carries real reflectivity, especially at shale-sand boundaries where the velocity barely changes. A sonic-only tie is usable for timing, but its wavelet is the weakest of the field, so we do not commit it into the study.',
      sub: 'Suggest finds zero shift at a correlation of 0.58, and the tie quality down the well averages 0.37. On the wells with density it is 0.5 to 0.6. Density carries real reflectivity, especially at shale-sand boundaries where the velocity barely changes. A sonic-only tie is usable for timing, but its wavelet is the weakest of the field, so we do not commit it into the study.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-suggest');
        await expectText(d, t(d, 'synth-suggest-result').first(), /best 0 ms \(r = 0\.58\)/, 'Ekene-9 suggest');
        await expectText(d, 'synth-qc-summary', /tie QC: mean r 0\.37/, 'Ekene-9 tie QC');
        await d.highlight('synth-tie-row');
      } },
    { id: 'shift', chapter: 'Bulk shift', chapterSub: 'One constant in time',
      say: 'When Suggest does find a shift, it is a constant: the whole synthetic moves up or down. A bulk shift usually means a datum problem, a wrong replacement velocity, or a static in the processing. A few milliseconds is common; tens of milliseconds says check the datums before you accept it.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Bulk shift', title: 'A constant time correction', body: '<ul><li>Datum, replacement velocity, statics</li><li>A few ms: common</li><li>Tens of ms: check the datums first</li></ul>' });
      } },
    { id: 'e1', chapter: 'Committing a tie', chapterSub: 'Ekene-1, with density',
      say: 'Now Ekene one, which has density. Its committed tie was cleared, so the synthetic is timed by the imported checkshots. Synthesize with the extracted wavelet, and Suggest: zero milliseconds again, at point seven six.',
      sub: 'Now Ekene-1, which has density. Its committed tie was cleared, so the synthetic is timed by the imported checkshots. Synthesize with the extracted wavelet, and Suggest: zero milliseconds again, at 0.76.',
      do: async (d) => {
        await d.hideSlide();
        await pickWell(d, 'Ekene-1');
        await d.click('synth-extract'); await d.sleep(5000);
        await d.click('synth-run'); await d.sleep(4000);
        await d.click('synth-suggest');
        await expectText(d, t(d, 'synth-suggest-result').first(), /best 0 ms \(r = 0\.7[4-8]\)/, 'Ekene-1 suggest');
        await expectText(d, 'synth-provenance', /T\(z\): checkshots$/, 'imported checkshots');
        await d.highlight(t(d, 'synth-suggest-result').first());
      } },
    { id: 'anchors', chapter: 'Anchors', chapterSub: 'Stretch and squeeze',
      say: 'A bulk shift moves everything. When the top ties and the bottom does not, the velocity is wrong somewhere in between, and anchors fix it: double-click an event on the synthetic and its match on the seismic, and the time-depth stretches or squeezes between anchors. Here the tie is already good, so we pin two anchors only to hold it.',
      do: async (d) => {
        await d.unhighlight();
        const box = await t(d, 'synth-canvas').boundingBox();
        const vh = await d.page.evaluate(() => window.innerHeight);
        const top = Math.max(box.y, 0) + 60; const bottom = Math.min(box.y + box.height, vh) - 40;
        for (const y of [top, bottom]) {
          await d.moveTo({ x: box.x + box.width * 0.85, y });
          await d.page.mouse.dblclick(box.x + box.width * 0.85, y);
          await d.sleep(700);
        }
        await expectText(d, 'synth-tie-row', /Anchors: 2/, 'two anchors');
        await d.highlight('synth-tie-row');
      } },
    { id: 'commit', chapter: 'The record', chapterSub: 'Commit to checkshots',
      say: 'Until now everything was display-side. Commit to checkshots writes the tie into the well\'s time-depth: the whole curve, through the warp, as derived checkshots, with the QC record of the tie beside it. From now on Well Data Manager, Rock Physics Studio and QI Studio all read the same time-depth for Ekene one.',
      sub: 'Until now everything was display-side. Commit to checkshots writes the tie into the well\'s time-depth: the whole curve, through the warp, as derived checkshots, with the QC record of the tie beside it. From now on Well Data Manager, Rock Physics Studio and QI Studio all read the same time-depth for Ekene-1.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-commit-checkshots');
        await d.page.getByText('Derived checkshots saved').first().waitFor({ timeout: 30000 });
        await d.sleep(1500);
        await d.highlight(d.page.getByText(/rows from the tie warp/).first());
      } },
    { id: 'undo',
      say: 'Synthesize again and the time-depth reads tie-derived, with the stored record of the tie: its correlation, its anchors, its wavelet and the date. The imported checkshots are never overwritten. Clear derived checkshots puts them back, so a tie can always be redone from the original data.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-run'); await d.sleep(4000);
        await expectText(d, 'synth-provenance', /tie-derived/, 'tie-derived T(z)');
        await expectText(d, 'synth-stored-qc', /Stored: Tie QC: mean correlation 0\.\d\d[\s\S]*2 anchors/, 'stored tie record');
        await d.highlight('synth-tie-row');
      } },
    { id: 'next',
      say: 'Next lesson: QI Studio gathers every committed tie, compares their wavelets, and averages them into the field wavelet the inversion will use.',
      do: async (d) => { await d.unhighlight(); await d.slide({ eyebrow: 'Next', title: 'The field wavelet', body: '<ul><li>Every tie in one table</li><li>Wavelets compared and averaged</li><li>Tie issues for the register</li></ul>' }); } },
  ],
};
