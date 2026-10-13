// Shared by the "Volumetrics with Petrolord" lessons (ReservoirCalc Pro on
// the Ekene kit v4, oilfield units, maps on the sea-level datum). No
// subtitles (YouTube captions them). Lessons read the booked six-well maps
// the demos use ("Ekene Sand top/base (6-well map)") and never change them;
// anything a lesson saves is named "Lesson ..." and its setup removes it.
export * from '../rcp-common.mjs';

export const RCP_SERIES = 'Volumetrics with Petrolord';
export const LESSON_PREFIX = 'Lesson ';
export const rcpLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: RCP_SERIES,
  eyebrow: `${RCP_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});
