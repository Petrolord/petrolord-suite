// Seismolord lesson F18: 2D lines and the large-survey path (Ekene kit v4).
// A crooked 2D line cut from the v4 full stack (seis-lessons-assets/
// EKENE-2D-L1.sgy, 333 traces, 5.9 km; made by seed/seis_lesson_assets.py) is
// imported in the 2D Lines window (about
// 85 s, cut), shown with the framework's Ekene Sand projected onto it, and
// placed on the map. Then the import dialog on the full stack shows the
// large-survey choices without importing. Setup deletes the lesson line.
// Figures from the 2026-10-12 probe.
import path from 'node:path';
import { login, expectText, openSeismolord, setVisible, closeWindow, explorerItem, explorerRow, KIT, FULL } from '../seis-common.mjs';
import { seisLessonMeta, lessonAsset } from './seis-common.mjs';

const LINE = 'EKENE-2D-L1.sgy';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();

async function explorerLeft(d) {
  await ex(d).evaluate((el) => { for (const n of el.querySelectorAll('*')) if (n.scrollLeft) n.scrollLeft = 0; });
}

async function openWindow(d, name) {
  await d.click(d.page.getByRole('button', { name: /Windows/ }));
  await d.sleep(600);
  await d.click(d.page.getByText(name, { exact: true }).last());
  await d.sleep(600);
  await d.page.keyboard.press('Escape');
  await d.sleep(1500);
}

