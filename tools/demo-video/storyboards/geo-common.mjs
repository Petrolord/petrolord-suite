// Shared by the Geoscience module showcase (owner GO 2026-10-17): one ~10
// minute video for YouTube and the NAPE booth, joined from scene storyboards
// geo-s01 ... geo-s10 by module.mjs (storyboards/geo-module.mjs). Each scene
// is recorded on its own (make.mjs <scene> --stage record), so a failed take
// costs one scene. Ekene kit v4 on the demo account, depths in feet.
// Rules: every scene shows a picture; numbers appear on screen (callouts) and
// the narration reads them from the screen, checked by expectText.
import { login } from '../lib/session.mjs';
import { expectText as strictExpectText } from './petro-common.mjs';

export { login };
export const GEO = '/dashboard/apps/geoscience';
export const VIEWPORT = { w: 1440, h: 810 };
export const t = (d, id) => d.page.getByTestId(id);

/** expectText; with LENIENT=1 (dry runs while writing narration) a mismatch is logged instead. */
export async function expectText(d, target, re, what) {
  if (!process.env.LENIENT) return strictExpectText(d, target, re, what);
  try { await strictExpectText(d, target, re, what); } catch (e) { console.log(`MISMATCH ${e.message}`); }
}

/** Off camera: log a screen value while writing narration (dry runs only). */
export async function note(d, shared, key, target) {
  if (!shared.dry) return;
  const v = await d.text(target).catch((e) => `? ${e.message}`);
  shared.values[key] = v.replace(/\s+/g, ' ').slice(0, 400);
}

/** Scene fields every geo storyboard shares (cards come from geo-module). */
export const scene = (id, extra) => ({
  id, app: 'Petrolord Suite · Geoscience', eyebrow: 'Geoscience', title: 'Geoscience', viewport: VIEWPORT, leadIn: 0.6, leadOut: 0.8, ...extra,
});

/** Off camera: open an app route and wait for a testid. */
export async function openApp(d, shared, route, readyId, { timeout = 120000, settle = 2500 } = {}) {
  await d.page.goto(`${shared.baseUrl}${GEO}/${route}`, { waitUntil: 'domcontentloaded' });
  await t(d, readyId).first().waitFor({ timeout });
  await d.sleep(settle);
  for (const id of ['sl-tour-skip']) { const l = t(d, id); if (await l.count()) await l.first().click().catch(() => {}); }
}

/** Park the drawn cursor out of the way. */
export const park = (d, x = 1380, y = 760) => d.page.evaluate(([a, b]) => window.__demo.moveTo(a, b, 10), [x, y]);
