// Shared by the "Petroleum Economics with Petrolord" lessons (Petroleum
// Economics Studio on the Ekene kit v4, 12-economics; US$, oilfield units).
// Every case a lesson makes is named "Lesson <id>: ..." and its setup deletes
// it first. No subtitles (YouTube captions them).
import { seedCase, deleteCases, FILES, KIT_CONSOLE } from '../epe-common.mjs';

export * from '../epe-common.mjs';

export const EPE_SERIES = 'Petroleum Economics with Petrolord';
export const epeLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: EPE_SERIES,
  eyebrow: `${EPE_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

/** The kit's full case (with Ekene-11) under a lesson name, optionally with runs. */
export async function lessonCase(d, shared, name, { runs = [], files = null } = {}) {
  // exact name: a prefix match would also delete "<name> without ..." cases
  await deleteCases(shared, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await seedCase(d, shared, name, {
    files: files || [['prod', FILES.prod, '2P'], ['capex', FILES.capex], ['opex', FILES.opex]],
    runs,
  });
}
export const KIT_RUN = (name, over = {}) => ({ name, cfg: { ...KIT_CONSOLE, ...over } });
