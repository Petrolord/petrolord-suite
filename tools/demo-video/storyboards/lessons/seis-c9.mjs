// Seismolord lesson C9: horizons across faults (Ekene kit v4, EKENE3D-v4-full.sgy).
// The top Ekene Sand on inline 1027 on both sides of the growth fault
// (hanging wall at Ekene-1, 1290.9 ms; footwall at crossline 2005, 1209.3 ms),
// the throw the framework measures at the fault itself (59.7 ms, lesson B6),
// then a correlation track from the footwall seed with Stop at faults, which
// keeps to the footwall since Suite #1023 (before it the tracker walked round
// the end of the fault at the survey edge), and the demo framework's Ekene
// Sand in the Map window, carried across the fault. Only "Lesson ..." items
// are created. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, clickAt, deleteHorizonsMatching, deleteFault, setVisible, explorerItem,
  FULL, RECORD_MS, xlFrac, closeWindow,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const H = 'Lesson Ekene footwall';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const mapCanvas = (d) => d.page.locator('[data-testid="window-map"] canvas').first();
const seedBtn = (d) => d.page.getByRole('button', { name: /^(Pick seed|Picking…)$/ }).first();

async function seedAt(d, xl, ms, re, what) {
  if ((await seedBtn(d).innerText()).includes('Pick seed')) await d.click(seedBtn(d));
  await clickAt(d, await at(d, xl, ms));
  // a footwall seed waits for its bricks: the readout follows a moment later
  await d.page.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.textContent || ''),
    ['sl-seed-readout', re.source], { timeout: 20000 }).catch(() => {});
  await expectText(d, 'sl-seed-readout', re, what);
}

