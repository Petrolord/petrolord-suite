// Shared by the "QI with Petrolord" lessons (Ekene kit v3, oilfield units).
// No subtitles (YouTube captions them). Lessons A1 and A2 share one project;
// a lesson's setup rebuilds it, so each can be recorded on its own.
import { createQiProject } from '../qi-common.mjs';

export const QI_SERIES = 'QI with Petrolord';
export const LESSON_PROJECT = 'Ekene QI lesson';
export const LESSON_WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
export const LESSON_VOLUMES = ['EKENE3D-full.sgy', 'EKENE3D-near.sgy', 'EKENE3D-mid.sgy', 'EKENE3D-far.sgy'];

export const qiLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: QI_SERIES,
  eyebrow: `${QI_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

/** Off camera: the lesson project as lesson A1 leaves it (both targets, dates set). */
export async function lessonProject(d, shared) {
  await createQiProject(d, shared, LESSON_PROJECT, LESSON_WELLS, LESSON_VOLUMES);
  await d.page.getByTestId('qi-target-Oboro Sand').click();
  const dates = d.page.locator('input[type="date"]');
  await dates.nth(0).fill('2018-06-01');
  await dates.nth(1).fill('2015-03-01');
  await d.sleep(1500);
}
