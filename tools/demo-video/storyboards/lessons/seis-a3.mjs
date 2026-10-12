// Seismolord lesson A3: viewing (Ekene kit v4, EKENE3D-v4-full.sgy).
// Sections and slices, polarity, gain, clip, AGC, colour maps and the
// wiggle display; the cursor readout at Ekene-1's top Ekene Sand (inline
// 1027, crossline 2051, 1290.6 ms, 4996.9 ft TVDSS, amp about 374) stays the
// same through every display change, which is the point of the lesson.
// Display settings persist per user, so setup and the last step put them
// back to the defaults the demos expect. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, FULL, RECORD_MS, xlFrac, ilFrac, closeWindow,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const lineLabel = (d, re) => d.page.locator(`text=/^${re}$/ >> visible=true`);
const READOUT = /IL 1027\s+·\s+XL 2051\s+·\s+129\d\.\d ms\s+·\s+499\d\.\d ft TVDSS\s+·\s+amp ≈374/;

async function goTo(d, value, { onCamera = true } = {}) {
  if (onCamera) { await d.type('sl-goto', String(value)); await d.click('sl-goto-btn'); } else {
    await t(d, 'sl-goto').fill(String(value)); await t(d, 'sl-goto-btn').click();
  }
  await d.sleep(1600);
}

/** The cursor on Ekene-1's top Ekene Sand, and the readout checked. */
async function readAtWell(d, what) {
  await d.moveTo(await at(d, 2051, 1290.6));
  await d.sleep(500);
  await expectText(d, 'status-cursor', READOUT, what);
}

async function displayDefaults(d) {
  await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
  await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
  if (await d.page.getByRole('button', { name: 'Reversed' }).count()) await d.page.getByRole('button', { name: 'Reversed' }).click();
  const agc = d.page.getByRole('button', { name: 'AGC', exact: true });
  if (/border-pl-primary/.test((await agc.getAttribute('class')) || '')) await agc.click();
  const tb = d.page.getByRole('button', { name: 'Trace balance' });
  if (/border-pl-primary/.test((await tb.getAttribute('class')) || '')) await tb.click();
  await combo(d, 'Amplitude scale').selectOption({ value: 'rms' });
  await d.page.getByRole('slider', { name: /Clip/ }).fill('3');
  await combo(d, 'Trace style').selectOption({ value: 'off' }).catch(() => {});
}

