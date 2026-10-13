// Well Design with Petrolord, Lesson C8: how wrong the line might be. The
// ISCWSA MWD Rev 4 error model on every station: ellipses of uncertainty
// on the plan view, the band on the section, growth with depth, the
// survey program (instrument per interval, tie-on at a tool change) and
// what the model needs (the cached magnetic field).
import { login, expectText, lessonSite, dialog, t, wdsLessonMeta } from './wds-common.mjs';

const SITE = 'Lesson C8: Ekene Alpha';
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();

export default {
  id: 'lesson-wds-c8',
  ...wdsLessonMeta(8, 'C', 'How wrong *the line might be*', 'The ISCWSA error model, ellipses of uncertainty and the survey program'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonSite(d, shared, SITE, { kop: '500' });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'line', chapter: 'A line, and its shape', chapterSub: 'Uncertainty on every station',
      say: 'A trajectory is a line. A well plan is a line plus how wrong that line might be, because every survey station is a measurement with errors in it. Turn the uncertainty off, and on again.',
      do: async (d) => {
        await d.sleep(1000);
        await d.click(view(d, 'Plots'));
        await d.sleep(2000);
        const eou = d.page.getByRole('button', { name: /EOU/ }).first();
        await d.click(eou);
        await d.sleep(2500);
        await d.click(eou);
        await d.sleep(2500);
      } },
    { id: 'ellipses', chapter: 'Ellipses', chapterSub: 'Two standard deviations',
      say: 'The ellipses on the plan view are two standard deviations of where the hole could be at each station, and the dashed lines on the section are the same thing in true vertical depth. Near the surface the well is known almost exactly. Six thousand feet of hole later it is known rather less, and the ellipses grow along and across the hole.',
      sub: 'The ellipses on the plan view are two standard deviations of where the hole could be at each station, and the dashed lines on the section are the same thing in true vertical depth. Near the surface the well is known almost exactly. 6,000 ft of hole later it is known rather less, and the ellipses grow along and across the hole.',
      do: async (d) => {
        await d.highlight(t(d, 'plan-view-chart'));
        await d.sleep(5000);
        await d.unhighlight();
        await d.highlight(t(d, 'section-view-chart'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'model', chapter: 'The error model', chapterSub: 'ISCWSA MWD Rev 4',
      say: 'They come from the industry model, I. S. C. W. S. A. M. W. D. revision four: twenty seven error sources, from depth measurement through the accelerometers and magnetometers to the magnetic reference, drill string interference, sag and misalignment, carried through the survey geometry into a covariance at every station. The implementation reproduces the standard\'s own example well to numerical precision.',
      sub: 'They come from the industry model, ISCWSA MWD Rev 4: 27 error sources, from depth measurement through the accelerometers and magnetometers to the magnetic reference, drill string interference, sag and misalignment, carried through the survey geometry into a covariance at every station. The implementation reproduces the standard\'s own example well to numerical precision.',
      do: async (d) => {
        await d.click(view(d, '3D'));
        await t(d, 'wp-cube-view').waitFor({ timeout: 30000 });
        await d.sleep(9000);
      } },
    { id: 'program', chapter: 'The survey program', chapterSub: 'Instruments by interval',
      say: 'The survey program says which instrument surveys which interval, and the intervals must cover the well from surface to total depth with no gaps. At a tool change the uncertainty carried so far freezes, and the new tool grows its own from that tie-on, as the standard specifies.',
      do: async (d) => {
        await d.click(t(d, 'open-survey-program'));
        await dialog(d).getByText(/Survey program/).first().waitFor();
        await d.sleep(1200);
        await d.highlight(dialog(d));
        await d.sleep(6000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'needs',
      say: 'The model needs the magnetic field at the well. Here it is the one the wellbore cached from the World Magnetic Model: declination, dip and total field. A wellbore without it gets a message naming what is missing, never a quiet default.',
      do: async (d) => {
        const line = d.page.getByText(/^Wellhead 401705\.0 E/).first();
        await d.click(view(d, 'Section'));
        await d.sleep(1000);
        await d.highlight(line);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Lesson nine',
      say: 'The same covariances drive the separation rule. Next, anti-collision against the four wells already on Ekene Alpha.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
