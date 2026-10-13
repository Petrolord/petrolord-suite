// Shared by the "Well Design with Petrolord" lessons (Well Design Studio,
// oilfield units: depths in feet, site coordinates in metres). Every site a
// lesson makes is named "Lesson ..." and its setup deletes it first. No
// subtitles (YouTube captions them). Plan: WDS-LESSON-PLAN.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export * from '../wds-common.mjs';

export const WDS_SERIES = 'Well Design with Petrolord';
export const wdsLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: WDS_SERIES,
  eyebrow: `${WDS_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

/** The first page of a downloaded PDF as a data URL (pdftoppm), for a slide. */
export function pdfPageDataUrl(pdfPath, { width = 1500 } = {}) {
  const out = path.join(path.dirname(pdfPath), `${path.basename(pdfPath, '.pdf')}-p1`);
  execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to-x', String(width), '-scale-to-y', '-1', pdfPath, out]);
  return `data:image/png;base64,${fs.readFileSync(`${out}.png`).toString('base64')}`;
}

/** Click a button that downloads a file and keep it under /tmp; returns the path. */
export async function download(d, target, name) {
  const wait = d.page.waitForEvent('download', { timeout: 90000 });
  await d.click(target);
  const dl = await wait;
  const p = path.join('/tmp', `wds-${Date.now()}-${name}`);
  await dl.saveAs(p);
  return p;
}

import {
  deleteSites, createSite, addSlots, confirmSite, buildPad, createWellbore, confirmWellbore, createDesign, targetFromSurface,
  confirmPick, solveJ, saveDesign, openStudio, selectDesign, tab, SLOTS, T1, ALL_VIDEO_SITES,
} from '../wds-common.mjs';

/**
 * Off camera: a lesson's platform. `pad` builds the full pad with the two
 * drilled neighbours (buildPad); otherwise just the site and its slots.
 * Then Ekene-11 on S5 with T1 from the Oboro Sand map (26.2 ft below) and
 * a design, optionally solved (build and hold, kickoff `kop`) and saved.
 * Ends with the design open on the Design tab.
 */
export async function lessonSite(d, shared, site, { pad = false, kop = null, design = 'Plan 1', extra = null } = {}) {
  await deleteSites(d, shared, ALL_VIDEO_SITES);
  if (pad) await buildPad(d, shared, site);
  else {
    await deleteSites(d, shared, new RegExp(`^${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await createSite(d, site);
    await addSlots(d, SLOTS);
    await confirmSite(d);
  }
  await createWellbore(d, site, 'Ekene-11', { slot: 'S5' });
  await confirmWellbore(d);
  await createDesign(d, 'Ekene-11', design);
  await tab(d, 'Targets').click();
  await d.sleep(1500);
  await targetFromSurface(d, { surface: 'WDS demo: Oboro Sand top', x: T1.e, y: T1.n, below: '26.2', name: T1.name });
  await confirmPick(d);
  if (extra) await extra(d);
  await tab(d, 'Design').click();
  await d.sleep(1500);
  if (kop) { await solveJ(d, T1.name, { kop, rate: '2.54' }); await saveDesign(d); }
  await openStudio(d, shared);
  await selectDesign(d, site, 'Ekene-11', design);
}
