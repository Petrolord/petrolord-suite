// Seismolord lesson B4: picking a horizon (Ekene kit v4, EKENE3D-v4-full.sgy).
// Manual picks snapped to the peak, a seed and Track 2D on inline 1027,
// a peak against the two zero crossings of the top Ekene Sand at Ekene-1
// (1290.9, 1280.1 and 1299.9 ms), and correlation (NCC) tracking in 3D
// (21,461 of 21,504 traces at threshold 0.7, window ±3).
// Only "Lesson ..." horizons are created and removed. Figures from the
// 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, clickAt, deleteHorizonsMatching, explorerItem,
  FULL, RECORD_MS, xlFrac, closeWindow,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const MANUAL = 'Lesson Ekene manual';
const NCC = 'Lesson Ekene correlation';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const seedBtn = (d) => d.page.getByRole('button', { name: /^(Pick seed|Picking…)$/ }).first();
let promptName = MANUAL;

async function seedAt(d, xl, ms) {
  if ((await seedBtn(d).innerText()).includes('Pick seed')) await d.click(seedBtn(d));
  await clickAt(d, await at(d, xl, ms));
  await d.sleep(700);
}

export default {
  id: 'lesson-seis-b4',
  ...seisLessonMeta(4, 'B', 'Picking a horizon: *by hand and with the tracker*', 'Manual picks that snap to the event, a seed and 2D tracking, a peak against a zero crossing, and correlation tracking across the survey'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(promptName) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteHorizonsMatching(d, /^Lesson /);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1027'); await t(d, 'sl-goto-btn').click(); await d.sleep(1500);
    await t(d, 'sl-ribbon-tab-interpretation').click(); await d.sleep(800);
    await combo(d, 'Event').selectOption({ label: 'Peak (+)' });
    await combo(d, 'Window').selectOption({ value: '3' });
    await combo(d, 'Target').selectOption({ value: 'new' }).catch(() => {});
    promptName = MANUAL;
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 4', chapterSub: 'Module B · Horizons',
      say: 'A horizon is one reflection followed across the survey, the surface every map, volume and depth conversion is built on. This lesson picks the top of the Ekene Sand three ways: by hand, with a seed and the tracker, and with correlation tracking.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 4', title: 'Picking a horizon',
        body: '<ul><li>Manual picks that snap to the event</li><li>A seed and 2D tracking</li><li>A peak or a zero crossing?</li><li>Correlation tracking in 3D</li></ul>' }) },
    { id: 'which', chapter: 'What to pick', chapterSub: 'The event and the interface',
      say: 'A reflection is the seismic picture of an interface. On zero phase data like this, the interface sits at the centre of the peak, so the peak is the natural pick. On minimum phase data it sits nearer the onset. Whatever you choose, choose it once and keep to it across the survey.',
      do: async (d) => d.slide({ eyebrow: 'What to pick', title: 'Peak, trough or zero crossing',
        body: '<ul><li>Zero phase: the interface is at the peak</li><li>Minimum phase: nearer the onset</li><li>SEG normal: a harder rock below is a peak</li><li>Pick one event and keep to it</li></ul>' }) },
    { id: 'manual', chapter: 'By hand', chapterSub: 'Manual picks snap to the event',
      say: 'On inline ten twenty seven, through Ekene one, the top of the sand is the strong peak at about twelve ninety milliseconds. With manual picking, a drag along the event places picks that snap to the nearest peak within three samples, so the hand only has to be close.',
      sub: 'On inline 1027, through Ekene-1, the top of the sand is the strong peak at about 1290 ms. With manual picking, a drag along the event places picks that snap to the nearest peak within three samples, so the hand only has to be close.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(d.page.getByRole('button', { name: /^(Manual|Picking…)$/ }).first());
        const a = await at(d, 2026, 1292); const b = await at(d, 2076, 1294);
        await d.moveTo(a);
        await d.page.mouse.move(a.x, a.y); await d.page.mouse.down();
        const glide = d.page.evaluate(([x, y, ms]) => window.__demo.moveTo(x, y, ms), [b.x, b.y, 2600]);
        for (let i = 1; i <= 40; i++) { await d.page.mouse.move(a.x + ((b.x - a.x) * i) / 40, a.y + ((b.y - a.y) * i) / 40 + Math.sin(i / 3) * 4); await d.sleep(60); }
        await glide;
        await d.page.mouse.up();
        await d.sleep(800);
      } },
    { id: 'save',
      say: 'The picks are an edit session until they are saved. Save as makes them a new horizon.',
      do: async (d) => {
        promptName = MANUAL;
        await d.click(d.page.getByRole('button', { name: 'Save as…' }));
        await explorerItem(d, MANUAL).waitFor({ timeout: 30000 });
        await d.sleep(800);
        await d.highlight(explorerItem(d, MANUAL));
      } },
    { id: 'seed', chapter: 'Seed and track', chapterSub: 'One pick, then the tracker',
      say: 'Picking a whole survey by hand would take weeks. Instead we place one seed at the well. It snaps to inline ten twenty seven, crossline twenty fifty one, at twelve hundred and ninety point nine milliseconds.',
      sub: 'Picking a whole survey by hand would take weeks. Instead we place one seed at the well. It snaps to inline 1027, crossline 2051, at 1290.9 ms.',
      do: async (d) => {
        await d.unhighlight();
        await seedAt(d, 2051, 1289);
        await expectText(d, 'sl-seed-readout', /Seed: IL 1027, XL 2051, 1290\.9 ms/, 'peak seed');
        await d.highlight('sl-seed-readout');
      } },
    { id: 'track2d',
      say: 'Track two D follows the peak along this line, trace by trace, in both directions, until the event is lost. Westward it stops at the growth fault, where the sand is thrown up out of reach.',
      sub: 'Track 2D follows the peak along this line, trace by trace, in both directions, until the event is lost. Westward it stops at the growth fault, where the sand is thrown up out of reach.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Track 2D' }));
        await d.sleep(1500);
        await d.moveTo(await at(d, 2030, 1290), { ms: 1400 });
        await d.moveTo(await at(d, 2018, 1240), { ms: 900 });
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: 'Discard' }));
        await d.sleep(600);
      } },
    { id: 'zero', chapter: 'Peak or zero crossing', chapterSub: 'The same event, three answers',
      say: 'Now the same seed with other events. The zero crossing from minus to plus, above the peak, is at twelve eighty point one milliseconds. The crossing from plus to minus, below it, at twelve ninety nine point nine. About ten milliseconds either side: roughly forty feet of depth here. Mix events between wells and the map carries that error.',
      sub: 'Now the same seed with other events. The zero crossing from minus to plus, above the peak, is at 1280.1 ms. The crossing from plus to minus, below it, at 1299.9 ms. About 10 ms either side: roughly 40 ft of depth here. Mix events between wells and the map carries that error.',
      do: async (d) => {
        await d.select(combo(d, 'Event'), { label: 'Zero cross − → +' });
        await seedAt(d, 2051, 1289);
        await expectText(d, 'sl-seed-readout', /Seed: IL 1027, XL 2051, 1280\.1 ms/, 'zero crossing above');
        await d.highlight('sl-seed-readout');
        await d.sleep(2500);
        await d.select(combo(d, 'Event'), { label: 'Zero cross + → −' });
        await seedAt(d, 2051, 1289);
        await expectText(d, 'sl-seed-readout', /Seed: IL 1027, XL 2051, 1299\.9 ms/, 'zero crossing below');
      } },
    { id: 'ncc', chapter: 'Correlation tracking', chapterSub: 'Following the waveform',
      say: 'Correlation tracking follows the shape of the whole waveform around the pick. Each new trace is compared with its neighbour, and a pick is kept only if the correlation is at least nought point seven, within three samples. Back on the peak seed, Track three D runs across the survey.',
      sub: 'Correlation tracking follows the shape of the whole waveform around the pick. Each new trace is compared with its neighbour, and a pick is kept only if the correlation is at least 0.7, within three samples. Back on the peak seed, Track 3D runs across the survey.',
      do: async (d) => {
        await d.unhighlight();
        await d.select(combo(d, 'Event'), { label: 'Peak (+)' });
        await seedAt(d, 2051, 1289);
        await d.select(combo(d, 'Event'), { label: 'Correlation (NCC)' });
        await d.sleep(600);
        await expectText(d, combo(d, 'Threshold').locator('option:checked'), /0\.7/, 'threshold 0.7');
        await d.highlight(combo(d, 'Threshold').locator('..').locator('..'));
        await d.sleep(1500);
        promptName = NCC;
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Track 3D' }));
      },
      wait: async (d) => {
        await d.page.getByText('Horizon tracked').waitFor({ timeout: 300000 });
        // the toast is checked here: it can close before the next step's narration ends
        await expectText(d, d.page.getByText('Horizon tracked').locator('..'), new RegExp(`${NCC}: 21,461 of 21,504 traces\\.`), 'NCC tracked traces');
        await d.sleep(600);
      },
      waitLabel: 'Seconds later' },
    { id: 'tracked',
      say: 'It picks twenty one thousand four hundred and sixty one of the twenty one thousand five hundred and four traces: almost the whole survey, on both sides of the fault. Every pick keeps its correlation as a confidence. Whether all of those picks are on the right event is the subject of the next lesson.',
      sub: 'It picks 21,461 of the 21,504 traces: almost the whole survey, on both sides of the fault. Every pick keeps its correlation as a confidence. Whether all of those picks are on the right event is the subject of the next lesson.',
      do: async (d) => {
        const toast = d.page.getByText('Horizon tracked').locator('..');
        if (await toast.isVisible().catch(() => false)) { await d.highlight(toast); await d.sleep(2500); await d.unhighlight(); }
        if (await d.page.getByRole('button', { name: 'Picking…' }).count()) await d.click(d.page.getByRole('button', { name: 'Picking…' }).first());
        await d.highlight(explorerItem(d, NCC));
      } },
    { id: 'next',
      say: 'Next lesson, tracking QC: the confidence map, rejecting weak picks, the eraser, and versions to go back to.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Tracking QC', body: '<ul><li>Confidence</li><li>Reject and repick</li><li>The eraser</li><li>Versions</li></ul>' });
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
      } },
  ],
};
