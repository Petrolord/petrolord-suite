// Seismolord, video 2: the wells build the framework (Ekene kit v3).
// Tops to Horizons on the full stack: six wells with tops, the field tie
// convention, every top matched to its event, the growth fault picked
// automatically below the reservoir, the framework tracked and carried
// across the fault, the leave-one-well-out check, then the deep horizons on
// a section and in the 3D window. Figures from the 2026-10-11 dry run on the
// fixed tracker (Suite #996, engines #346); `expectText` steps stop the take
// if the screen disagrees with the narration.
//
// The project already holds the ten horizons made from these tops (QI
// Studio's saved settings point at them, so they stay), so Accept saves the
// new ones under numbered names; each take first deletes the numbered set
// and the automatic fault an earlier take saved.
import {
  login, expectText, openSeismolord, explorerRow, setVisible, deleteHorizonsMatching, deleteFault, FULL,
} from './seis-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const DEEP = ['Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation'];
const t = (d, id) => d.page.getByTestId(id);
const dlg = (d) => d.page.getByTestId('sl-tops-to-horizons');
const combo = (d, name) => d.page.getByRole('combobox', { name });
const resultRow = (d, name) => t(d, 't2h-results').locator(`tr:has(td:text-is("${name}"))`);

async function goTo(d, value) {
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(2500);
}

