// Seismolord, video 2: the wells build the framework (Ekene kit v4).
// Tops to Horizons on EKENE3D-v4-full.sgy: six wells with tops, the field
// tie convention, every top matched to its event, the listric growth fault
// and the buried Ekene East fault picked automatically over the whole
// survey (the picker follows a listric fault down to its sole since
// engines #349), the framework tracked with the faults as barriers and
// carried into the footwall, which no well reaches, the leave-one-well-out
// check, then the framework on a dip line and in the 3D window, both in
// full view. Every well is in the hanging wall. Accept saves the ten
// horizons under the names of their tops; demo 3 builds on "Ekene Sand"
// and "Ekene Sand Base". `expectText` steps stop the take if the screen
// disagrees with the narration.
import {
  login, expectText, openSeismolord, explorerRow, setVisible, deleteHorizonsMatching, deleteFault, closeWindow,
  fullscreenBtn, FULL, RECORD_MS, xlFrac, sectionPoint,
} from './seis-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const TOPS = ['Seabed', 'Benin Formation', 'Agbada Formation', 'Ogbia Shale', 'Ekene Sand', 'Ekene Sand Base',
  'Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation'];
const SHOWN = ['Agbada Formation', 'Ekene Sand', 'Oboro Unconformity', 'Oboro Sand', 'Akata Formation'];
const t = (d, id) => d.page.getByTestId(id);
const dlg = (d) => d.page.getByTestId('sl-tops-to-horizons');
const combo = (d, name) => d.page.getByRole('combobox', { name });
const resultRow = (d, name) => t(d, 't2h-results').locator(`tr:has(td:text-is("${name}"))`);
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const faultRow = (d, name) => t(d, 'sl-auto-faults').locator(`label:has-text("${name}:")`);

async function goTo(d, value) {
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(1600);
}