export default {
  id: 'lesson-seis-a3',
  ...seisLessonMeta(3, 'A', 'Viewing the seismic: *display is not data*', 'Sections and slices, polarity, gain, clip, AGC and colour maps, and why none of them changes a stored amplitude'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await displayDefaults(d);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await goTo(d, 1060, { onCamera: false });
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 3', chapterSub: 'Module A · Getting the seismic in',
      say: 'Once the survey is in, the first job is to look at it. This lesson covers sections and slices, polarity, gain and colour, and one rule that runs through all of them: the display is not the data.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 3', title: 'Viewing the seismic',
        body: '<ul><li>Inlines, crosslines and time slices</li><li>Polarity</li><li>Gain, clip and AGC</li><li>Colour maps and wiggles</li></ul>' }) },
    { id: 'inline', chapter: 'Sections', chapterSub: 'Inline, crossline, time slice',
      say: 'An inline is a vertical slice along the direction the survey was shot. Inline ten twenty seven crosses the discovery well, Ekene one. With the cursor on the top of the Ekene Sand, the readout gives the line, the crossline, the time, the depth from the velocity model, and the amplitude: about three hundred and seventy four.',
      sub: 'An inline is a vertical slice along the direction the survey was shot. Inline 1027 crosses the discovery well, Ekene-1. With the cursor on the top of the Ekene Sand, the readout gives the line, the crossline, the time, the depth from the velocity model, and the amplitude: about 374.',
      do: async (d) => {
        await d.hideSlide();
        await goTo(d, 1027);
        await expectText(d, lineLabel(d, 'Inline \\d+'), /^Inline 1027$/, 'inline 1027');
        await readAtWell(d, 'readout at the well');
        await d.highlight('status-cursor');
      } },
    { id: 'step',
      say: 'The player steps through the lines one at a time. The arrow keys do the same in the window.',
      do: async (d) => {
        await d.unhighlight();
        for (let i = 0; i < 3; i++) { await d.click('sl-step-next', { after: 300 }); }
        await expectText(d, lineLabel(d, 'Inline \\d+'), /^Inline 1030$/, 'stepped to 1030');
        await goTo(d, 1027, { onCamera: false });
        await expectText(d, lineLabel(d, 'Inline \\d+'), /^Inline 1027$/, 'back to 1027');
      } },
    { id: 'crossline',
      say: 'A crossline runs at right angles. Crossline twenty fifty one passes through the same well.',
      sub: 'A crossline runs at right angles. Crossline 2051 passes through the same well.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Crossline' });
        await d.sleep(800);
        await goTo(d, 2051);
        await expectText(d, lineLabel(d, 'Crossline \\d+'), /^Crossline 2051$/, 'crossline 2051');
        await d.moveTo(await sectionPoint(d, { frac: ilFrac(1027), ms: 1290, recordMs: RECORD_MS }));
      } },
    { id: 'slice',
      say: 'A time slice cuts the whole survey at one time. At thirteen hundred milliseconds it crosses the top of the sand in rings around the crest of the structure.',
      sub: 'A time slice cuts the whole survey at one time. At 1300 ms it crosses the top of the sand in rings around the crest of the structure.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Time slice' });
        await d.sleep(800);
        await goTo(d, 1300);
        await expectText(d, lineLabel(d, 'Time slice \\d+ ms'), /^Time slice 1300 ms$/, 'time slice 1300');
        const b = await d.page.locator('[data-testid="window-section"] canvas').first().boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.5, y: b.y + b.height * 0.45 }, { ms: 1200 });
      } },
    { id: 'polarity', chapter: 'Polarity', chapterSub: 'Which way is a hard rock?',
      say: 'Polarity says what an increase in impedance looks like. This volume is S E G normal: an increase is a positive number, a peak. The Ekene Sand is harder than the shale above it, so its top is a peak, blue in this colour map, with a positive amplitude.',
      sub: 'Polarity says what an increase in impedance looks like. This volume is SEG normal: an increase is a positive number, a peak. The Ekene Sand is harder than the shale above it, so its top is a peak, blue in this colour map, with a positive amplitude.',
      do: async (d) => {
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await d.sleep(800);
        await goTo(d, 1027);
        await readAtWell(d, 'positive peak');
        await d.highlight(d.page.getByRole('button', { name: 'SEG normal' }));
      } },
    { id: 'reverse',
      say: 'Reversing the display turns the peak red, for a processing report that says the data was delivered the other way. The readout still says plus three hundred and seventy four: only the picture changed.',
      sub: 'Reversing the display turns the peak red, for a processing report that says the data was delivered the other way. The readout still says +374: only the picture changed.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'SEG normal' }));
        await d.sleep(1000);
        await d.unhighlight();
        await readAtWell(d, 'readout after reversing');
        await d.sleep(1500);
        await d.click(d.page.getByRole('button', { name: 'Reversed' }));
        await d.sleep(600);
      } },
    { id: 'gain', chapter: 'Gain and clip', chapterSub: 'Brightness, not amplitude',
      say: 'Gain brightens the whole display, so weak deep reflections become easier to follow. At three times, the top of the sand saturates, but the readout is unchanged. The clip sets the amplitude at the ends of the colour bar, here three times the R M S.',
      sub: 'Gain brightens the whole display, so weak deep reflections become easier to follow. At three times, the top of the sand saturates, but the readout is unchanged. The clip sets the amplitude at the ends of the colour bar, here three times the RMS.',
      do: async (d) => {
        const gain = d.page.getByRole('slider', { name: /Gain/ });
        await d.moveTo(gain);
        for (const g of ['1.5', '2', '2.5', '3']) { await gain.fill(g); await d.sleep(300); }
        await expectText(d, d.page.getByText(/^Gain ×/), /Gain ×3\.0/, 'gain 3');
        await readAtWell(d, 'readout at gain 3');
        await d.sleep(1200);
        await d.highlight(d.page.getByText(/^Clip ×/).locator('..'));
        await expectText(d, d.page.getByText(/^Clip ×/), /Clip ×3\.0 RMS/, 'clip 3 RMS');
      } },
    { id: 'agc', chapter: 'AGC', chapterSub: 'For structure, never for amplitude',
      say: 'Automatic gain control scales each part of each trace by the amplitude around it, here in a hundred and twenty millisecond window. Every reflection comes out about equally strong, which helps to follow structure deep in the section. It also removes what an amplitude interpreter needs: the bright top of the sand no longer stands out. The stored value is still three hundred and seventy four.',
      sub: 'Automatic gain control scales each part of each trace by the amplitude around it, here in a 120 ms window. Every reflection comes out about equally strong, which helps to follow structure deep in the section. It also removes what an amplitude interpreter needs: the bright top of the sand no longer stands out. The stored value is still 374.',
      do: async (d) => {
        await d.unhighlight();
        const gain = d.page.getByRole('slider', { name: /Gain/ });
        for (const g of ['2', '1']) { await gain.fill(g); await d.sleep(250); }
        await d.click(d.page.getByRole('button', { name: 'AGC', exact: true }));
        await d.sleep(1200);
        await expectText(d, combo(d, 'Window').locator('option:checked'), /120 ms/, 'AGC window');
        await d.moveTo(await at(d, 2085, 2300), { ms: 1200 });
        await d.sleep(1500);
        await readAtWell(d, 'readout with AGC');
        await d.sleep(1500);
        await d.click(d.page.getByRole('button', { name: 'AGC', exact: true }));
        await d.sleep(800);
      } },
    { id: 'colour', chapter: 'Colour maps', chapterSub: 'Fit the map to the question',
      say: 'For amplitudes, use a diverging map with white at zero, like red, white and blue. For faults, greyscale: the eye reads breaks in grey better than in colour. Rainbow maps invent boundaries that are not in the data, so keep them for attributes.',
      do: async (d) => {
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(1200);
        await d.moveTo(await at(d, 2020, 900), { ms: 900 });
        await d.moveTo(await at(d, 2032, 1500), { ms: 1300 });
        await d.sleep(1200);
        await d.select(combo(d, 'Colormap'), { label: 'Red-White-Blue' });
        await d.sleep(800);
      } },
    { id: 'wiggle',
      say: 'Zoomed in, the wiggle display draws every trace as a line with its peaks filled. It is the honest view for checking a pick against the waveform.',
      do: async (d) => {
        const p = await at(d, 2051, 1290);
        await d.moveTo(p);
        await d.page.mouse.dblclick(p.x, p.y); await d.sleep(900);
        await d.page.mouse.dblclick(p.x, p.y); await d.sleep(900);
        await d.select(combo(d, 'Trace style'), { label: 'Wiggle + VA over density' });
        await d.sleep(2500);
      } },
    { id: 'rule', chapter: 'The rule', chapterSub: 'Display is not data',
      say: 'So, the rule. Gain, clip, A G C, polarity and colour are all display settings, and none of them is ever written into the volume. What you measure, from a horizon amplitude to an inversion, comes from the stored samples.',
      sub: 'So, the rule. Gain, clip, AGC, polarity and colour are all display settings, and none of them is ever written into the volume. What you measure, from a horizon amplitude to an inversion, comes from the stored samples.',
      do: async (d) => {
        await d.select(combo(d, 'Trace style'), { label: 'Density' });
        await d.sleep(600);
        await d.slide({ eyebrow: 'The rule', title: 'Display is not data',
          body: '<ul><li>Gain, clip, AGC: display only</li><li>Polarity and colour: display only</li><li>Measurements use the stored samples</li><li>Never interpret amplitude on AGC</li></ul>' });
      } },
    { id: 'next',
      say: 'That completes Module A. Next, Module B: picking a horizon, by hand and with the tracker.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next: Module B', title: 'Picking a horizon', body: '<ul><li>Manual and seeded picking</li><li>Correlation tracking</li><li>A peak against a zero crossing</li></ul>' });
        await displayDefaults(d);
      } },
  ],
};