export default {
  id: 'lesson-seis-f18',
  ...seisLessonMeta(18, 'F', '2D lines and *large surveys*', 'Importing a 2D SEG-Y line beside the 3D, and the import path for very large volumes'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await closeWindow(d, '2D Lines');
    await explorerLeft(d);
    for (let i = 0; i < 4; i++) { // an earlier take's lesson line
      const row = explorerRow(d, LINE);
      if (!(await row.count())) break;
      await row.scrollIntoViewIfNeeded();
      await explorerLeft(d);
      await row.click({ button: 'right' });
      await d.sleep(500);
      await d.page.getByText('Delete line…').click();
      await d.sleep(3000);
    }
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 18', chapterSub: 'Module F · Delivery',
      say: 'Two last situations every interpreter meets. Old 2D lines that run beyond the 3D, or tie it to the next field. And surveys far larger than this one, tens or hundreds of gigabytes. This lesson covers both.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 18', title: '2D lines and large surveys',
        body: '<ul><li>A 2D SEG-Y line</li><li>Horizons projected onto it</li><li>The line on the map</li><li>The path for very large volumes</li></ul>' }) },
    { id: 'import', chapter: '2D lines', chapterSub: 'Their own window',
      say: '2D lines have their own window. Import 2D line: the file, the header mapping, with the CDP coordinates at bytes one eight one and one eight five, and its coordinate system. A crooked line is fine: the navigation comes from the trace headers.',
      sub: '2D lines have their own window. Import 2D line: the file, the header mapping, with the CDP coordinates at bytes 181 and 185, and its coordinate system. A crooked line is fine: the navigation comes from the trace headers.',
      do: async (d) => {
        await d.hideSlide();
        await openWindow(d, '2D Lines');
        await d.click(d.page.getByRole('button', { name: /Import 2D line/ }).first());
        await dialog(d).waitFor();
        await d.sleep(800);
        await t(d, 'line2d-file').setInputFiles(lessonAsset(LINE));
        await d.sleep(1500);
        const crs = dialog(d).locator('button').filter({ hasText: /EPSG|Choose a coordinate/ }).first();
        if (/Choose/.test(await crs.innerText())) {
          await d.click(crs);
          await d.sleep(500);
          await d.type(dialog(d).getByPlaceholder('Search name, EPSG code or region'), '32632');
          await d.sleep(600);
          await d.click(dialog(d).getByTestId('crs-search-results').locator('button').first());
          await d.sleep(800);
        }
        await d.highlight(dialog(d).locator('select').first());
        await d.sleep(1500);
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /^Import$/ }));
      },
      wait: async (d) => {
        await dialog(d).waitFor({ state: 'hidden', timeout: 600000 });
        await d.sleep(3000);
      },
      waitLabel: 'A minute and a half later' },
    { id: 'line', chapter: 'The line', chapterSub: 'Distance along the line',
      say: 'The line opens with distance along it across the top: five point nine kilometres, from the south west, over the crest of the rollover and out to the east. The growth fault crosses it, and Ekene East further along.',
      sub: 'The line opens with distance along it across the top: 5.9 km, from the south west, over the crest of the rollover and out to the east. The growth fault crosses it, and Ekene East further along.',
      do: async (d) => {
        await explorerLeft(d);
        await explorerRow(d, LINE).scrollIntoViewIfNeeded();
        await explorerLeft(d);
        await d.sleep(500);
        await expectText(d, explorerRow(d, LINE), /EKENE-2D-L1\.sgy\s*5\.9 km/, 'line length');
        await d.highlight(explorerRow(d, LINE));
        await d.sleep(2000);
        await d.unhighlight();
        const c = d.page.locator('[data-testid="window-line2d"] canvas, [data-testid^="window-"] canvas').last();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.24, y: b.y + b.height * 0.2 }, { ms: 900 });
        await d.moveTo({ x: b.x + b.width * 0.33, y: b.y + b.height * 0.5 }, { ms: 1400 });
        await d.sleep(600);
        await d.moveTo({ x: b.x + b.width * 0.68, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'project', chapter: 'Ties to the 3D', chapterSub: 'Horizons projected onto the line',
      say: 'With the 3D open, its horizons project onto the line wherever the line crosses the survey. The Ekene Sand from the framework lands on the same peak the line shows, because this line was cut from the same data. On a real 2D line, the misties at the crossings say how much to shift it, and the Misties tool measures and applies them.',
      do: async (d) => {
        await explorerLeft(d);
        await explorerRow(d, 'Ekene Sand').scrollIntoViewIfNeeded();
        await explorerLeft(d);
        await setVisible(d, 'Ekene Sand', true, { onCamera: true });
        await d.sleep(2500);
        const c = d.page.locator('[data-testid="window-line2d"] canvas, [data-testid^="window-"] canvas').last();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.45, y: b.y + b.height * 0.37 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.85, y: b.y + b.height * 0.39 }, { ms: 1600 });
        await d.sleep(800);
        await d.highlight(d.page.getByRole('button', { name: /Misties/ }));
      } },
    { id: 'map', chapter: 'On the map', chapterSub: 'Navigation beside the 3D',
      say: 'The eye on the line\'s row draws its navigation in the Map window, crossing the survey outline: the quickest way to see where old lines sit against new data.',
      do: async (d) => {
        await d.unhighlight();
        await explorerLeft(d);
        await explorerRow(d, LINE).scrollIntoViewIfNeeded();
        await explorerLeft(d);
        await setVisible(d, LINE, true, { onCamera: true });
        await openWindow(d, 'Map');
        await d.select(d.page.locator('select[title^="Mapped layer"]'), { label: 'Ekene Sand' }).catch(() => {});
        await d.sleep(2500);
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.15, y: b.y + b.height * 0.8 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.75, y: b.y + b.height * 0.2 }, { ms: 1800 });
      } },
    { id: 'large', chapter: 'Large surveys', chapterSub: 'What changes with size',
      say: 'Now size. This full stack is seventy seven megabytes; a production survey can be a thousand times that. The import dialog says what to expect before anything is written: the import runs in the background, the survey opens as soon as a compact display copy is uploaded, and the full precision copy follows.',
      do: async (d) => {
        await d.click(d.page.locator('button[title="Show Section"]')).catch(() => {});
        await d.sleep(600);
        await d.click(tab(d, 'Home'));
        await d.sleep(400);
        await openSeismolord(d, { baseUrl: new URL(d.page.url()).origin });
        await d.sleep(600);
        if (!(await t(d, 'sl-start-step-import').isVisible())) {
          if (!(await d.page.getByRole('tab', { name: 'Start here' }).isVisible())) await t(d, 'sl-start-toggle').click();
          await d.page.getByRole('tab', { name: 'Start here' }).click();
          await d.sleep(600);
        }
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
        const chooser = d.page.waitForEvent('filechooser');
        await d.click(dialog(d).getByRole('button', { name: 'Choose a SEG-Y or ZGY file' }));
        await (await chooser).setFiles(path.join(KIT, '04-seismic', FULL));
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1000);
        const exp = t(d, 'import-expectation');
        await exp.scrollIntoViewIfNeeded(); await d.sleep(600);
        await expectText(d, exp, /The import runs in the background[\s\S]*display copy/, 'import expectation');
        await d.highlight(exp);
      } },
    { id: 'server', chapter: 'On the server', chapterSub: 'Files of 2 GB or more',
      say: 'For files of two gigabytes or more, Seismolord recommends converting on the Petrolord server: the file uploads straight to the seismic worker, which converts it, and the tab can be closed once the upload finishes. Sixteen bit storage halves the size again. And View it now shows lines straight from the file on your computer while it converts.',
      sub: 'For files of 2 GB or more, Seismolord recommends converting on the Petrolord server: the file uploads straight to the seismic worker, which converts it, and the tab can be closed once the upload finishes. 16-bit storage halves the size again. And View it now shows lines straight from the file on your computer while it converts.',
      do: async (d) => {
        await d.unhighlight();
        const where = dialog(d).getByTestId('sl-import-where');
        if (await where.count()) { await where.scrollIntoViewIfNeeded(); await d.sleep(500); await d.highlight(where); await d.sleep(3000); }
        await d.unhighlight();
        const b16 = dialog(d).getByText('16-bit storage (half size)');
        await b16.scrollIntoViewIfNeeded(); await d.sleep(500);
        await d.highlight(b16);
        await d.sleep(2500);
        await d.highlight(dialog(d).getByRole('button', { name: 'View it now' }));
      } },
    { id: 'end', chapter: 'The series', chapterSub: 'From SEG-Y to a volume',
      say: 'We close without importing. That completes the series: from a SEG-Y file, through horizons, faults, wells, depth and attributes, to a volume in ReservoirCalc Pro, all on one synthetic field whose answers are known. The Ekene kit is free to download; follow along with the same data.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(600);
        await d.slide({ eyebrow: 'Seismic Interpretation with Petrolord', title: 'Eighteen lessons, one field',
          body: '<ul><li>Getting the seismic in</li><li>Horizons and faults</li><li>Wells, depth and attributes</li><li>Delivery</li></ul>' });
        await setVisible(d, 'Ekene Sand', false);
      } },
  ],
};
