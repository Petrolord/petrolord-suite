// Shared by the "Petrophysics with Petrolord" lesson storyboards.
// Lessons run on the Ekene demonstration field, kit v2, in feet, on the
// demo account. No subtitles (YouTube captions them); captions: false.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// Off-camera reseed through Well Data Manager (runs the seed script)

export function seedWells(shared, wells, { tops = true } = {}) {
  const seed = path.resolve(HERE, '../../seed/ekene.mjs');
  execFileSync('node', [seed, '--base-url', shared.baseUrl, '--wells', wells.join(','), ...(tops ? [] : ['--no-tops'])],
    { env: { ...process.env, EKENE_KIT: KIT }, stdio: 'inherit', timeout: 900000 });
}

export function kitCsv(rel) {
  const [h, ...rows] = fs.readFileSync(path.join(KIT, rel), 'utf8').trim().split('\n').map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

// A deviated well path against the vertical: MD along the hole, TVD straight down
export const MDTVD_SVG = `<svg width="560" height="560" viewBox="0 0 560 560" xmlns="http://www.w3.org/2000/svg">
  <line x1="60" y1="50" x2="520" y2="50" stroke="#d4ac3a" stroke-width="2"/><text x="60" y="38" font-size="22">KB</text>
  <line x1="60" y1="110" x2="520" y2="110" stroke="#9fd3f0" stroke-width="2"/><text x="138" y="100" font-size="20">Sea level</text>
  <path d="M 120 50 L 120 200 Q 125 300 230 380 L 420 480" fill="none" stroke="#ff7a59" stroke-width="7"/>
  <line x1="420" y1="50" x2="420" y2="480" stroke="#cfd8d2" stroke-width="3" stroke-dasharray="10 8"/>
  <line x1="60" y1="480" x2="520" y2="480" stroke="#e8d5a9" stroke-width="2"/><text x="60" y="510" font-size="22">Ekene Sand top</text>
  <text x="196" y="318" font-size="22" fill="#ff7a59">MD: along the hole</text>
  <text x="432" y="250" font-size="22">TVD:</text>
  <text x="432" y="278" font-size="18">straight down</text>
</svg>`;

export const PETRO = '/dashboard/apps/geoscience/petrophysics-studio';
export async function openPetroWell(d, shared, well = 'Ekene-1') {
  await d.page.goto(`${shared.baseUrl}${PETRO}`, { waitUntil: 'domcontentloaded' });
  await d.page.locator(`[data-well-name="${well}"]`).first().click({ timeout: 120000 });
  await d.waitFor('petro-curve-inventory');
  await d.sleep(2000);
}

// wheel-zoom Petrophysics tracks about a depth (ft); Ekene-1 spans 197 to
// 7381.5 ft unzoomed; zooming about the cursor keeps that depth under it
export async function zoomTracksAt(d, depthFt, n, { top = 197, base = 7381.5, dx = 0.45 } = {}) {
  // TrackViewer: a 50 px header and 2 px above the plot, 4 px below it
  const b = await d.page.getByTestId('petro-tracks-canvas').boundingBox();
  const plotTop = b.y + 52; const plotH = b.height - 56;
  const y = plotTop + ((depthFt - top) / (base - top)) * plotH;
  const x = b.x + b.width * dx;
  await d.moveTo({ x, y }, { ms: 700 });
  for (let i = 0; i < n; i++) { await d.page.mouse.wheel(0, -120); await d.sleep(220); }
  // zooming about the cursor keeps depthFt at y; each notch shows 0.8 of the span
  const span = (base - top) * 0.8 ** n;
  const yAt = (ft) => y + ((ft - depthFt) / span) * plotH;
  return { x, y, b, yAt };
}

export const ZONE_CARD = (d, zone) => d.page.locator('[data-testid="petro-zone-card"]').filter({ has: d.page.getByTestId(`petro-zone-net-${zone}`) });
export async function ensureZonesOn(d) {
  if (await d.page.getByTestId('petro-zone-net-Ekene Sand').count()) return;
  await d.page.getByTestId('petro-zone-mode-tops').click();
  await d.page.getByTestId('petro-zone-fill-between-tops').click();
  await d.waitFor('petro-zone-net-Ekene Sand');
}
// pick a zone in the histogram filter by its name (option values are ids)
export async function histFilter(d, name) {
  const sel = d.page.getByTestId('petro-hist-filter');
  const value = name === 'all' ? 'all' : await sel.locator('option', { hasText: name }).first().getAttribute('value');
  await d.select(sel, value);
  // park the cursor below the percentile line so it hides no figure
  const b = await sel.boundingBox();
  if (b) await d.moveTo({ x: b.x + b.width / 2, y: b.y + 160 }, { ms: 500 });
}
// toggle a crossplot zone filter button by its label ('All zones' resets)
export async function crossplotZone(d, name) {
  await d.click(d.page.getByRole('button', { name, exact: true }).first());
  await d.sleep(600);
}

// Every lesson starts from the Studio's default parameters (feet session),
// plus its own overrides, because a well's parameters persist between takes.
export const BASE_PARAMS = {
  grClean: 20, grClay: 120, vshMethod: 'larionov-tertiary',
  phiSource: 'density', phiShale: 0.06, rhoMa: 2.65, rhoFl: 1, sonicMethod: 'wyllie', ndMethod: 'avg',
  swMethod: 'archie', a: 1, m: 2, n: 2, rw: 0.05,
  permMethod: 'timur', cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6,
};
export async function baseParams(d, overrides = {}) {
  const p = { ...BASE_PARAMS, ...overrides };
  for (const [k, v] of Object.entries(p)) {
    const el = d.page.getByTestId(`petro-param-${k}`);
    if (!(await el.count())) continue; // shown only for some models
    if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(String(v));
    else await el.fill(String(v));
  }
  await d.page.getByTestId('petro-params-apply').click();
  await d.sleep(1500);
}
// open cutoffs: the zone card then averages every sample in the zone, the
// way the earth model's truth is averaged
export const OPEN_CUTOFFS = { cutPhi: 0, cutVsh: 1, cutSw: 1 };
