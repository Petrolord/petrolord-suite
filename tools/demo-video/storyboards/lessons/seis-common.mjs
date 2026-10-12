// Shared by the "Seismic Interpretation with Petrolord" lessons (Ekene kit
// v4, the listric growth fault, oilfield units). No subtitles (YouTube
// captions them). Lessons work on EKENE3D-v4-full.sgy, which the sales demos
// use too: a lesson only creates and removes items whose names start with
// "Lesson ", so the demos' horizons, faults and surfaces are never touched.
import path from 'node:path';

export const SEIS_SERIES = 'Seismic Interpretation with Petrolord';
/** Lesson-only files that are not in the kit (a SEG-Y with a wrong textual header),
 *  made by seed/seis_lesson_assets.py. */
export const LESSON_ASSETS = process.env.SEIS_LESSON_ASSETS || '/root/demo-video-work/seis-lessons-assets';
export const lessonAsset = (name) => path.join(LESSON_ASSETS, name);
/** Every item a lesson creates starts with this. */
export const LESSON_PREFIX = 'Lesson ';

export const seisLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: SEIS_SERIES,
  eyebrow: `${SEIS_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});
