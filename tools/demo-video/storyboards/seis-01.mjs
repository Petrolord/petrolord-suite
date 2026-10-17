// Seismolord, video 1: from SEG-Y to a first horizon (Ekene kit v4).
// EKENE3D-v4-small.sgy is imported on camera (it converts inside the take);
// the full stack, EKENE3D-v4-full.sgy, already in the demo account, carries
// the rest: the listric growth fault and the rollover on dip lines (inlines
// 1053 through the crest and 1027 through Ekene-1), a strike line, a time
// slice cutting the closure, the 3D window and full view, and one seed on
// the top Ekene Sand tracked across the hanging wall. The tracker stops at
// the fault (Suite #1003, engines #348; before that fix it walked onto a weak
// footwall event). Ekene-1 sits at inline 1027, crossline 2051; the kit's
// 10-qi/ekene-qi-truth.md times the top Ekene Sand there at 1289 ms.
// `expectText` steps stop the take if the screen disagrees with the narration.
import path from 'node:path';
import {
  login, expectText, openSeismolord, deleteVolume, deleteHorizon, explorerItem,
  sectionPoint, clickAt, KIT, FULL, SMALL, RECORD_MS, xlFrac, ilFrac, fullscreenBtn, showSlicePlanes, closeWindow,
} from './seis-common.mjs';

const HORIZON = 'Top Ekene Sand';
const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog');
const combo = (d, name) => d.page.getByRole('combobox', { name });
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const lineLabel = (d, re) => d.page.locator(`text=/^${re}$/ >> visible=true`);

async function goTo(d, value) {
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(1600);
}

/** A slow drag on the 3D canvas; the drawn cursor glides along with it. */
async function drag3d(d, dx, dy, steps = 30) {
  const c = d.page.locator('[data-testid="window-3d"] canvas').first();
  const b = await c.boundingBox();
  const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
  await d.moveTo({ x: cx, y: cy });
  await d.page.mouse.move(cx, cy); await d.page.mouse.down();
  const glide = d.page.evaluate(([a, bb, ms]) => window.__demo.moveTo(a, bb, ms), [cx + dx, cy + dy, steps * 60]);
  for (let i = 1; i <= steps; i++) {
    await d.page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await d.sleep(40);
  }
  await glide;
  await d.page.mouse.up();
}