export default {
  id: 'lesson-seis-c9',
  ...seisLessonMeta(9, 'C', 'Horizons *across faults*', 'The jump at a fault, the throw, faults as barriers for tracking, and a framework carried into the next block'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(H) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteHorizonsMatching(d, /^Lesson (Ekene footwall|fw test)/);
    // faults from other lessons (C7) would add barriers and change the count
    const lessonFaults = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).filter((n) => /^Lesson .*fault/i.test(n));
    for (const f of lessonFaults) await deleteFault(d, f);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await setVisible(d, 'Auto-1', true);
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1027'); await t(d, 'sl-goto-btn').click(); await d.sleep(2000);
    await t(d, 'sl-ribbon-tab-interpretation').click(); await d.sleep(600);
    await combo(d, 'Event').selectOption({ label: 'Peak (+)' });
    await combo(d, 'Window').selectOption({ value: '3' });
    const stop = d.page.getByRole('button', { name: 'Stop at faults' });
    if (/warning/.test((await stop.getAttribute('class')) || '')) await stop.click();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 9', chapterSub: 'Module C · Faults',
      say: 'A horizon does not end at a fault. It carries on in the next block, at a different time. This lesson measures that jump, uses the fault as a wall so the tracker cannot cross it by mistake, and looks at a framework carried into a block no well reaches.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 9', title: 'Horizons across faults',
        body: '<ul><li>The jump at a fault</li><li>Throw</li><li>The fault as a barrier</li><li>Carried into the next block</li></ul>' }) },
    { id: 'jump', chapter: 'The jump', chapterSub: 'The same sand on both sides',
      say: 'On inline ten twenty seven, the top of the Ekene Sand at the well is the peak at twelve hundred and ninety point nine milliseconds. Across the growth fault, in the footwall, the same sand is thrown up: the peak at crossline two thousand and five is at twelve hundred and nine point three.',
      sub: 'On inline 1027, the top of the Ekene Sand at the well is the peak at 1290.9 ms. Across the growth fault, in the footwall, the same sand is thrown up: the peak at crossline 2005 is at 1209.3 ms.',
      do: async (d) => {
        await d.hideSlide();
        await seedAt(d, 2051, 1289, /Seed: IL 1027, XL 2051, 1290\.9 ms/, 'hanging-wall seed');
        await d.highlight('sl-seed-readout');
        await d.sleep(2500);
        await d.unhighlight();
        await seedAt(d, 2005, 1211, /Seed: IL 1027, XL 2005, 1209\.3 ms/, 'footwall seed');
        await d.highlight('sl-seed-readout');
      } },
    { id: 'throw', chapter: 'Throw', chapterSub: 'Measured at the fault itself',
      say: 'That is about eighty two milliseconds between two traces forty six crosslines apart, and part of it is the rollover, which dips into the fault. The throw is the jump measured right at the fault, where the two sides meet. For this sand the framework in lesson six measured fifty nine point seven milliseconds.',
      sub: 'That is about 82 ms between two traces 46 crosslines apart, and part of it is the rollover, which dips into the fault. The throw is the jump measured right at the fault, where the two sides meet. For this sand the framework in lesson 6 measured 59.7 ms.',
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(await at(d, 2050, 1292), { ms: 900 });
        await d.moveTo(await at(d, 2022, 1270), { ms: 1600 });
        await d.sleep(1200);
        await d.moveTo(await at(d, 2008, 1212), { ms: 1200 });
      } },
    { id: 'barrier', chapter: 'The fault as a barrier', chapterSub: 'Stop at faults',
      say: 'Now track the footwall. Correlation tracking alone crossed this fault in lesson five. With Stop at faults on, the fault surface at the seed\'s time becomes a wall the tracker cannot pass, carried to the edge of the survey where the fault runs off it.',
      sub: 'Now track the footwall. Correlation tracking alone crossed this fault in lesson 5. With Stop at faults on, the fault surface at the seed\'s time becomes a wall the tracker cannot pass, carried to the edge of the survey where the fault runs off it.',
      do: async (d) => {
        await d.unhighlight();
        await d.select(combo(d, 'Event'), { label: 'Correlation (NCC)' });
        await d.sleep(500);
        const stop = d.page.getByRole('button', { name: 'Stop at faults' });
        await d.click(stop);
        await d.sleep(600);
        if (!/warning/.test((await stop.getAttribute('class')) || '')) throw new Error('Stop at faults is not on');
        await d.highlight(stop);
        await d.sleep(2000);
        await d.unhighlight();
        await d.click(d.page.getByRole('button', { name: 'Track 3D' }));
      },
      wait: async (d) => {
        const toast = d.page.getByText(/^Lesson Ekene footwall: [\d,]+ of 21,504 traces\.$/);
        await toast.waitFor({ timeout: 300000 });
        await expectText(d, toast, /Lesson Ekene footwall: 7,546 of 21,504 traces\./, 'footwall traces');
        await d.sleep(800);
      },
      waitLabel: 'Seconds later' },
    { id: 'tracked',
      say: 'It picks seven thousand five hundred and forty six of the twenty one thousand five hundred and four traces, and stops at the fault.',
      sub: 'It picks 7,546 of the 21,504 traces, and stops at the fault.',
      do: async (d) => {
        if (await d.page.getByRole('button', { name: 'Picking…' }).count()) await d.click(d.page.getByRole('button', { name: 'Picking…' }).first());
        await d.highlight(explorerItem(d, H));
        await d.sleep(1500);
        await d.unhighlight();
        await d.moveTo(await at(d, 1990, 1210), { ms: 900 });
        await d.moveTo(await at(d, 2014, 1212), { ms: 1200 });
      } },
    { id: 'map', chapter: 'In the Map window', chapterSub: 'One block, then both',
      say: 'In the Map window the footwall horizon fills the block west of the fault and nothing beyond it.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(600);
        await d.click(d.page.getByText('Map', { exact: true }).last());
        await d.sleep(600);
        await d.page.keyboard.press('Escape');
        await mapCanvas(d).waitFor();
        await d.sleep(1500);
        await d.select(d.page.locator('select[title^="Mapped layer"]'), { label: H });
        await d.sleep(2500);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.2, y: b.y + b.height * 0.5 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.42, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'carried', chapter: 'Carried across', chapterSub: 'One horizon, two blocks',
      say: 'The framework from lesson six does the rest. Its Ekene Sand was tracked from the wells in the hanging wall, then carried across the fault by the measured throw and tracked on through the footwall: one horizon, both blocks, with the fault gap between them.',
      sub: 'The framework from lesson 6 does the rest. Its Ekene Sand was tracked from the wells in the hanging wall, then carried across the fault by the measured throw and tracked on through the footwall: one horizon, both blocks, with the fault gap between them.',
      do: async (d) => {
        await setVisible(d, 'Ekene Sand', true);
        await d.sleep(1200);
        await d.select(d.page.locator('select[title^="Mapped layer"]'), { label: 'Ekene Sand' });
        await d.sleep(3000);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.25, y: b.y + b.height * 0.4 }, { ms: 1000 });
        await d.moveTo({ x: b.x + b.width * 0.43, y: b.y + b.height * 0.45 }, { ms: 1200 });
        await d.moveTo({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.5 }, { ms: 1200 });
      } },
    { id: 'next',
      say: 'That completes Module C. Next, Module D: the wells in the seismic, and time to depth.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next: Module D', title: 'Wells in the seismic', body: '<ul><li>Well paths, tops and logs on the section</li><li>Checkshots and the velocity model</li><li>A horizon converted to depth</li></ul>' });
        await setVisible(d, 'Ekene Sand', false);
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
      } },
  ],
};
