// Seismolord lesson C8: automatic fault detection (Ekene kit v4, EKENE3D-v4-full.sgy).
// The variance volume made for the demos ("EKENE3D-v4-full.sgy [Variance 40 ms]")
// co-rendered over the seismic on a time slice and a dip line, then Detect
// faults over the whole survey at high sensitivity: Auto-1 (the growth fault,
// confidence 0.80, 16 sticks, strike 18° from grid north), Auto-2 (Ekene
// East, 0.68, 16 sticks), and two small crestal faults (0.43 and 0.40, 3
// sticks each). Nothing is saved: the project already holds Auto-1 and Auto-2
// from the demos. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, setVisible, closeWindow, FULL,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const VARIANCE = 'EKENE3D-v4-full.sgy [Variance 40 ms]';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const faultLine = (d, name) => t(d, 'sl-auto-faults').locator(`label:has-text("${name}:")`);

async function goTo(d, v, onCamera = true) {
  if (onCamera) { await d.type('sl-goto', String(v)); await d.click('sl-goto-btn'); } else {
    await t(d, 'sl-goto').fill(String(v)); await t(d, 'sl-goto-btn').click();
  }
  await d.sleep(1800);
}

export default {
  id: 'lesson-seis-c8',
  ...seisLessonMeta(8, 'C', 'Automatic fault detection', 'Variance and fault likelihood, the area of interest, and reading the faults the picker proposes'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await combo(d, 'Overlay volume').selectOption({ value: '' }).catch(() => {});
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' });
    await goTo(d, 1700, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 8', chapterSub: 'Module C · Faults',
      say: 'Picking every fault by hand on every few lines takes days on a large survey. This lesson lets the seismic show the faults first, with a variance volume, and then lets Seismolord propose fault sticks over an area you choose.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 8', title: 'Automatic fault detection',
        body: '<ul><li>Variance: where the seismic changes</li><li>Fault likelihood</li><li>The area of interest</li><li>Reading what the picker proposes</li></ul>' }) },
    { id: 'variance', chapter: 'Variance', chapterSub: 'How unlike its neighbours each sample is',
      say: 'Variance measures how different each sample is from its neighbours along the reflectors. Where reflectors run on unbroken it is low; where a fault cuts them it is high. Fault likelihood goes further: it measures the semblance along the local dip, so the fault comes out as a thin, sharp line.',
      do: async (d) => d.slide({ eyebrow: 'Variance and fault likelihood', title: 'Where the reflectors break',
        body: '<ul><li><b>Variance</b>: low on continuous reflectors, high at breaks</li><li><b>Fault likelihood</b>: semblance along the local dip, thinned to a line</li><li>Both are display aids until you keep a fault</li></ul>' }) },
    { id: 'slice', chapter: 'Variance on a time slice', chapterSub: 'Co-rendered over the seismic',
      say: 'This survey has a variance volume already, computed in a forty millisecond window. We blend it over the seismic, multiplied, so high variance darkens it. On the time slice at seventeen hundred milliseconds the growth fault is the dark curve along the west of the rollover rings, and the buried Ekene East fault cuts straight through them further east.',
      sub: 'This survey has a variance volume already, computed in a 40 ms window. We blend it over the seismic, multiplied, so high variance darkens it. On the time slice at 1700 ms the growth fault is the dark curve along the west of the rollover rings, and the buried Ekene East fault cuts straight through them further east.',
      do: async (d) => {
        await d.hideSlide();
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(800);
        await combo(d, 'Overlay volume').selectOption({ label: VARIANCE });
        await d.sleep(1500);
        await combo(d, 'Blend').selectOption({ value: 'multiply' });
        await combo(d, 'Overlay colors').selectOption({ label: 'Grayscale (reversed)' }).catch(() => {});
        await d.page.getByRole('slider', { name: /Opacity/ }).fill('1');
        await d.sleep(2500);
        const b = await d.page.locator('[data-testid="window-section"] canvas').first().boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.47, y: b.y + b.height * 0.15 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.44, y: b.y + b.height * 0.5 }, { ms: 1400 });
        await d.moveTo({ x: b.x + b.width * 0.47, y: b.y + b.height * 0.85 }, { ms: 1400 });
        await d.sleep(800);
        await d.moveTo({ x: b.x + b.width * 0.68, y: b.y + b.height * 0.25 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.66, y: b.y + b.height * 0.75 }, { ms: 1600 });
      } },
    { id: 'dipline',
      say: 'On a dip line, inline ten fifty three, the same volume draws the fault plane, steep at the top and flattening with depth, and the small faults over the crest.',
      sub: 'On a dip line, inline 1053, the same volume draws the fault plane, steep at the top and flattening with depth, and the small faults over the crest.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await d.sleep(800);
        await goTo(d, 1053);
        const b = await d.page.locator('[data-testid="window-section"] canvas').first().boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.27, y: b.y + b.height * 0.1 }, { ms: 900 });
        await d.moveTo({ x: b.x + b.width * 0.33, y: b.y + b.height * 0.45 }, { ms: 1500 });
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.62 }, { ms: 1300 });
      } },
    { id: 'open', chapter: 'Detect faults', chapterSub: 'The area of interest',
      say: 'Detect faults works straight from the seismic, so a variance volume is not needed first. It runs over an area of interest, in inlines, crosslines and samples, up to twenty four million samples at a time. We take the whole survey: eighteen point eight million samples. Sensitivity high suits faults that show only where they break a reflector.',
      sub: 'Detect faults works straight from the seismic, so a variance volume is not needed first. It runs over an area of interest, in inlines, crosslines and samples, up to 24 million samples at a time. We take the whole survey: 18.8 million samples. Sensitivity high suits faults that show only where they break a reflector.',
      do: async (d) => {
        await combo(d, 'Overlay volume').selectOption({ value: '' });
        await d.select(combo(d, 'Colormap'), { label: 'Red-White-Blue' });
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        await d.click('sl-detect-faults-btn');
        await dialog(d).waitFor();
        await d.sleep(1000);
        const set = async (k, v) => {
          const i = dialog(d).locator(`input[aria-label$="(${k})"]`);
          await d.click(i);
          await d.page.keyboard.press('Control+A');
          await d.page.keyboard.type(String(v), { delay: 60 });
          await d.sleep(200);
        };
        await set('il0', 0); await set('il1', 127); await set('xl0', 0); await set('xl1', 167); await set('s0', 0); await set('s1', 875);
        await expectText(d, dialog(d).getByText(/^[0-9.]+ million samples$/), /^18\.8 million samples$/, 'area size');
        await d.select(dialog(d).getByLabel('Sensitivity'), { value: 'high' });
        await d.highlight(dialog(d).getByText(/^[0-9.]+ million samples$/));
      } },
    { id: 'run',
      say: 'Pick faults. The picker computes the fault likelihood, thins it to single cells, and groups the cells into faults.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Pick faults' }));
      },
      wait: async (d) => {
        await t(d, 'sl-auto-faults-quality').waitFor({ timeout: 600000 });
        await d.sleep(1200);
      },
      waitLabel: 'A minute later' },
    { id: 'results', chapter: 'What it found', chapterSub: 'Confidence, sticks and strike',
      say: 'Four faults. Auto one is the growth fault: confidence nought point eight, sixteen sticks, striking eighteen degrees east of grid north. Auto two is Ekene East, the buried fault below the reservoir, at nought point six eight. Auto three and four are small faults over the crest, three sticks each, at about nought point four. The quality line gives the reflector coherence, nought point nine five, and the thresholds at half the standard, as high sensitivity asks.',
      sub: 'Four faults. Auto-1 is the growth fault: confidence 0.8, sixteen sticks, striking 18° east of grid north. Auto-2 is Ekene East, the buried fault below the reservoir, at 0.68. Auto-3 and 4 are small faults over the crest, three sticks each, at about 0.4. The quality line gives the reflector coherence, 0.95, and the thresholds at half the standard, as high sensitivity asks.',
      do: async (d) => {
        await expectText(d, faultLine(d, 'Auto-1'), /Auto-1: confidence 0\.80, 16 sticks, strike 18° from grid north/, 'Auto-1');
        await expectText(d, faultLine(d, 'Auto-2'), /Auto-2: confidence 0\.68, 16 sticks, strike 20° from grid north/, 'Auto-2');
        await expectText(d, faultLine(d, 'Auto-3'), /Auto-3: confidence 0\.43, 3 sticks/, 'Auto-3');
        await expectText(d, faultLine(d, 'Auto-4'), /Auto-4: confidence 0\.40, 3 sticks/, 'Auto-4');
        await expectText(d, 'sl-auto-faults-quality', /Reflector coherence 0\.95 \(some noise\); thresholds at 50 percent of the standard\./, 'quality');
        await d.highlight(faultLine(d, 'Auto-1'));
        await d.sleep(3500);
        await d.highlight(faultLine(d, 'Auto-2'));
        await d.sleep(3000);
        await d.highlight(faultLine(d, 'Auto-3').locator('..'));
        await d.sleep(3000);
        await d.highlight('sl-auto-faults-quality');
      } },
    { id: 'keep', chapter: 'Keep, then edit', chapterSub: 'Proposals until you tick them',
      say: 'These are proposals. Untick what you do not want, and Save the ticked faults keeps the rest as ordinary faults, to edit with the stick tools and to use as tracking barriers. This project already keeps Auto one and Auto two from the same run, so we close without saving.',
      sub: 'These are proposals. Untick what you do not want, and Save the ticked faults keeps the rest as ordinary faults, to edit with the stick tools and to use as tracking barriers. This project already keeps Auto-1 and Auto-2 from the same run, so we close without saving.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(dialog(d).getByRole('button', { name: 'Save the ticked faults' }));
        await d.sleep(3000);
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
      } },
    { id: 'next',
      say: 'Next lesson, horizons across faults: the jump at a fault, the throw, and how the framework carries a horizon into a block no well reaches.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next', title: 'Horizons across faults', body: '<ul><li>The jump at a fault</li><li>Throw</li><li>Faults as barriers</li></ul>' });
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
      } },
  ],
};