export default {
  id: 'seis-01',
  app: 'Seismolord',
  eyebrow: 'Seismolord · 1 of 3',
  title: 'From SEG-Y to a *first horizon*',
  subtitle: 'Importing a 3D survey, checking what the file really holds, the growth fault in section and in 3D, and the top of the Ekene Sand',
  outroTitle: 'Next: *the wells build the framework*',
  outroSub: 'Tops to horizons, faults and the 3D window · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(HORIZON) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await deleteVolume(d, SMALL); // the v4 small volume an earlier take imported
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteHorizon(d, HORIZON); // on the v4 full stack only
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await showSlicePlanes(d);
    // display settings persist: start each take from the defaults
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    // the 3D window's crossline and time slice planes: through the crest
    await combo(d, 'Orientation').selectOption({ label: 'Crossline' });
    await t(d, 'sl-goto').fill('2035'); await t(d, 'sl-goto-btn').click(); await d.sleep(1500);
    await combo(d, 'Orientation').selectOption({ label: 'Time slice' });
    await t(d, 'sl-goto').fill('1300'); await t(d, 'sl-goto-btn').click(); await d.sleep(1500);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1100'); await t(d, 'sl-goto-btn').click(); await d.sleep(1500);
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
      say: 'Seismolord is the Petrolord Suite\'s seismic interpretation app, and it runs in the browser. Here we take a three D survey from a SEG-Y file to a first horizon, on the Ekene field: a rollover trap against a growth fault.',
      sub: 'Seismolord is the Petrolord Suite\'s seismic interpretation app, and it runs in the browser. Here we take a 3D survey from a SEG-Y file to a first horizon, on the Ekene field: a rollover trap against a growth fault.',
      do: async (d) => {
        await d.highlight('sl-start-step-import');
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
      } },
    { id: 'file',
      say: 'We choose the file. Seismolord reads it in windows, so a large survey is never loaded whole.',
      do: async (d) => {
        const chooser = d.page.waitForEvent('filechooser');
        await d.click(dialog(d).getByRole('button', { name: 'Choose a SEG-Y or ZGY file' }));
        await (await chooser).setFiles(path.join(KIT, '04-seismic', SMALL));
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1200);
      } },
    { id: 'measured', chapter: 'What the file really holds', chapterSub: 'Geometry measured from the trace headers',
      say: 'The scan measures the geometry from the trace headers: two thousand and forty eight traces, inlines ten thirty eight to ten sixty nine, crosslines nineteen ninety two to twenty fifty five, and eight hundred and seventy six samples at four milliseconds, in I E E E float.',
      sub: 'The scan measures the geometry from the trace headers: 2,048 traces, inlines 1038 to 1069, crosslines 1992 to 2055, and 876 samples at 4 ms, in IEEE float.',
      do: async (d) => {
        const box = dialog(d).getByText(/^Format:/).locator('..');
        await expectText(d, box, /Format: IEEE float[\s\S]*Traces: 2,048[\s\S]*Samples: 876 @ 4 ms[\s\S]*Inlines: 1038–1069 \(step 1\)[\s\S]*Crosslines: 1992–2055 \(step 1\)/, 'measured geometry');
        await d.highlight(box);
      } },
    { id: 'header',
      say: 'The textual header agrees: survey Ekene three D, version four, the same ranges, and a thirty five hundred millisecond record. When the two disagree, Seismolord trusts the measurement.',
      sub: 'The textual header agrees: survey Ekene 3D V4, the same ranges, and a 3500 ms record. When the two disagree, Seismolord trusts the measurement.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /Show textual header/ }));
        const pre = dialog(d).locator('pre').first();
        await expectText(d, pre, /SURVEY EKENE 3D V4[\s\S]*INLINE RANGE 1038 TO 1069[\s\S]*CROSSLINE RANGE 1992 TO 2055[\s\S]*SAMPLES 876 {2}INTERVAL 4 MS {2}RECORD 3500 MS/, 'textual header');
        await pre.scrollIntoViewIfNeeded();
        await d.highlight(pre);
      } },
    { id: 'bytes', chapter: 'Byte mapping', chapterSub: 'Where each value sits in the trace header',
      say: 'Inline and crossline come from bytes one eight nine and one nine three, and the coordinates from one eight one and one eight five, with a scalar of minus one hundred. All of them can be changed.',
      sub: 'Inline and crossline come from bytes 189 and 193, and the coordinates from 181 and 185, with a scalar of -100. All of them can be changed.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /Hide textual header/ }));
        await d.highlight(dialog(d).getByLabel('Inline byte').locator('..').locator('..'));
        await d.sleep(2500);
        await d.click(dialog(d).getByRole('button', { name: /Show coordinate byte positions/ }));
        for (const [label, v] of [['Inline byte', '189'], ['Crossline byte', '193'], ['X byte', '181'], ['Y byte', '185'], ['Scalar byte', '71']]) {
          const got = await dialog(d).getByLabel(label).inputValue();
          if (got !== v) throw new Error(`Narration mismatch at "${label}": expected ${v}, screen shows "${got}"`);
        }
        await expectText(d, dialog(d).getByText(/^Scalar:/), /Scalar: -100/, 'scalar');
        await d.highlight(dialog(d).getByLabel('X byte').locator('..').locator('..'));
      } },
    { id: 'crs', chapter: 'Coordinates', chapterSub: 'Every import declares its CRS',
      say: 'Every import declares its coordinate system. Here it is W G S eighty four, U T M zone thirty two north, the project\'s own, so nothing is converted.',
      sub: 'Every import declares its coordinate system. Here it is WGS 84 / UTM zone 32N, the project\'s own, so nothing is converted.',
      do: async (d) => {
        await d.unhighlight();
        const crs = dialog(d).getByText('Coordinate reference system of this file').locator('..').locator('..');
        await crs.scrollIntoViewIfNeeded();
        await expectText(d, crs, /EPSG:32632[\s\S]*WGS 84 \/ UTM zone 32N[\s\S]*No conversion needed[\s\S]*Scanned coordinates are plausible for this system/, 'CRS');
        await d.highlight(crs);
      } },
    { id: 'import',
      say: 'We convert it in this browser and start the import.',
      do: async (d) => {
        await d.unhighlight();
        // the server choice is offered only where the server upload is allowed
        const where = dialog(d).locator('label:has(input[name="sl-import-where"])').nth(1);
        if (await where.count()) { await where.scrollIntoViewIfNeeded(); await d.click(where); }
        await d.click(dialog(d).getByRole('button', { name: 'Start import', exact: true }));
        await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
      },
      wait: async (d) => {
        await d.page.getByText(`${SMALL}: imported`).waitFor({ timeout: 600000 });
        await d.sleep(1500);
      },
      waitLabel: 'A minute later' },
    { id: 'imported',
      say: 'This file is a corner of the survey. The whole survey was imported the same way earlier, so we open it.',
      do: async (d) => {
        await d.highlight(explorerItem(d, SMALL));
        await d.sleep(2500);
        await d.unhighlight();
        await d.select(combo(d, 'Active volume'), { label: FULL });
        await d.sleep(4000);
      } },
    { id: 'dipline', chapter: 'The growth fault', chapterSub: 'A dip line through the crest',
      say: 'Inline ten fifty three runs down dip, through the crest. The growth fault reaches almost to the top of the section, and flattens with depth.',
      sub: 'Inline 1053 runs down dip, through the crest. The growth fault reaches almost to the top of the section, and flattens with depth.',
      do: async (d) => {
        await goTo(d, 1053);
        await expectText(d, lineLabel(d, 'Inline \\d+'), /^Inline 1053$/, 'inline 1053');
        await d.moveTo(await at(d, 2006, 250));
        await d.sleep(1800);
        await d.moveTo(await at(d, 2018, 1150), { ms: 1400 });
        await d.moveTo(await at(d, 2036, 1850), { ms: 1400 });
      } },
    { id: 'fullview',
      say: 'Full view gives the section the whole screen. Against the fault the beds roll over: that is the Ekene trap. Deeper layers thicken toward the fault, which moved while they were laid down.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(2200);
        await d.moveTo(await at(d, 2045, 1285), { ms: 900 });
        await d.moveTo(await at(d, 2085, 1270), { ms: 1500 });
        await d.sleep(1500);
        await d.moveTo(await at(d, 2040, 1650), { ms: 1200 });
        await d.moveTo(await at(d, 2100, 1600), { ms: 1600 });
      } },
    { id: 'well', chapter: 'Looking at the data', chapterSub: 'Inline, crossline and time slice',
      say: 'Inline ten twenty seven crosses the discovery well, Ekene one. The top of the Ekene Sand is the strong peak at about twelve ninety milliseconds. Across the fault it sits higher.',
      sub: 'Inline 1027 crosses the discovery well, Ekene-1. The top of the Ekene Sand is the strong peak at about 1290 ms. Across the fault it sits higher.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section')); // back from full view
        await d.sleep(1500);
        if (await d.page.evaluate(() => !!document.fullscreenElement)) throw new Error('the section is still in full view');
        await goTo(d, 1027);
        await expectText(d, lineLabel(d, 'Inline \\d+'), /^Inline 1027$/, 'inline 1027');
        await d.moveTo(await at(d, 2051, 1289));
        await expectText(d, 'status-cursor', /IL 1027\s+·\s+XL 2051\s+·\s+12(8\d|9\d)\.\d ms/, 'cursor on the top Ekene peak');
        await d.sleep(1800);
        await d.moveTo(await at(d, 1995, 1235), { ms: 1200 });
      } },
    { id: 'strike',
      say: 'Crossline twenty thirty five runs along the fault, through the crest, and the sand arches here too.',
      sub: 'Crossline 2035 runs along the fault, through the crest, and the sand arches here too.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Crossline' });
        await d.sleep(800);
        await goTo(d, 2035);
        await expectText(d, lineLabel(d, 'Crossline \\d+'), /^Crossline 2035$/, 'crossline 2035');
        const p = await sectionPoint(d, { frac: ilFrac(1054), ms: 1285, recordMs: RECORD_MS });
        await d.moveTo(p);
      } },
    { id: 'timeslice',
      say: 'At thirteen hundred milliseconds, the time slice cuts the top of the sand in closed rings around the crest.',
      sub: 'At 1300 ms, the time slice cuts the top of the sand in closed rings around the crest.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Time slice' });
        await d.sleep(800);
        await goTo(d, 1300);
        await expectText(d, lineLabel(d, 'Time slice \\d+ ms'), /^Time slice 1300 ms$/, 'time slice 1300 ms');
        const c = d.page.locator('[data-testid="window-section"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.45 });
        await d.sleep(1000);
        await d.moveTo({ x: b.x + b.width * 0.21, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'gain', chapter: 'Gain and colour', chapterSub: 'Display only, never baked in',
      say: 'Gain and colour are display only: the stored amplitudes never change. Grey suits fault work. In red, white and blue, with S E G normal polarity, the top of the sand is a blue peak.',
      sub: 'Gain and colour are display only: the stored amplitudes never change. Grey suits fault work. In red, white and blue, with SEG normal polarity, the top of the sand is a blue peak.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await d.sleep(800);
        await goTo(d, 1053);
        const gain = d.page.getByRole('slider', { name: /Gain/ });
        await d.moveTo(gain);
        for (const g of ['1.5', '2', '2.5', '3']) { await gain.fill(g); await d.sleep(250); }
        await expectText(d, d.page.getByText(/^Gain ×/), /Gain ×3\.0/, 'gain 3');
        await d.sleep(800);
        for (const g of ['2.5', '2']) { await gain.fill(g); await d.sleep(250); }
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(2000);
        await d.select(combo(d, 'Colormap'), { label: 'Red-White-Blue' });
        await d.sleep(800);
        await d.highlight(d.page.getByRole('button', { name: 'SEG normal' }));
      } },
    { id: 'threed', chapter: 'In 3D', chapterSub: 'Three slices in place',
      say: 'The three D window shows the inline, the crossline and the time slice together, in place.',
      sub: 'The 3D window shows the inline, the crossline and the time slice together, in place.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(700);
        await d.click(d.page.getByText('3D', { exact: true }).last());
        await d.sleep(900);
        await d.page.keyboard.press('Escape');
        await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
        await d.sleep(3000);
        const c = d.page.locator('[data-testid="window-3d"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        for (let i = 0; i < 3; i++) { await d.page.mouse.wheel(0, -240); await d.sleep(350); }
      } },
    { id: 'fullview3d',
      say: 'In full view we tilt it, and the rings of the rollover close around the crest.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(1500);
        await drag3d(d, 0, 60, 12);
        await d.sleep(600);
        await drag3d(d, -120, 0, 16);
        await d.sleep(800);
      } },
    { id: 'seed', chapter: 'A first horizon', chapterSub: 'Seeded tracking of the top Ekene Sand',
      say: 'On the Interpretation tab the tracker follows peaks, and we pick one seed on the top of the sand, at the well.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, '3d')); // back from full view
        await d.sleep(1200);
        if (await d.page.evaluate(() => !!document.fullscreenElement)) throw new Error('the 3D window is still in full view');
        await d.click(d.page.locator('button[title="Close 3D"]'));
        await d.sleep(1000);
        await goTo(d, 1027);
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(1000);
        await d.select(combo(d, 'Event'), { label: 'Peak (+)' });
        await d.click(d.page.getByRole('button', { name: 'Pick seed' }));
        await clickAt(d, await at(d, 2051, 1289));
        await d.page.getByTestId('sl-seed-readout').waitFor();
      } },
    { id: 'seedat',
      say: 'It snaps to inline ten twenty seven, crossline twenty fifty one, at twelve hundred and ninety point nine milliseconds.',
      sub: 'It snaps to inline 1027, crossline 2051, at 1290.9 ms.',
      do: async (d) => {
        await expectText(d, 'sl-seed-readout', /Seed: IL 1027, XL 2051, 1290\.9 ms/, 'seed readout');
        await d.highlight('sl-seed-readout');
      } },
    { id: 'track',
      say: 'Track three D follows the peak outward, trace by trace.',
      sub: 'Track 3D follows the peak outward, trace by trace.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Track 3D' }));
      },
      wait: async (d) => {
        await d.page.getByText('Horizon tracked').waitFor({ timeout: 300000 });
        await d.sleep(600);
      },
      waitLabel: 'Seconds later' },
    { id: 'tracked',
      say: 'It picks thirteen thousand five hundred and eighty of the survey\'s twenty one thousand five hundred and four traces: the whole hanging wall. At the fault the sand is thrown up out of reach, so the tracker stops.',
      sub: 'It picks 13,580 of the survey\'s 21,504 traces: the whole hanging wall. At the fault the sand is thrown up out of reach, so the tracker stops.',
      do: async (d) => {
        const toast = d.page.getByText('Horizon tracked').locator('..');
        await expectText(d, toast, new RegExp(`${HORIZON}: 13,580 of 21,504 traces\\.`), 'tracked traces');
        await d.highlight(toast);
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Picking…' })); // disarm the seed tool
        await d.moveTo(await at(d, 2024, 1300), { ms: 1200 });
      } },
    { id: 'next', chapter: 'Ready for the framework', chapterSub: 'Faults, wells and depth come next',
      say: 'The horizon is saved with its seed and settings. Next, the wells build the framework, with the fault as a barrier, so the footwall can be tracked too.',
      do: async (d) => {
        await d.highlight(explorerItem(d, HORIZON));
        await d.sleep(3000);
      } },
  ],
};
