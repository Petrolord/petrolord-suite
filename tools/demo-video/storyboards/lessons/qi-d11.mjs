// QI lesson D11: CDP gathers on the seismic worker, the gather store, and
// prestack QC (fold, residual moveout, stretch mute). Kit v3 gathers are
// NMO-corrected and flat by construction. Needs the RMO estimator of engines
// #344 (Suite #980) on the worker. Figures: store 53248 traces in 13 bins of
// 200 m; QC (2026-10-10, after #980, #981, #982): 1024 CDPs, median fold 13,
// far offset 2500 m; 570 ms no coherent event; 1045 ms 100 percent coherent,
// median 2.3 ms, Q90 6.6; 1520 ms 100 percent, median 0.8, Q90 8.5; 3 low issues.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';
import { clearPrestackProducts, RMS_VELOCITY } from '../qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const qcResult = (d) => d.page.locator('[data-testid^="qi-pre-qc-result-"]').last();

export default {
  id: 'lesson-qi-d11',
  ...qiLessonMeta(11, 'D', 'Gathers on the worker, *and prestack QC*', 'Building a gather store from CDP gathers, and checking fold, residual moveout and stretch before AVO'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
    await clearPrestackProducts(d);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 11', chapterSub: 'Module D · From gathers to angle stacks',
      say: 'Module D goes back before the angle stacks, to the prestack gathers they are made from. A CDP gather holds every trace that reflected from one point in the subsurface, sorted by offset. AVO lives in these gathers, and so do the problems that can fake it: poor flattening, missing offsets and stretch.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 11', title: 'Gathers and prestack QC',
        body: '<ul><li>A <b>CDP gather</b>: one subsurface point, all offsets</li><li>AVO lives here, and so do its fakes</li><li>Check <b>fold</b>, <b>flatness</b> and <b>stretch</b></li></ul>' }) },
    { id: 'upload', chapter: 'The gather store', chapterSub: 'QI Studio · Prestack',
      say: 'The gather file was uploaded through Seismolord\'s import, straight to the seismic worker: a hundred and ten megabytes of NMO-corrected gathers, sorted by inline and then crossline. The offset is read from byte thirty seven of each trace header, the SEG-Y standard place.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-tab-prestack');
        await d.highlight('qi-pre-raw');
      } },
    { id: 'build',
      say: 'Building the store bins the offsets. The Ekene gathers were shot at offsets from a hundred to twenty five hundred metres every two hundred, so we bin at two hundred metres. Fifty three thousand traces land in thirteen offset bins.',
      sub: 'Building the store bins the offsets. The Ekene gathers were shot at offsets from 100 to 2,500 m every 200 m, so we bin at 200 m. 53,248 traces land in 13 offset bins.',
      do: async (d) => {
        await d.unhighlight();
        await d.type('qi-pre-bin', '200');
        await d.click(d.page.locator('[data-testid^="qi-pre-build-"]').first());
        await expectText(d, 'qi-pre-stores', /53248 traces, 13 offset bins of 200 m/, 'gather store');
        await d.highlight(d.page.getByText(/53248 traces, 13 offset bins of 200 m/));
      } },
    { id: 'what', chapter: 'What QC measures', chapterSub: 'Fold, flatness, stretch',
      say: 'Prestack QC samples a thousand CDPs across the survey. Fold counts the live offsets. Residual moveout asks whether each event is flat across offset, after the NMO correction; a curve left in an event moves amplitude between angles and fakes AVO. And stretch: NMO stretches the wavelet at far offsets and shallow times, lowering its frequency, so those samples are usually muted.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'What QC measures', title: 'Fold, residual moveout, stretch',
          body: '<ul><li><b>Fold</b>: live offsets per CDP</li><li><b>Residual moveout</b>: is each event flat across offset?</li><li><b>Stretch mute</b>: where NMO stretch passes 30 percent</li></ul>' });
      } },
    { id: 'run', chapter: 'QC the gathers', chapterSub: 'On the seismic worker',
      say: 'QC needs the velocity for the stretch mute, so we paste the same RMS velocity table, and run QC the gathers.',
      sub: 'QC needs the velocity for the stretch mute, so we paste the same RMS velocity table, and run QC the gathers.',
      do: async (d) => {
        await d.hideSlide();
        await d.type('qi-pre-vel', RMS_VELOCITY, { delay: 6 });
        await d.click(d.page.locator('[data-testid^="qi-pre-qc-"]:not([data-testid*="result"]):not([data-testid*="issues"])').first());
      },
      wait: async (d) => { await qcResult(d).waitFor({ timeout: 900000 }); await d.sleep(1000); },
      waitLabel: 'Minutes later' },
    { id: 'fold',
      say: 'A thousand and twenty four CDPs were sampled, every second one. The median fold is thirteen, so every offset bin is live, and the far covered offset is twenty five hundred metres: the full spread reaches the whole survey.',
      sub: 'A thousand and twenty four CDPs were sampled, every second one. The median fold is 13, so every offset bin is live, and the far covered offset is 2,500 m: the full spread reaches the whole survey.',
      do: async (d) => {
        await expectText(d, qcResult(d), /1024 CDPs sampled \(every 2\); median fold 13, far covered offset 2500 m/, 'fold');
        await d.highlight(qcResult(d).locator('p').first());
      } },
    { id: 'rmo',
      say: 'Residual moveout, time by time. At five hundred and seventy milliseconds no CDP holds a coherent event: that window sits in the Benin sands, with no reflector to measure, and QC says so. At ten forty five and fifteen twenty every sampled CDP has a coherent event, and the median far-offset residual is two point three and point eight milliseconds. These gathers are flat. The ninetieth percentiles, about seven and eight and a half milliseconds, are the noisiest CDPs; QC records that scatter as a low note and points to the residual map.',
      sub: 'Residual moveout, time by time. At 570 ms no CDP holds a coherent event: that window sits in the Benin sands, with no reflector to measure, and QC says so. At 1045 and 1520 ms every sampled CDP has a coherent event, and the median far-offset residual is 2.3 and 0.8 ms. These gathers are flat. The 90th percentiles, about 7 and 8.5 ms, are the noisiest CDPs; QC records that scatter as a low note and points to the residual map.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, qcResult(d), /570\s*0\s*no coherent event to measure[\s\S]*1045\s*100\s*2\.3[\s\S]*1520\s*100\s*0\.8/, 'residual moveout');
        await d.highlight(qcResult(d).locator('table').first());
      } },
    { id: 'stretch',
      say: 'The stretch mute column says how far out the data stays useful at each time: about a thousand metres at five hundred and seventy milliseconds, twenty one hundred at ten forty five, and nearly three thousand at fifteen twenty. Shallow events lose their far offsets first. At the reservoir, around thirteen hundred milliseconds, the full spread survives.',
      sub: 'The stretch mute column says how far out the data stays useful at each time: about 1,000 m at 570 ms, 2,100 m at 1045 ms, and nearly 3,000 m at 1520 ms. Shallow events lose their far offsets first. At the reservoir, around 1300 ms, the full spread survives.',
      do: async (d) => {
        await expectText(d, qcResult(d), /570[\s\S]*1028[\s\S]*1045[\s\S]*2131[\s\S]*1520[\s\S]*2969/, 'stretch mute');
      } },
    { id: 'next',
      say: 'With the gathers checked, the next lesson turns their offsets into angles and builds the near, mid and far stacks.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Angles from velocity', body: '<ul><li>Offset to incidence angle</li><li>Near, mid and far ranges</li><li>The usable angle</li></ul>' });
      } },
  ],
};
