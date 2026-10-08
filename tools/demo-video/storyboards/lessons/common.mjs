// Shared by the "Petrophysics with Petrolord" lesson storyboards.
// Lessons run on the Ekene demonstration field, kit v2, in feet, on the
// demo account. No subtitles (YouTube captions them); captions: false.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from '../../lib/session.mjs';
import { deleteWells } from '../../seed/delete-wells.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT = process.env.EKENE_KIT || path.resolve(HERE, '../../../../dist-demo/ekene-demo-v2');
export const WDM = '/dashboard/apps/geoscience/well-data-manager';
export const SERIES = 'Petrophysics with Petrolord';

export const lessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },   // the interface reads larger than in the demos
  app: SERIES,
  eyebrow: `${SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

export async function openWdm(d, shared) {
  await d.page.goto(`${shared.baseUrl}${WDM}`, { waitUntil: 'domcontentloaded' });
  await d.waitFor('wdm-open-las');
  await d.sleep(1500);
}

export async function expectText(d, target, re, what) {
  try { await d.waitText(target, re, { timeout: 20000 }); } catch (e) {
    throw new Error(`Narration mismatch at "${what}": expected ${re}, screen shows "${await d.text(target).catch(() => '?')}"`);
  }
}

// A small SVG of the depth references (KB, sea level, mudline, a top)
export const DATUM_SVG = `<svg width="560" height="560" viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="560" height="560" fill="none"/>
  <rect x="0" y="150" width="560" height="120" fill="#1e5a7a" opacity=".55"/>
  <rect x="0" y="270" width="560" height="290" fill="#6b5b3e" opacity=".55"/>
  <rect x="235" y="40" width="90" height="20" fill="#d4ac3a"/>
  <line x1="280" y1="60" x2="280" y2="150" stroke="#cfd8d2" stroke-width="6"/>
  <line x1="280" y1="150" x2="280" y2="520" stroke="#cfd8d2" stroke-width="6" stroke-dasharray="10 8"/>
  <line x1="40" y1="50" x2="520" y2="50" stroke="#d4ac3a" stroke-width="2"/>
  <text x="40" y="38" font-size="22">KB (kelly bushing): depth zero</text>
  <line x1="40" y1="150" x2="520" y2="150" stroke="#9fd3f0" stroke-width="2"/>
  <text x="40" y="140" font-size="22">Mean sea level: the vertical datum</text>
  <line x1="40" y1="270" x2="520" y2="270" stroke="#e8d5a9" stroke-width="2"/>
  <text x="40" y="300" font-size="22">Mudline (seabed)</text>
  <line x1="40" y1="460" x2="520" y2="460" stroke="#ff7a59" stroke-width="3"/>
  <text x="40" y="490" font-size="22">Formation top</text>
  <text x="340" y="105" font-size="20">KB elevation 82 ft</text>
  <text x="340" y="215" font-size="20">Water depth 115 ft</text>
</svg>`;

export async function resetWell(d, shared, name) {
  await deleteWells(d.page, shared.baseUrl, [name]);
}

export { login };
