// Shared by the "Basin Modelling with Petrolord" lessons (Basin & Charge
// Modeling on the Ekene kit v4 and its basin files, oilfield units). No
// subtitles (YouTube captions them). Lessons save only models named
// "Lesson ..."; each setup removes its own first. Nothing writes to the
// registry.
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from '../basin-common.mjs';

export * from '../basin-common.mjs';

export const BF_SERIES = 'Basin Modelling with Petrolord';
export const bfLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: BF_SERIES,
  eyebrow: `${BF_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

/** A fixture row with changes (heat flow, calibration, settings), for seedModel's patch. */
export function fixtureWith(fixture, edit) {
  const row = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${fixture}.json`), 'utf8'));
  return edit(row) || row;
}
