// Seismolord lesson E13: volume attributes (Ekene kit v4, EKENE3D-v4-full.sgy).
// The attribute families, a spectral decomposition volume at 30 Hz computed
// in the browser ("Lesson spectral 30 Hz", removed by the next take's setup;
// about 96 s, cut from the video), and co-rendering it over the seismic on
// the 1292 ms time slice and on a dip line. Figures from the 2026-10-12 probe.
import {
  login, openSeismolord, setVisible, closeWindow, deleteVolume, explorerItem, sectionPoint,
  FULL, RECORD_MS, xlFrac,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const VOL = 'Lesson spectral 30 Hz';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();

async function goTo(d, v, onCamera = true) {
  if (onCamera) { await d.type('sl-goto', String(v)); await d.click('sl-goto-btn'); } else {
    await t(d, 'sl-goto').fill(String(v)); await t(d, 'sl-goto-btn').click();
  }
  await d.sleep(1800);
}

export default {
  id: 'lesson-seis-e13',
  ...seisLessonMeta(13, 'E', 'Volume *attributes*', 'Attribute volumes, spectral decomposition, and co-rendering one volume over another'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteVolume(d, VOL);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await combo(d, 'Overlay volume').selectOption({ value: '' }).catch(() => {});
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' });
    await goTo(d, 1292, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 13', chapterSub: 'Module E · Attributes and maps',
      say: 'An attribute volume is a new volume computed from the seismic, sample by sample, to bring out one property: reflection strength, frequency, discontinuity. This lesson computes one, a spectral decomposition, and blends it over the seismic.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 13', title: 'Volume attributes',
        body: '<ul><li>The attribute families</li><li>Spectral decomposition</li><li>Co-rendering over the seismic</li></ul>' }) },
    { id: 'families', chapter: 'The families', chapterSub: 'What each one brings out',
      say: 'Seismolord groups them. Trace attributes, like the envelope and instantaneous frequency, describe each trace on its own. Discontinuity attributes, like variance and fault likelihood, compare neighbouring traces and find faults and edges. Geometric attributes give dip, azimuth and curvature. Spectral decomposition shows how strong the seismic is at one frequency.',
      do: async (d) => d.slide({ eyebrow: 'The families', title: 'One property each',
        body: '<ul><li><b>Trace</b>: envelope, phase, frequency, sweetness</li><li><b>Discontinuity</b>: variance, fault likelihood, edge, chaos</li><li><b>Geometric</b>: dip, azimuth, curvature</li><li><b>Spectral</b>: amplitude at one frequency</li></ul>' }) },
    { id: 'compute', chapter: 'Spectral decomposition', chapterSub: 'The seismic at 30 Hz',
      say: 'Why one frequency? A thin bed reflects most strongly at the frequency its thickness tunes to, so a map at one frequency can light up thickness changes the full band hides. In the attribute dialog we choose spectral decomposition at thirty hertz, in a forty millisecond window, name the volume, and compute it in this browser. The original amplitudes are never changed.',
      sub: 'Why one frequency? A thin bed reflects most strongly at the frequency its thickness tunes to, so a map at one frequency can light up thickness changes the full band hides. In the attribute dialog we choose spectral decomposition at 30 Hz, in a 40 ms window, name the volume, and compute it in this browser. The original amplitudes are never changed.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: /Attribute volume/ }));
        await dialog(d).waitFor();
        await d.sleep(800);
        await d.select(dialog(d).locator('select').first(), { label: 'Spectral decomposition' });
        await d.sleep(800);
        await d.type(dialog(d).locator('label:has-text("Volume name") input'), VOL);
        const browser = dialog(d).getByRole('radio', { name: /In this browser/ });
        if (await browser.count()) await d.click(browser);
        await d.sleep(600);
        await d.click(dialog(d).getByRole('button', { name: /^Compute$/ }));
      },
      wait: async (d) => {
        await explorerItem(d, VOL).waitFor({ timeout: 900000 });
        await d.sleep(2500);
        await d.page.keyboard.press('Escape').catch(() => {});
      },
      waitLabel: 'A minute and a half later' },
    { id: 'listed',
      say: 'The new volume is listed under the seismic it came from, on the same lattice.',
      do: async (d) => {
        await d.highlight(explorerItem(d, VOL));
        await d.sleep(2000);
        await d.unhighlight();
        await d.click(tab(d, 'Home'));
        await d.sleep(500);
      } },
    { id: 'corender', chapter: 'Co-rendering', chapterSub: 'One volume over another',
      say: 'Co-render blends it over the seismic. On the time slice at twelve ninety two milliseconds, at the top of the sand, the thirty hertz energy, in orange, is strongest in a ring where the slice cuts the top of the sand around the closure, and in a patch inside the closure, worth comparing with the interval map from the last lesson.',
      sub: 'Co-render blends it over the seismic. On the time slice at 1292 ms, at the top of the sand, the 30 Hz energy, in orange, is strongest in a ring where the slice cuts the top of the sand around the closure, and in a patch inside the closure, worth comparing with the interval map from the last lesson.',
      do: async (d) => {
        await d.select(combo(d, 'Overlay volume'), { label: VOL });
        await d.sleep(1200);
        await combo(d, 'Blend').selectOption({ value: 'mix' }).catch(() => {});
        await d.page.getByRole('slider', { name: /Opacity/ }).fill('0.6').catch(() => {});
        await d.sleep(2500);
        const b = await d.page.locator('[data-testid="window-section"] canvas').first().boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.74, y: b.y + b.height * 0.2 }, { ms: 1100 });
        await d.moveTo({ x: b.x + b.width * 0.86, y: b.y + b.height * 0.5 }, { ms: 1200 });
        await d.sleep(600);
        await d.moveTo({ x: b.x + b.width * 0.48, y: b.y + b.height * 0.45 }, { ms: 1200 });
      } },
    { id: 'opacity',
      say: 'The opacity slider fades between the two, so each feature can be placed on the seismic underneath.',
      do: async (d) => {
        const sl = d.page.getByRole('slider', { name: /Opacity/ });
        await d.moveTo(sl);
        for (const v of ['0.4', '0.2', '0.4', '0.6']) { await sl.fill(v); await d.sleep(600); }
      } },
    { id: 'next',
      say: 'Next lesson, surfaces and the Map window: gridding a horizon, its coverage, and contours.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next', title: 'Surfaces and the Map window', body: '<ul><li>Gridding a horizon</li><li>Coverage</li><li>Contours</li></ul>' });
        await combo(d, 'Overlay volume').selectOption({ value: '' }).catch(() => {});
      } },
  ],
};