/** A slow drag on the 3D canvas; the drawn cursor glides along with it. */
async function drag3d(d, dx, dy, steps = 16) {
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
  id: 'seis-02',
  app: 'Seismolord',
  eyebrow: 'Seismolord · 2 of 3',
  title: 'The wells build *the framework*',
  subtitle: 'Ten horizons from six wells, the listric growth fault picked automatically, and the framework in 3D',
  outroTitle: 'Next: *from horizons to volumes*',
  outroSub: 'Variance, depth and the trap volume · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(6000);
    // an earlier take's framework and automatic faults (v4 volume only)
    const tops = new RegExp(`^(${TOPS.join('|')})( \\(\\d+\\))?$`);
    await deleteHorizonsMatching(d, tops);
    const autos = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).filter((n) => /^Auto-\d+$/.test(n));
    for (const n of autos) await deleteFault(d, n);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    // start with nothing drawn over the seismic
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) await setVisible(d, n, false);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await t(d, 'sl-goto').fill('1064'); await t(d, 'sl-goto-btn').click();
    await d.sleep(3000);
    await explorerRow(d, 'Ekene-9').scrollIntoViewIfNeeded();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The framework', chapterSub: 'From well tops to mapped horizons',
      say: 'In the first video we tracked one horizon from a single seed, and it stopped at the growth fault. Here the wells build the whole framework: ten horizons from six wells, the faults picked automatically, and the result in three D. We start by showing the wells.',
      sub: 'In the first video we tracked one horizon from a single seed, and it stopped at the growth fault. Here the wells build the whole framework: ten horizons from six wells, the faults picked automatically, and the result in 3D. We start by showing the wells.',
      do: async (d) => {
        for (const w of WELLS) await setVisible(d, w, true, { onCamera: true });
        await d.sleep(1200);
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
        await expectText(d, table, /Ekene-9\s*9\s*checkshots[\s\S]*Ekene-8\s*9\s*checkshots[\s\S]*Ekene-1\s*10\s*tie/, 'wells and their time-depth');
        await d.highlight(table);
      } },
    { id: 'tie',
      say: 'Tie and match ties every well to the seismic again and agrees one convention for the field: normal polarity and zero phase, from all six wells. Four ties are good, and Ekene eight and nine are fair.',
      sub: 'Tie and match ties every well to the seismic again and agrees one convention for the field: normal polarity and zero phase, from all six wells. Four ties are good, and Ekene-8 and 9 are fair.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-match');
        await t(d, 't2h-board').waitFor({ timeout: 300000 });
        await d.click('t2h-step-wells');
        await d.sleep(800);
        await expectText(d, 't2h-convention', /normal polarity, 0° phase from 6 tied wells/, 'field convention');
        const table = dlg(d).locator('table').first();
        await expectText(d, table, /Ekene-9[^\n]*fair[\s\S]*Ekene-8[^\n]*fair[\s\S]*Ekene-1[^\n]*good[\s\S]*Ekene-4[^\n]*good[\s\S]*Ekene-3[^\n]*good[\s\S]*Ekene-2[^\n]*good/, 'four good ties, two fair');
        await d.highlight('t2h-convention');
      } },
    { id: 'board', chapter: 'Every top on its event', chapterSub: 'Explained, and open to change',
      say: 'The review board shows the event each top was matched to at each well, how far it sits from the prediction, and a score. The top of the Ekene Sand is a peak at all six wells, within six milliseconds. The Oboro tops reach only three wells, and the Akata only Ekene one. Any choice can be changed here.',
      sub: 'The review board shows the event each top was matched to at each well, how far it sits from the prediction, and a score. The top of the Ekene Sand is a peak at all six wells, within 6 ms. The Oboro tops reach only three wells, and the Akata only Ekene-1. Any choice can be changed here.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-step-review');
        await d.sleep(1000);
        const row = t(d, 't2h-board').locator('tr:has(input[aria-label="Use Ekene Sand"])').first();
        await expectText(d, row, /Peak[\s\S]*-0\.7 ms[\s\S]*1\.4 ms[\s\S]*5\.2 ms[\s\S]*-2\.0 ms[\s\S]*5\.5 ms[\s\S]*1\.8 ms/, 'Ekene Sand row');
        await d.highlight(row);
        await d.sleep(3500);
        const akata = t(d, 't2h-board').locator('tr:has(input[aria-label="Use Akata Formation"])').first();
        await akata.scrollIntoViewIfNeeded();
        await d.highlight(akata);
      } },
    { id: 'faults', chapter: 'The faults', chapterSub: 'Picked automatically over the whole survey',
      say: 'Next, the faults. There are none yet, so we pick them automatically, over the whole survey: every inline and crossline, from the top of the record to the bottom, eighteen point eight million samples. A fault shows only where it breaks a reflector, so we set the sensitivity to high.',
      sub: 'Next, the faults. There are none yet, so we pick them automatically, over the whole survey: every inline and crossline, from the top of the record to the bottom, 18.8 million samples. A fault shows only where it breaks a reflector, so we set the sensitivity to high.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dlg(d).getByRole('button', { name: 'Next: faults' }));
        await d.sleep(1000);
        const set = async (k, v) => {
          const i = dlg(d).locator(`input[aria-label$="(${k})"]`);
          await i.scrollIntoViewIfNeeded();
          await d.click(i);
          await d.page.keyboard.press('Control+A');
          await d.page.keyboard.type(String(v), { delay: 70 });
          await d.sleep(250);
        };
        await set('il0', 0); await set('il1', 127); await set('xl0', 0); await set('xl1', 167); await set('s0', 0); await set('s1', 875);
        await expectText(d, dlg(d).getByText(/^[0-9.]+ million samples$/), /^18\.8 million samples$/, 'area size');
        await d.select(dlg(d).getByLabel('Sensitivity'), { value: 'high' });
        await d.highlight(dlg(d).getByLabel('Sensitivity'));
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('t2h-detect');
      },
      wait: async (d) => {
        await t(d, 'sl-auto-faults-quality').waitFor({ timeout: 600000 });
        await d.sleep(800);
      },
      waitLabel: 'A minute later' },
    { id: 'pick',
      say: 'Auto one is the growth fault, sixteen sticks long and striking eighteen degrees east of grid north. Auto two is Ekene East, the buried fault below the reservoir. The smaller faults over the crest we leave for now. The two we keep become barriers for tracking.',
      sub: 'Auto-1 is the growth fault, sixteen sticks long and striking 18° east of grid north. Auto-2 is Ekene East, the buried fault below the reservoir. The smaller faults over the crest we leave for now. The two we keep become barriers for tracking.',
      do: async (d) => {
        await expectText(d, faultRow(d, 'Auto-1'), /Auto-1: confidence 0\.\d\d, 16 sticks, strike 18° from grid north/, 'the growth fault');
        await expectText(d, faultRow(d, 'Auto-2'), /Auto-2: confidence 0\.\d\d, 16 sticks, strike/, 'Ekene East');
        await d.highlight(faultRow(d, 'Auto-1'));
        await d.sleep(2200);
        await d.highlight(faultRow(d, 'Auto-2'));
        await d.sleep(2000);
        await d.unhighlight();
        const rows = t(d, 'sl-auto-faults').locator('label:has(input[type=checkbox])');
        for (let i = 0; i < await rows.count(); i++) {
          const r = rows.nth(i);
          if (/^Auto-[12]:/.test((await r.innerText()).trim())) continue;
          const cb = r.locator('input[type=checkbox]');
          if (await cb.isChecked()) await d.click(cb);
        }
        await d.click('sl-auto-faults-save');
        await d.sleep(2500);
      } },
    { id: 'track', chapter: 'Tracking the framework', chapterSub: 'Stopped at the faults, carried across them',
      say: 'Now we track the framework. Every top is tracked from its wells, banded so no two horizons can cross, and stopped at the faults. Every well is in the hanging wall, so the footwall is reached by carrying each horizon across the fault by the throw the seismic measures.',
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
      say: 'From the Benin down to the base of the Ekene Sand, every horizon is carried into the footwall, which no well reaches. The throw grows with depth: thirteen point two milliseconds at the Benin, fifty nine point seven at the Ekene Sand. The Oboro and Akata horizons stay in the hanging wall. Their growth packages thicken into the fault, the sequence no longer matches across it, so Seismolord leaves that footwall empty.',
      sub: 'From the Benin down to the base of the Ekene Sand, every horizon is carried into the footwall, which no well reaches. The throw grows with depth: 13.2 ms at the Benin, 59.7 ms at the Ekene Sand. The Oboro and Akata horizons stay in the hanging wall. Their growth packages thicken into the fault, the sequence no longer matches across it, so Seismolord leaves that footwall empty.',
      do: async (d) => {
        await t(d, 't2h-results').scrollIntoViewIfNeeded();
        await expectText(d, resultRow(d, 'Benin Formation'), /\(99 %\)[\s\S]*\(throw 13\.2 ms\)/, 'Benin carried');
        await expectText(d, resultRow(d, 'Ekene Sand'), /\(99 %\)[\s\S]*\(throw 59\.7 ms\)/, 'Ekene Sand carried');
        await expectText(d, resultRow(d, 'Oboro Sand'), /\(60 %\)/, 'Oboro Sand in the hanging wall');
        await d.highlight(resultRow(d, 'Benin Formation'));
        await d.sleep(3800);
        await d.highlight(resultRow(d, 'Ekene Sand'));
        await d.sleep(3500);
        await d.highlight(resultRow(d, 'Oboro Sand'));
      } },
    { id: 'lowo',
      say: 'The leave one well out check tracks each horizon again without each well in turn, across the fault the same way, and measures the miss at the well left out. At the Ekene Sand the miss is zero at all six wells.',
      sub: 'The leave-one-well-out check tracks each horizon again without each well in turn, across the fault the same way, and measures the miss at the well left out. At the Ekene Sand the miss is zero at all six wells.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, resultRow(d, 'Ekene Sand'), /0\.0 ms over 6\/6 wells/, 'Ekene Sand leave-one-out');
        await d.highlight(resultRow(d, 'Ekene Sand'));
      } },
    { id: 'accept',
      say: 'Accept saves the ten horizons, named after their tops.',
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
    { id: 'section', chapter: 'At the fault', chapterSub: 'A dip line in full view',
      say: 'On inline ten eighty, in grey: the growth fault is steep near the top and flattens with depth, and the hanging wall rolls over into it. The Ekene Sand steps down across the fault. Ekene East, on the right, cuts only the beds below the reservoir.',
      sub: 'On inline 1080, in grey: the growth fault is steep near the top and flattens with depth, and the hanging wall rolls over into it. The Ekene Sand steps down across the fault. Ekene East, on the right, cuts only the beds below the reservoir.',
      do: async (d) => {
        await d.click(d.page.getByText('Home', { exact: true }).first());
        await d.sleep(800);
        for (const w of WELLS) await setVisible(d, w, false);
        // a saved framework is drawn whole: keep a readable set
        for (const n of TOPS) if (!SHOWN.includes(n)) await setVisible(d, n, false);
        await setVisible(d, 'Auto-1', true, { onCamera: true });
        await setVisible(d, 'Auto-2', true, { onCamera: true });
        await goTo(d, 1080);
        await expectText(d, d.page.locator('text=/^Inline \\d+$/ >> visible=true'), /^Inline 1080$/, 'inline 1080');
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(800);
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(2000);
        await d.moveTo(await at(d, 2003, 250));
        await d.sleep(600);
        await d.moveTo(await at(d, 2012, 1000), { ms: 1400 });
        await d.moveTo(await at(d, 2031, 1850), { ms: 1400 });
        await d.moveTo(await at(d, 2050, 2150), { ms: 900 });
        await d.sleep(400);
        await d.moveTo(await at(d, 2035, 1330), { ms: 1100 });
        await d.moveTo(await at(d, 2090, 1310), { ms: 1300 });
        await d.sleep(400);
        await d.moveTo(await at(d, 1995, 1250), { ms: 1200 });
        await d.sleep(800);
        await d.moveTo(await at(d, 2071, 1700), { ms: 1300 });
      } },
    { id: 'threed', chapter: 'In 3D', chapterSub: 'Horizons, faults and wells together',
      say: 'In the three D window, in full view, the framework comes together: the horizons as surfaces, the two faults, and the wells that built it.',
      sub: 'In the 3D window, in full view, the framework comes together: the horizons as surfaces, the two faults, and the wells that built it.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section')); // back from full view
        await d.sleep(1200);
        for (const w of ['Ekene-1', 'Ekene-8', 'Ekene-9']) await setVisible(d, w, true);
        await setVisible(d, 'Agbada Formation', false);
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(800);
        await d.click(d.page.getByText('3D', { exact: true }).last());
        await d.sleep(1500);
        await d.page.keyboard.press('Escape');
        await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
        await d.sleep(2500);
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(1500);
      } },
    { id: 'rotate',
      say: 'Turned toward the fault, the growth fault curves down under the rollover, and the deep horizons end against it.',
      do: async (d) => {
        await drag3d(d, 120, 0, 16);
        await d.sleep(400);
        await drag3d(d, 120, 0, 16);
        await d.sleep(1500);
      } },
    { id: 'next', chapter: 'Ready for volumes', chapterSub: 'Variance, depth and the trap volume come next',
      say: 'That is the framework: every horizon tied to the wells, stopped at the faults and carried across them, with its error measured. Next, from horizons to volumes.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(2500);
      } },
  ],
};
