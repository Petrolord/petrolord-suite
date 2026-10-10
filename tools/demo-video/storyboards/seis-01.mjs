// Seismolord, video 1: from SEG-Y to a first horizon (Ekene kit v3).
// EKENE3D-small.sgy is imported on camera (it converts inside the take); the
// full stack, already in the demo account, carries the rest. Figures from the
// 2026-10-10 dry run; `expectText` steps stop the take if the screen
// disagrees with the narration. Ekene-1 sits at inline 1027, crossline 2051;
// the kit's 10-qi/ekene-qi-truth.md times the top Ekene Sand there at 1289 ms.
import path from 'node:path';
import {
  login, expectText, openSeismolord, deleteVolume, deleteHorizon, explorerItem,
  sectionPoint, clickAt, KIT, FULL, SMALL,
} from './seis-common.mjs';

const HORIZON = 'Top Ekene Sand';
const RECORD_MS = 2403.4; // the section's full height (601 samples at 4 ms)
const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog');
const combo = (d, name) => d.page.getByRole('combobox', { name });

async function goTo(d, value) {
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(2500);
}

export default {
  id: 'seis-01',
  app: 'Seismolord',
  eyebrow: 'Seismolord · 1 of 3',
  title: 'From SEG-Y to a *first horizon*',
  subtitle: 'Importing a 3D survey, checking what the file really holds, and tracking the top of the Ekene Sand',
  outroTitle: 'Next: *the wells build the framework*',
  outroSub: 'Tops to horizons, faults and the 3D window · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(HORIZON) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await deleteVolume(d, SMALL);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteHorizon(d, HORIZON);
    await deleteHorizon(d, `${HORIZON}, seeded`); // an exploration run's name
    // display settings persist: start each take from the defaults
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await d.page.getByTestId('sl-goto').fill('1064'); await t(d, 'sl-goto-btn').click();
    await combo(d, 'Active volume').selectOption({ value: '' }).catch(() => {});
    await openSeismolord(d, shared);
    // the side panel remembers its tab: show Start here
    if (!(await t(d, 'sl-start-step-import').isVisible())) {
      if (!(await d.page.getByRole('tab', { name: 'Start here' }).isVisible())) await t(d, 'sl-start-toggle').click();
      await d.page.getByRole('tab', { name: 'Start here' }).click();
      await d.sleep(800);
    }
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Seismolord', chapterSub: 'Seismic interpretation in the browser',
      say: 'Seismolord is the seismic interpretation app of the Petrolord Suite, and it runs in the browser. In this video we take a three D survey from a SEG-Y file to a first tracked horizon, on the Ekene field.',
      sub: 'Seismolord is the seismic interpretation app of the Petrolord Suite, and it runs in the browser. In this video we take a 3D survey from a SEG-Y file to a first tracked horizon, on the Ekene field.',
      do: async (d) => {
        await d.highlight('sl-start-step-import');
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
      } },
    { id: 'file',
      say: 'We choose the file. Seismolord reads it in windows, so even a very large survey is never loaded into memory whole.',
      do: async (d) => {
        const chooser = d.page.waitForEvent('filechooser');
        await d.click(dialog(d).getByRole('button', { name: 'Choose SEG-Y file' }));
        await (await chooser).setFiles(path.join(KIT, '04-seismic', SMALL));
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1200);
      } },
    { id: 'measured', chapter: 'What the file really holds', chapterSub: 'Geometry measured from the trace headers',
      say: 'Before anything is imported, the scan measures the geometry from the trace headers themselves: one thousand and twenty four traces, on inlines ten forty eight to ten seventy nine and crosslines twenty forty eight to twenty seventy nine, with six hundred and one samples at four milliseconds, stored as I E E E floating point.',
      sub: 'Before anything is imported, the scan measures the geometry from the trace headers themselves: 1,024 traces, on inlines 1048 to 1079 and crosslines 2048 to 2079, with 601 samples at 4 ms, stored as IEEE floating point.',
      do: async (d) => {
        const box = dialog(d).getByText(/^Format:/).locator('..');
        await expectText(d, box, /Format: IEEE float[\s\S]*Traces: 1,024[\s\S]*Samples: 601 @ 4 ms[\s\S]*Inlines: 1048–1079 \(step 1\)[\s\S]*Crosslines: 2048–2079 \(step 1\)/, 'measured geometry');
        await d.highlight(box);
      } },
    { id: 'header',
      say: 'The textual header makes its own claims, and here they agree with the measurement. On real surveys the header is often out of date, so when the two disagree, Seismolord goes with what it measured.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /Show textual header/ }));
        const pre = dialog(d).locator('pre').first();
        await expectText(d, pre, /INLINE RANGE 1048 TO 1079[\s\S]*SAMPLES 601 {2}INTERVAL 4 MS/, 'textual header');
        await pre.scrollIntoViewIfNeeded();
        await d.highlight(pre);
      } },
    { id: 'bytes', chapter: 'Byte mapping', chapterSub: 'Where each value sits in the trace header',
      say: 'Inline and crossline numbers come from bytes one eight nine and one nine three, the SEG-Y revision one standard, and every position can be changed. The coordinates come from bytes one eight one and one eight five, with a scalar of minus one hundred: each value is divided by a hundred.',
      sub: 'Inline and crossline numbers come from bytes 189 and 193, the SEG-Y revision 1 standard, and every position can be changed. The coordinates come from bytes 181 and 185, with a scalar of -100: each value is divided by a hundred.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /Hide textual header/ }));
        await d.highlight(dialog(d).getByLabel('Inline byte').locator('..').locator('..'));
        await d.sleep(2500);
        await d.click(dialog(d).getByRole('button', { name: /Show coordinate byte positions/ }));
        for (const [label, v] of [['X byte', '181'], ['Y byte', '185'], ['Scalar byte', '71']]) {
          const got = await dialog(d).getByLabel(label).inputValue();
          if (got !== v) throw new Error(`Narration mismatch at "${label}": expected ${v}, screen shows "${got}"`);
        }
        await expectText(d, dialog(d).getByText(/^Scalar:/), /Scalar: -100/, 'scalar');
        await d.highlight(dialog(d).getByLabel('X byte').locator('..').locator('..'));
      } },
    { id: 'crs', chapter: 'Coordinates', chapterSub: 'Every import declares its CRS',
      say: 'Nothing imports without a coordinate reference system. This survey is in W G S eighty four, U T M zone thirty two north, the same system as the project, so no conversion is needed. And the scanned coordinates are plausible for that zone.',
      sub: 'Nothing imports without a coordinate reference system. This survey is in WGS 84 / UTM zone 32N, the same system as the project, so no conversion is needed. And the scanned coordinates are plausible for that zone.',
      do: async (d) => {
        await d.unhighlight();
        const crs = dialog(d).getByText('Coordinate reference system of this file').locator('..').locator('..');
        await crs.scrollIntoViewIfNeeded();
        await expectText(d, crs, /EPSG:32632[\s\S]*No conversion needed[\s\S]*Scanned coordinates are plausible for this system/, 'CRS');
        await d.highlight(crs);
      } },
    { id: 'import',
      say: 'We convert it in this browser and start the import. The dialog closes, the conversion runs in the background, and the section is drawn straight from the file in the meantime.',
      do: async (d) => {
        await d.unhighlight();
        // the server choice is offered only where the server upload is allowed
        const where = dialog(d).locator('label:has(input[name="sl-import-where"])').nth(1);
        if (await where.count()) { await where.scrollIntoViewIfNeeded(); await d.click(where); }
        await d.click(dialog(d).getByRole('button', { name: 'Start import' }));
        await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
      },
      wait: async (d) => {
        await d.page.getByText(`${SMALL}: imported`).waitFor({ timeout: 600000 });
        await d.sleep(1500);
      },
      waitLabel: 'A minute later' },
    { id: 'imported',
      say: 'The import is done, and the new volume is listed in the Seismic Explorer. This small file is a corner of the Ekene survey. The whole survey was imported the same way earlier, so we open it.',
      do: async (d) => {
        await d.highlight(explorerItem(d, SMALL));
        await d.sleep(2500);
        await d.unhighlight();
        await d.select(combo(d, 'Active volume'), { label: FULL });
        await d.sleep(5000);
      } },
    { id: 'inline', chapter: 'Looking at the data', chapterSub: 'Inline, crossline and time slice',
      say: 'This is inline ten twenty seven, through the discovery well, Ekene one. The strong peak at about twelve hundred and ninety milliseconds is the top of the Ekene Sand. Deeper down, a growth fault offsets the older reflectors.',
      sub: 'This is inline 1027, through the discovery well, Ekene-1. The strong peak at about 1290 ms is the top of the Ekene Sand. Deeper down, a growth fault offsets the older reflectors.',
      do: async (d) => {
        await goTo(d, 1027);
        await expectText(d, d.page.locator('text=/^Inline \\d+$/ >> visible=true'), /^Inline 1027$/, 'inline 1027');
        const p = await sectionPoint(d, { frac: 51.5 / 128, ms: 1289, recordMs: RECORD_MS });
        await d.moveTo(p);
        await expectText(d, 'status-cursor', /IL 1027\s+·\s+XL 2051\s+·\s+12(8\d|9\d)\.\d ms/, 'cursor on the top Ekene peak');
        await d.sleep(2500);
        await d.moveTo(await sectionPoint(d, { frac: 74 / 128, ms: 1750, recordMs: RECORD_MS }));
      } },
    { id: 'crossline',
      say: 'Crossline twenty fifty one runs the other way. Along it, the top of the sand rises gently to a crest and rolls over: the Ekene structure.',
      sub: 'Crossline 2051 runs the other way. Along it, the top of the sand rises gently to a crest and rolls over: the Ekene structure.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Crossline' });
        await d.sleep(2000);
        await goTo(d, 2051);
        await expectText(d, d.page.locator('text=/^Crossline \\d+$/ >> visible=true'), /^Crossline 2051$/, 'crossline 2051');
      } },
    { id: 'timeslice',
      say: 'A time slice cuts across the survey at a single time. At twelve hundred and ninety two milliseconds it slices through the top of the Ekene Sand around the crest.',
      sub: 'A time slice cuts across the survey at a single time. At 1292 ms it slices through the top of the Ekene Sand around the crest.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Time slice' });
        await d.sleep(2000);
        await goTo(d, 1292);
        await expectText(d, d.page.locator('text=/^Time slice \\d+ ms$/ >> visible=true'), /^Time slice 1292 ms$/, 'time slice 1292 ms');
      } },
    { id: 'gain', chapter: 'Gain and colour', chapterSub: 'Display only, never baked in',
      say: 'Gain, clipping and colour change only what we see. They are applied on the graphics card, and the stored amplitudes are never touched, so every attribute and every pick works on the true values.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await d.sleep(1500);
        await goTo(d, 1027);
        const gain = d.page.getByRole('slider', { name: /Gain/ });
        await d.moveTo(gain);
        for (const g of ['1.5', '2', '2.5', '3']) { await gain.fill(g); await d.sleep(250); }
        await expectText(d, d.page.getByText(/^Gain ×/), /Gain ×3\.0/, 'gain 3');
        await d.sleep(1500);
        for (const g of ['2', '1']) { await gain.fill(g); await d.sleep(250); }
      } },
    { id: 'colour',
      say: 'A grey scale suits fault work. Red, white and blue shows polarity at a glance: with S E G normal polarity, a peak is blue, so the top of the Ekene Sand, a harder rock below a softer shale, is a blue event.',
      sub: 'A grey scale suits fault work. Red, white and blue shows polarity at a glance: with SEG normal polarity, a peak is blue, so the top of the Ekene Sand, a harder rock below a softer shale, is a blue event.',
      do: async (d) => {
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(3000);
        await d.select(combo(d, 'Colormap'), { label: 'Red-White-Blue' });
        await d.sleep(1000);
        await d.highlight(d.page.getByRole('button', { name: 'SEG normal' }));
      } },
    { id: 'seed', chapter: 'A first horizon', chapterSub: 'Seeded tracking of the top Ekene Sand',
      say: 'On the Interpretation tab, the tracker is set to follow peaks. We pick one seed on the top of the Ekene Sand, at the well.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(1200);
        await d.select(combo(d, 'Event'), { label: 'Peak (+)' });
        await d.click(d.page.getByRole('button', { name: 'Pick seed' }));
        await clickAt(d, await sectionPoint(d, { frac: 51.5 / 128, ms: 1289, recordMs: RECORD_MS }));
        await d.page.getByTestId('sl-seed-readout').waitFor();
      } },
    { id: 'seedat',
      say: 'The seed snaps to the peak on inline ten twenty seven, crossline twenty fifty one, at twelve hundred and ninety one milliseconds.',
      sub: 'The seed snaps to the peak on inline 1027, crossline 2051, at 1291 ms.',
      do: async (d) => {
        await expectText(d, 'sl-seed-readout', /Seed: IL 1027, XL 2051, 1291\.\d ms/, 'seed readout');
        await d.highlight('sl-seed-readout');
      } },
    { id: 'track',
      say: 'Track three D follows that peak outward from the seed, trace by trace, across the whole survey, and we name the result.',
      sub: 'Track 3D follows that peak outward from the seed, trace by trace, across the whole survey, and we name the result.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Track 3D' }));
        await d.page.getByText('Horizon tracked').waitFor({ timeout: 300000 });
      } },
    { id: 'tracked',
      say: 'Every one of the sixteen thousand three hundred and eighty four traces is picked: one hundred and twenty eight inlines by one hundred and twenty eight crosslines. The orange pick sits on the blue peak all the way across the section.',
      sub: 'Every one of the 16,384 traces is picked: 128 inlines by 128 crosslines. The orange pick sits on the blue peak all the way across the section.',
      do: async (d) => {
        const toast = d.page.getByText('Horizon tracked').locator('..');
        await expectText(d, toast, new RegExp(`${HORIZON}: 16,384 traces\\.`), 'tracked traces');
        await d.highlight(toast);
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Picking…' })); // disarm the seed tool
        await d.moveTo(await sectionPoint(d, { frac: 0.5, ms: 1289, recordMs: RECORD_MS }));
        await d.page.mouse.dblclick((await sectionPoint(d, { frac: 0.5, ms: 1289, recordMs: RECORD_MS })).x, (await sectionPoint(d, { frac: 0.5, ms: 1289, recordMs: RECORD_MS })).y);
        await d.sleep(1500);
      } },
    { id: 'next', chapter: 'Ready for the framework', chapterSub: 'Faults, wells and depth come next',
      say: 'That is the first horizon of the interpretation, saved with its seed and its tracking settings, so it can be checked and redone. Next, the wells build the rest of the framework.',
      do: async (d) => {
        await d.highlight(explorerItem(d, HORIZON));
        await d.sleep(3000);
      } },
  ],
};
