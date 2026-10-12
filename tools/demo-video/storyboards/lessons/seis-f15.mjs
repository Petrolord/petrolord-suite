// Seismolord lesson F15: export (Ekene kit v4, EKENE3D-v4-full.sgy).
// The framework's Ekene Sand exported as a depth grid: ZMAP+ written and
// downloaded (header read on a slide from the probe's file: 177 x 201 nodes,
// null 1.0E+30, depth negative down in feet), the four grid formats and
// their conventions, and the picks exports (Charisma, IL/XL/X/Y/Z) with the
// sign choice for Petrel. Nothing is saved in the account.
// Figures from the 2026-10-12 probe.
import { login, expectText, openSeismolord, setVisible, closeWindow, FULL } from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
const sel = (d, label) => dialog(d).locator('label').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('select');

const ZMAP_HEADER = `<pre style="font:600 22px/1.45 'IBM Plex Mono',monospace;margin:0;white-space:pre">!  ZMAP+ GRID: ekene_sand
@ekene_sand HEADER, GRID, 5
  20, 1.0000000E+30, , 7, 1
  177, 201, 398625.59, 403625.59,
            519715.28, 524115.28
  0.0, 0.0, 0.0
@
  1.0000000E+30 ... -4.8995625E+03 ...</pre>`;

export default {
  id: 'lesson-seis-f15',
  ...seisLessonMeta(15, 'F', 'Export: *formats and conventions*', 'XYZ, CPS-3, ZMAP+, Irap and Charisma, and the conventions each one expects'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 15', chapterSub: 'Module F · Delivery',
      say: 'Interpretation is only useful once it reaches the next person: the geologist building the model, the reservoir engineer, a partner on other software. This lesson exports the Ekene Sand in the formats the industry uses, and the conventions that catch people out.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 15', title: 'Export',
        body: '<ul><li>Grids: XYZ, CPS-3, ZMAP+, Irap</li><li>Picks: Charisma, IL/XL/X/Y/Z</li><li>Sign, nulls and order</li></ul>' }) },
    { id: 'open', chapter: 'The export dialog', chapterSub: 'Surface, amplitude or picks',
      say: 'Export, on the Export tab. A horizon can leave as three different things: a gridded surface, an amplitude map along it, or the picks themselves. We take the Ekene Sand as a surface, in depth, through the volume\'s velocity model.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(tab(d, 'Export'));
        await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: /^Export…/ }).first());
        await dialog(d).waitFor();
        await d.sleep(800);
        await d.select(sel(d, 'Horizon'), { label: 'Ekene Sand' });
        await d.sleep(600);
        await d.select(sel(d, 'Export'), { value: 'surface' });
        await d.select(sel(d, 'Domain'), { value: 'depth' });
        await d.sleep(600);
        await d.highlight(sel(d, 'Domain'));
      } },
    { id: 'formats', chapter: 'Four grid formats', chapterSub: 'What each one is for',
      say: 'Four grid formats. XYZ is a plain list of points that anything can read. CPS-3 and ZMAP+ are the classic exchange grids, read by most mapping and modelling packages. Irap classic is common in reservoir modelling. All of them carry the same grid.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(sel(d, 'Format'));
        await d.sleep(1200);
        await d.select(sel(d, 'Format'), { value: 'zmap' });
        await d.sleep(800);
      } },
    { id: 'download', chapter: 'ZMAP+', chapterSub: 'Grid and download',
      say: 'Grid and download grids the picks, fault-aware, and writes the file.',
      do: async (d) => {
        await d.unhighlight();
        const dl = d.page.waitForEvent('download', { timeout: 300000 });
        await d.click(dialog(d).getByRole('button', { name: /Grid & download/ }));
        await dl;
        await d.sleep(800);
      } },
    { id: 'result',
      say: 'The file name says what it is: Ekene Sand, depth, ZMAP+.',
      do: async (d) => {
        const res = dialog(d).getByText(/^File:/).locator('..');
        await expectText(d, res, /ekene_sand_depth\.zmap\.dat/, 'file name');
        await d.highlight(res);
      } },
    { id: 'header', chapter: 'The conventions', chapterSub: 'What to check on the other side',
      say: 'Inside, the header: the null value, one point zero E plus thirty, then a hundred and seventy seven rows by two hundred and one columns, and the corners in eastings and northings. Depth is written negative downward, in feet. The body runs column by column, north to south. These are the three things to check in the receiving software: the null, the sign, and the order.',
      sub: 'Inside, the header: the null value, 1.0E+30, then 177 rows by 201 columns, and the corners in eastings and northings. Depth is written negative downward, in feet. The body runs column by column, north to south. These are the three things to check in the receiving software: the null, the sign, and the order.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'ekene_sand_depth.zmap.dat', title: 'Null, sign and order', body: ZMAP_HEADER });
      } },
    { id: 'picks', chapter: 'Picks', chapterSub: 'Charisma, and the sign for Petrel',
      say: 'Picks leave as Charisma, the common horizon interchange, or as plain inline, crossline, X, Y and Z. Some packages want depth positive downward, so the picks export asks: negative down, the Suite convention, or positive down, as Petrel expects.',
      do: async (d) => {
        await d.hideSlide();
        await d.select(sel(d, 'Export'), { value: 'picks' });
        await d.sleep(1500);
        await d.highlight(sel(d, 'Format'));
        await d.sleep(2500);
        const sign = sel(d, 'Z sign');
        await sign.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight(sign);
      } },
    { id: 'next',
      say: 'Next lesson, into ReservoirCalc Pro: a gross rock volume straight from the Seismolord surface, with no file in between.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(600);
        await d.slide({ eyebrow: 'Next', title: 'Into ReservoirCalc Pro', body: '<ul><li>Send the surface</li><li>Gross rock volume to a contact</li><li>No export, no import</li></ul>' });
        await tab(d, 'Home').click().catch(() => {});
      } },
  ],
};
