// Seismolord lesson D10: wells on the section (Ekene kit v4, EKENE3D-v4-full.sgy).
// The six Ekene wells from the shared registry (survey stations, tops and a
// time-depth relation each), Ekene-1 on crossline 2051 with its tops, the
// projection distance opened to 1,000 m so the neighbouring wells and the
// deviated Ekene-8 draw too, the tops against the events zoomed on inline
// 1027, and Ekene-1's sonic and density logs in the Synthetics window (a
// synthetic only: nothing is committed). Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, setVisible, explorerRow, closeWindow,
  FULL, RECORD_MS, xlFrac, ilFrac,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();

async function goTo(d, v, onCamera = true) {
  if (onCamera) { await d.type('sl-goto', String(v)); await d.click('sl-goto-btn'); } else {
    await t(d, 'sl-goto').fill(String(v)); await t(d, 'sl-goto-btn').click();
  }
  await d.sleep(1800);
}

async function setProjection(d, v) {
  const box = t(d, 'sl-well-projection');
  await d.click(box);
  await d.page.keyboard.press('Control+A');
  if (v) await d.page.keyboard.type(String(v), { delay: 80 }); else await d.page.keyboard.press('Backspace');
  await d.page.keyboard.press('Tab');
  await d.sleep(2200);
}

export default {
  id: 'lesson-seis-d10',
  ...seisLessonMeta(10, 'D', 'Wells *on the section*', 'Well paths, tops and logs in the seismic, the projection distance, and what a well needs before it can draw'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await closeWindow(d, 'Synthetics');
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await tab(d, 'Wells').click(); await d.sleep(400);
    if (await t(d, 'sl-well-projection').inputValue()) { await t(d, 'sl-well-projection').fill(''); await t(d, 'sl-well-projection').press('Tab'); }
    await tab(d, 'Home').click(); await d.sleep(400);
    await combo(d, 'Orientation').selectOption({ label: 'Crossline' });
    await goTo(d, 2051, false);
    await explorerRow(d, 'Ekene-9').scrollIntoViewIfNeeded();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 10', chapterSub: 'Module D · Wells in the seismic',
      say: 'Wells are the ground truth of a seismic interpretation: they say which reflection is which, and at what depth. This lesson puts the Ekene wells on the seismic, with their paths, tops and logs, and shows what each well needs before it can be drawn.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module D · Lesson 10', title: 'Wells on the section',
        body: '<ul><li>Wells from the shared registry</li><li>Paths and tops on a section</li><li>The projection distance</li><li>Logs at the well</li></ul>' }) },
    { id: 'registry', chapter: 'The wells', chapterSub: 'From the shared registry',
      say: 'The wells come from the shared well registry, the same wells Well Data Manager holds, so nothing is imported twice. Each row says what the well brings: Ekene one has a survey of seventy six stations, ten tops, and a time-depth relation, which is what lets a well drawn in depth sit on seismic recorded in time.',
      sub: 'The wells come from the shared well registry, the same wells Well Data Manager holds, so nothing is imported twice. Each row says what the well brings: Ekene-1 has a survey of 76 stations, ten tops, and a time-depth relation, which is what lets a well drawn in depth sit on seismic recorded in time.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, explorerRow(d, 'Ekene-1'), /Ekene-1\s*76 stn · 10 tops · T-D/, 'Ekene-1 row');
        await d.highlight(explorerRow(d, 'Ekene-1'));
      } },
    { id: 'show', chapter: 'On the section', chapterSub: 'Path and tops',
      say: 'We show all six. On crossline twenty fifty one only Ekene one draws: its path, and each top as a labelled tick at its time. The other wells are too far from this line.',
      sub: 'We show all six. On crossline 2051 only Ekene-1 draws: its path, and each top as a labelled tick at its time. The other wells are too far from this line.',
      do: async (d) => {
        await d.unhighlight();
        for (const w of WELLS) await setVisible(d, w, true, { onCamera: true });
        await d.sleep(1200);
        await d.moveTo(await sectionPoint(d, { frac: ilFrac(1027), ms: 400, recordMs: RECORD_MS }), { ms: 900 });
        await d.moveTo(await sectionPoint(d, { frac: ilFrac(1027) + 0.04, ms: 1290, recordMs: RECORD_MS }), { ms: 1400 });
      } },
    { id: 'projection', chapter: 'Projection distance', chapterSub: 'How far from the line a well still draws',
      say: 'The projection distance decides how far from the section a well may be and still draw. By default it is one and a half bins. At a thousand metres the neighbours appear: Ekene two, three and four, Ekene nine, and Ekene eight, the deviated well, whose path swings across the section from the platform.',
      sub: 'The projection distance decides how far from the section a well may be and still draw. By default it is one and a half bins. At 1,000 m the neighbours appear: Ekene-2, 3 and 4, Ekene-9, and Ekene-8, the deviated well, whose path swings across the section from the platform.',
      do: async (d) => {
        await d.click(tab(d, 'Wells'));
        await d.sleep(1200);
        await setProjection(d, 1000);
        if ((await t(d, 'sl-well-projection').inputValue()) !== '1000') throw new Error('projection distance not set');
        await d.moveTo(await sectionPoint(d, { frac: ilFrac(1062), ms: 700, recordMs: RECORD_MS }), { ms: 1000 });
        await d.moveTo(await sectionPoint(d, { frac: ilFrac(1072), ms: 1400, recordMs: RECORD_MS }), { ms: 1400 });
      } },
    { id: 'caution',
      say: 'A projected well is drawn where it would be if it sat on this line, so its tops can look a few milliseconds off the events here. Keep the distance small when tying, and open it only to see where the wells are.',
      do: async (d) => {
        await setProjection(d, '');
        await d.click(tab(d, 'Home'));
        await d.sleep(400);
      } },
    { id: 'tops', chapter: 'Tops against the events', chapterSub: 'Zoomed in at Ekene-1',
      say: 'On inline ten twenty seven, through Ekene one, zoomed in. Each top should sit on the event it was matched to. The Ekene Sand top sits on the strong peak: the cursor there reads about twelve hundred and ninety milliseconds, and just under five thousand feet below sea level through the velocity model.',
      sub: 'On inline 1027, through Ekene-1, zoomed in. Each top should sit on the event it was matched to. The Ekene Sand top sits on the strong peak: the cursor there reads about 1290 ms, and just under 5,000 ft below sea level through the velocity model.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await d.sleep(800);
        await goTo(d, 1027);
        const p = await sectionPoint(d, { frac: xlFrac(2051), ms: 1290, recordMs: RECORD_MS });
        await d.moveTo(p);
        for (let i = 0; i < 3; i++) { await d.page.mouse.wheel(0, -240); await d.sleep(450); }
        await d.sleep(1200);
        await d.moveTo(await sectionPoint(d, { frac: xlFrac(2051), ms: 1289, recordMs: RECORD_MS }));
        await d.sleep(600);
        await expectText(d, 'status-cursor', /IL 1027\s+·\s+XL 2051\s+·\s+12(8\d|9\d)\.\d ms\s+·\s+49\d\d\.\d ft TVDSS/, 'cursor at the Ekene Sand top');
      } },
    { id: 'logs', chapter: 'Logs at the well', chapterSub: 'Sonic and density',
      say: 'The logs come in through the Synthetics window. For Ekene one it finds the sonic and the density in the registry, and builds a synthetic seismogram from them. The QI series takes the tie from here; nothing is committed in this lesson.',
      sub: 'The logs come in through the Synthetics window. For Ekene-1 it finds the sonic and the density in the registry, and builds a synthetic seismogram from them. The QI series takes the tie from here; nothing is committed in this lesson.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(tab(d, 'Wells'));
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: 'Synthetics' }));
        await d.sleep(800);
        await d.page.keyboard.press('Escape');
        await d.sleep(1500);
        await d.select(d.page.getByRole('combobox', { name: 'Well' }).first(), { label: 'Ekene-1' });
        await d.sleep(2000);
        await expectText(d, d.page.getByRole('combobox', { name: 'Sonic' }).locator('option:checked'), /DT/, 'sonic log');
        await d.select(d.page.getByRole('combobox', { name: 'Density' }), { label: 'RHOB (G/C3)' });
        await d.click(d.page.getByRole('button', { name: 'Synthesize' }));
      },
      wait: async (d) => {
        await t(d, 'synth-canvas').waitFor({ timeout: 180000 });
        await d.sleep(2500);
      },
      waitLabel: 'Seconds later' },
    { id: 'logtracks',
      say: 'The tracks, left to right: the sonic, the density, the acoustic impedance made from the two, the reflection coefficients, the synthetic, and the seismic at the well, with the tops across all of them.',
      do: async (d) => {
        const c = t(d, 'synth-canvas');
        const b = await c.boundingBox();
        for (const fx of [0.08, 0.24, 0.4, 0.56, 0.72, 0.9]) { await d.moveTo({ x: b.x + b.width * fx, y: b.y + b.height * 0.35 }, { ms: 600 }); await d.sleep(350); }
      } },
    { id: 'next',
      say: 'Next lesson, time to depth: checkshots, the velocity model, and a horizon converted to feet.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next', title: 'Time to depth', body: '<ul><li>Checkshots</li><li>The velocity model</li><li>A horizon in depth</li></ul>' });
        await closeWindow(d, 'Synthetics');
        for (const w of WELLS) await setVisible(d, w, false);
        await tab(d, 'Home').click().catch(() => {});
      } },
  ],
};