export default {
  id: 'seis-02',
  app: 'Seismolord',
  eyebrow: 'Seismolord · 2 of 3',
  title: 'The wells build *the framework*',
  subtitle: 'Ten horizons from six wells, the growth fault picked automatically, and the framework in 3D',
  outroTitle: 'Next: *from horizons to volumes*',
  outroSub: 'Attribute maps, depth and volumetrics · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(6000);
    // an earlier take's numbered framework and automatic fault
    await deleteHorizonsMatching(d, / \(\d+\)$/);
    await deleteFault(d, 'Auto-1');
    // start with nothing drawn over the seismic
    const ex = d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
    const names = await ex.locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) await setVisible(d, n, false);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await t(d, 'sl-goto').fill('1064'); await t(d, 'sl-goto-btn').click();
    await d.sleep(3000);
    // only the Section window
    const close3d = d.page.locator('button:has-text("3D") + button, [aria-label="Close 3D"]');
    if (await close3d.count()) await close3d.first().click().catch(() => {});
    await explorerRow(d, 'Ekene-9').scrollIntoViewIfNeeded();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The framework', chapterSub: 'From well tops to mapped horizons',
      say: 'In the first video we tracked one horizon from a single seed. Here the wells build the whole framework: ten horizons from six wells, the growth fault picked automatically, and the result in three D. We start by showing the wells.',
      sub: 'In the first video we tracked one horizon from a single seed. Here the wells build the whole framework: ten horizons from six wells, the growth fault picked automatically, and the result in 3D. We start by showing the wells.',
      do: async (d) => {
        for (const w of WELLS) await setVisible(d, w, true, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'open',
      say: 'Tops to Horizons takes every visible well with tops. Ekene one to four carry the well ties committed in the QI series. Ekene eight and nine use their checkshots.',
      sub: 'Tops to Horizons takes every visible well with tops. Ekene-1 to 4 carry the well ties committed in the QI series. Ekene-8 and 9 use their checkshots.',
      do: async (d) => {
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(1000);
        await d.click(d.page.getByRole('button', { name: 'Tops to horizons' }));
        await dlg(d).waitFor();
        await d.sleep(1200);
        const table = dlg(d).locator('table').first();
        await expectText(d, table, /Ekene-8\s*9\s*checkshots[\s\S]*Ekene-1\s*10\s*tie/, 'wells and their time-depth');
        await d.highlight(table);
      } },
    { id: 'tie',
      say: 'Tie and match ties every well to the seismic again and agrees one convention for the field: normal polarity and zero phase, from all six wells. Five ties are good, and Ekene eight is fair.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-match');
        await t(d, 't2h-board').waitFor({ timeout: 300000 });
        await d.click('t2h-step-wells');
        await d.sleep(800);
        await expectText(d, 't2h-convention', /normal polarity, 0° phase from 6 tied wells/, 'field convention');
        const table = dlg(d).locator('table').first();
        await expectText(d, table, /Ekene-8[\s\S]*fair: shift -2\.1 ms, phase 9°, r 0\.65/, 'Ekene-8 fair tie');
        await d.highlight('t2h-convention');
      } },
    { id: 'board', chapter: 'Every top on its event', chapterSub: 'Explained, and open to change',
      say: 'The review board shows the event each top was matched to at each well, how far it sits from the prediction, and a score. The top of the Ekene Sand is a peak at all six wells, within about five milliseconds. The Oboro tops reach only three wells, and the Akata only Ekene one. Any choice can be changed here.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-step-review');
        await d.sleep(1000);
        const row = t(d, 't2h-board').locator('tr:has(input[aria-label="Use Ekene Sand"])').first();
        await expectText(d, row, /Peak[\s\S]*0\.9 ms[\s\S]*2\.5 ms[\s\S]*5\.2 ms[\s\S]*-2\.0 ms[\s\S]*4\.2 ms[\s\S]*2\.0 ms/, 'Ekene Sand row');
        await d.highlight(row);
        await d.sleep(3500);
        const akata = t(d, 't2h-board').locator('tr:has(input[aria-label="Use Akata Formation"])').first();
        await akata.scrollIntoViewIfNeeded();
        await d.highlight(akata);
      } },
    { id: 'faults', chapter: 'The growth fault', chapterSub: 'Picked automatically, below the reservoir',
      say: 'Next, the faults. There are none yet, so we pick them automatically. The growth fault has its throw deep in the section and dies out above the reservoir, so the area of interest starts at sample three hundred and forty, about thirteen hundred and sixty milliseconds.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dlg(d).getByRole('button', { name: 'Next: faults' }));
        await d.sleep(1000);
        const s0 = dlg(d).getByLabel('Sample from (s0)');
        await s0.scrollIntoViewIfNeeded();
        await d.click(s0);
        await d.page.keyboard.press('Control+A');
        await d.page.keyboard.type('340', { delay: 90 });
        await d.sleep(400);
        const v = await s0.inputValue();
        if (v !== '340') throw new Error(`Sample from reads "${v}"`);
        await expectText(d, dlg(d).getByText(/^[0-9.]+ million samples$/), /^2\.4 million samples$/, 'area size');
        await d.highlight(s0.locator('..').locator('..'));
      } },
    { id: 'pick',
      say: 'The picker measures the data quality first: reflector coherence of zero point nine nine, clean data. It finds one fault, sixteen sticks long, striking twenty degrees east of grid north, along the inlines. We keep it, and it becomes a barrier for tracking.',
      sub: 'The picker measures the data quality first: reflector coherence of 0.99, clean data. It finds one fault, sixteen sticks long, striking 20° east of grid north, along the inlines. We keep it, and it becomes a barrier for tracking.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-detect');
        await t(d, 'sl-auto-faults-quality').waitFor({ timeout: 300000 });
        await expectText(d, 'sl-auto-faults-quality', /Reflector coherence 0\.99 \(clean\)/, 'data quality');
        const f = t(d, 'sl-auto-faults').getByText(/^Auto-1: confidence/);
        await expectText(d, f, /Auto-1: confidence 0\.40, 16 sticks, strike 20° from grid north/, 'the fault');
        await d.highlight(f);
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('sl-auto-faults-save');
        await d.sleep(3000);
      } },
    { id: 'track', chapter: 'Tracking the framework', chapterSub: 'Across the fault on the right throw',
      say: 'Now we track the framework. Every top is tracked from its wells, banded so no two horizons can cross, and stopped at the fault. Where a block has no well, the horizon is carried across the fault by the throw the other horizons measure.',
      do: async (d) => {
        await d.click(dlg(d).getByRole('button', { name: 'Next: track' }));
        await d.sleep(1000);
        await d.click('t2h-track');
      },
      wait: async (d) => {
        await t(d, 't2h-results').waitFor({ timeout: 900000 });
        await d.sleep(1500);
      },
      waitLabel: 'Seconds later' },
    { id: 'carried',
      say: 'All ten horizons cover the survey. Oboro Sand Base is carried across the fault by sixty milliseconds, and the Akata, deeper, by seventy seven: the throw of a growth fault grows with depth.',
      do: async (d) => {
        await t(d, 't2h-results').scrollIntoViewIfNeeded();
        await expectText(d, resultRow(d, 'Oboro Sand Base'), /6909 \(throw 60\.4 ms\)/, 'Oboro Sand Base jump');
        await expectText(d, resultRow(d, 'Akata Formation'), /Trough, 1 well1\d{4} \(99 %\)[\s\S]*6912 \(throw 76\.8 ms\)/, 'Akata jump');
        await d.highlight(resultRow(d, 'Oboro Sand Base'));
        await d.sleep(2500);
        await d.highlight(resultRow(d, 'Akata Formation'));
      } },
    { id: 'lowo',
      say: 'The leave one well out check tracks each horizon again without each well in turn, across the fault the same way, and measures the miss at the well left out. Every horizon predicts it to within a sample, even Oboro Sand, where Ekene eight is the only well east of the fault.',
      sub: 'The leave-one-well-out check tracks each horizon again without each well in turn, across the fault the same way, and measures the miss at the well left out. Every horizon predicts it to within a sample, even Oboro Sand, where Ekene-8 is the only well east of the fault.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, resultRow(d, 'Oboro Sand'), /0\.0 ms over 3\/3 wells/, 'Oboro Sand leave-one-out');
        await expectText(d, resultRow(d, 'Oboro Unconformity'), /0\.0 ms over 3\/3 wells/, 'Oboro Unconformity leave-one-out');
        await d.highlight(resultRow(d, 'Oboro Sand'));
      } },
    { id: 'accept',
      say: 'Accept saves the ten horizons, named after their tops. This project already holds an earlier set, so the new ones are numbered.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-accept');
      },
      wait: async (d) => {
        await dlg(d).getByText('Saved 10 horizons').waitFor({ timeout: 180000 });
        await d.sleep(1200);
        await d.page.keyboard.press('Escape');
        await d.sleep(1200);
      },
      waitLabel: 'Seconds later' },
    { id: 'section', chapter: 'At the fault', chapterSub: 'The deep horizons step down',
      say: 'On inline ten sixty four, in grey scale so the picks stand out, the four deep horizons step down across the fault, and the deeper they are, the bigger the step. The Ekene Sand above runs straight through: the fault dies out below the reservoir.',
      sub: 'On inline 1064, in grey scale so the picks stand out, the four deep horizons step down across the fault, and the deeper they are, the bigger the step. The Ekene Sand above runs straight through: the fault dies out below the reservoir.',
      do: async (d) => {
        await d.click(d.page.getByText('Home', { exact: true }).first());
        await d.sleep(800);
        for (const w of WELLS) await setVisible(d, w, false);
        // a saved framework is drawn whole: keep the deep horizons and the Ekene Sand
        const ex = d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
        const names = await ex.locator('div[role=button] span.truncate').allInnerTexts();
        const keep = new Set([...DEEP.map((n) => `${n} (2)`), 'Ekene Sand (2)']);
        for (const n of names) if (/ \(2\)$/.test(n) && !keep.has(n)) await setVisible(d, n, false);
        await setVisible(d, 'Auto-1', true, { onCamera: true });
        for (const n of DEEP) await setVisible(d, `${n} (2)`, true, { onCamera: true });
        await setVisible(d, 'Ekene Sand (2)', true, { onCamera: true });
        await goTo(d, 1064);
        await expectText(d, d.page.locator('text=/^Inline \\d+$/ >> visible=true'), /^Inline 1064$/, 'inline 1064');
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(1500);
        // the step, close up
        const c = d.page.locator('[data-testid="window-section"] canvas').first();
        const b = await c.boundingBox();
        const at = { x: b.x + b.width * 0.57, y: b.y + b.height * 0.70 };
        await d.moveTo(at);
        await d.page.mouse.dblclick(at.x, at.y);
        await d.sleep(2500);
      } },
    { id: 'threed', chapter: 'In 3D', chapterSub: 'Horizons, fault and wells together',
      say: 'In the three D window the framework comes together: the horizons as surfaces, the fault between the blocks, and the wells that built it.',
      sub: 'In the 3D window the framework comes together: the horizons as surfaces, the fault between the blocks, and the wells that built it.',
      do: async (d) => {
        for (const w of ['Ekene-1', 'Ekene-8', 'Ekene-9']) await setVisible(d, w, true);
        await setVisible(d, 'Ekene Sand (2)', false);
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(800);
        await d.click(d.page.getByText('3D', { exact: true }).last());
        await d.sleep(1500);
        await d.page.keyboard.press('Escape');
        await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
        // the deep surfaces without the slice planes in front of them
        await d.page.locator('[data-testid="window-3d"] button[title="3D layers"]').click();
        await d.sleep(600);
        const pop = d.page.locator('[data-radix-popper-content-wrapper]').last();
        for (const lab of ['Inline plane', 'Crossline plane', 'Time slice plane']) {
          const cb = pop.getByRole('checkbox', { name: lab });
          if ((await cb.count()) && (await cb.isChecked())) await cb.click();
        }
        await d.page.keyboard.press('Escape');
        await d.sleep(3000);
      } },
    { id: 'rotate',
      say: 'Turned toward the fault, the deep surfaces break along it, and the step at the edge of the survey grows downward, the way a growth fault should.',
      do: async (d) => {
        const c = d.page.locator('[data-testid="window-3d"] canvas').first();
        const b = await c.boundingBox();
        const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
        await d.moveTo({ x: cx, y: cy });
        await d.page.mouse.move(cx, cy); await d.page.mouse.down();
        for (let i = 1; i <= 40; i++) { await d.page.mouse.move(cx - i * 4, cy); await d.sleep(45); }
        await d.page.mouse.up();
        await d.sleep(600);
        await d.page.mouse.move(cx, cy);
        for (let i = 0; i < 3; i++) { await d.page.mouse.wheel(0, -240); await d.sleep(250); }
        await d.sleep(2500);
      } },
    { id: 'next', chapter: 'Ready for volumes', chapterSub: 'Maps, depth and volumes come next',
      say: 'That is the framework: every horizon tied to the wells, stopped at the fault and carried across it on the right throw, with its error measured. Next, from horizons to volumes.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
