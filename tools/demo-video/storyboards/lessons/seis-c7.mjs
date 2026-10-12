// Seismolord lesson C7: fault sticks by hand (Ekene kit v4, EKENE3D-v4-full.sgy).
// Three sticks on the listric Ekene growth fault, on inlines 1032, 1048 and
// 1064, placed at the kit's answer key (04-seismic/truth/ekene-fault-sticks.csv,
// every sixth point down to 2,270 ms), saved as "Lesson growth fault" and
// shown in the 3D window. The demos' Auto-1 and Auto-2 are not touched.
// Figures from the 2026-10-12 probe.
import fs from 'node:fs';
import path from 'node:path';
import {
  login, expectText, openSeismolord, sectionPoint, clickAt, deleteFault, explorerRow, setVisible,
  KIT, FULL, RECORD_MS, xlFrac, closeWindow, fullscreenBtn,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const FAULT = 'Lesson growth fault';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');

const truth = fs.readFileSync(path.join(KIT, '04-seismic', 'truth', 'ekene-fault-sticks.csv'), 'utf8')
  .trim().split('\n').slice(1).map((l) => l.split(','));
/** The answer key's stick on an inline: every sixth point, above 2,300 ms. */
const stickOn = (il) => truth.filter((r) => r[0] === 'Ekene Growth Fault' && Number(r[2]) === il)
  .map((r) => ({ xl: Number(r[3]), ms: Number(r[7]) })).filter((p) => p.ms < 2300).filter((_, i) => i % 6 === 0);

async function goTo(d, v, onCamera = true) {
  await d.page.getByText('Home', { exact: true }).first().click();
  await d.sleep(300);
  if (onCamera) { await d.type('sl-goto', String(v)); await d.click('sl-goto-btn'); } else {
    await t(d, 'sl-goto').fill(String(v)); await t(d, 'sl-goto-btn').click();
  }
  await d.sleep(1600);
  await d.page.getByTestId('sl-ribbon-tab-interpretation').click();
  await d.sleep(400);
}

async function drawStick(d, il) {
  const pick = d.page.getByRole('button', { name: /^(Pick fault|Picking…)$/ }).last();
  if ((await pick.innerText()).includes('Pick fault')) await d.click(pick);
  for (const p of stickOn(il)) {
    await clickAt(d, await sectionPoint(d, { frac: xlFrac(p.xl), ms: p.ms, recordMs: RECORD_MS }));
    await d.sleep(150);
  }
  await d.click(d.page.getByRole('button', { name: 'End stick' }));
  await d.sleep(500);
}

export default {
  id: 'lesson-seis-c7',
  ...seisLessonMeta(7, 'C', 'Fault sticks *by hand*', 'Seeing a fault in the seismic, picking it as sticks on a few lines, and the fault surface they make in 3D'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(FAULT) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await deleteFault(d, FAULT);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await goTo(d, 1032, false);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 7', chapterSub: 'Module C · Faults',
      say: 'Faults break the reflectors, offset the reservoir, and decide where horizons can be tracked and where fluids can go. This lesson picks the Ekene growth fault by hand, as sticks on a few lines, and looks at the surface they make.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module C · Lesson 7', title: 'Fault sticks by hand',
        body: '<ul><li>Seeing the fault</li><li>Sticks on a few lines</li><li>Saving the fault</li><li>The fault surface in 3D</li></ul>' }) },
    { id: 'see', chapter: 'Seeing the fault', chapterSub: 'Read the breaks',
      say: 'Faults read best in grey. On inline ten thirty two the growth fault is the line where every reflector breaks: steep near the top, flattening with depth into the Akata shale. That curve is what makes it listric.',
      sub: 'Faults read best in grey. On inline 1032 the growth fault is the line where every reflector breaks: steep near the top, flattening with depth into the Akata shale. That curve is what makes it listric.',
      do: async (d) => {
        await d.hideSlide();
        await d.page.getByText('Home', { exact: true }).first().click();
        await d.sleep(400);
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(1200);
        const pts = stickOn(1032);
        await d.moveTo(await sectionPoint(d, { frac: xlFrac(pts[0].xl), ms: pts[0].ms + 40, recordMs: RECORD_MS }));
        for (const p of pts.slice(2)) await d.moveTo(await sectionPoint(d, { frac: xlFrac(p.xl) + 0.01, ms: p.ms, recordMs: RECORD_MS }), { ms: 650 });
        await d.page.getByTestId('sl-ribbon-tab-interpretation').click();
        await d.sleep(400);
      } },
    { id: 'stick1', chapter: 'A stick', chapterSub: 'Points down the fault on one line',
      say: 'Pick fault, then click down the fault on the section. Each click is a point; together they make a stick. Follow the break itself, where the reflectors end, from the top of the fault to where it soles out. End stick finishes it.',
      do: async (d) => {
        await drawStick(d, 1032);
      } },
    { id: 'more', chapter: 'More lines', chapterSub: 'Sticks every few lines',
      say: 'A fault needs sticks on several lines. Sixteen lines further on, inline ten forty eight, and the same again on ten sixty four. Space the sticks closer where the fault bends or changes, wider where it is regular.',
      sub: 'A fault needs sticks on several lines. Sixteen lines further on, inline 1048, and the same again on 1064. Space the sticks closer where the fault bends or changes, wider where it is regular.',
      do: async (d) => {
        await goTo(d, 1048);
        await drawStick(d, 1048);
        await goTo(d, 1064);
        await drawStick(d, 1064);
      } },
    { id: 'save', chapter: 'Save the fault', chapterSub: 'Named, and kept with the volume',
      say: 'Save fault asks for a name. Lesson growth fault: three sticks, saved with the volume and listed in the explorer.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Save fault/ }));
        const toast = d.page.getByText('Fault saved').locator('..');
        await toast.waitFor({ timeout: 30000 });
        await expectText(d, toast, /Lesson growth fault: 3 stick\(s\)\./, 'fault saved');
        await d.highlight(explorerRow(d, FAULT));
        await d.sleep(2500);
        await d.unhighlight();
        if (await d.page.getByRole('button', { name: 'Picking…' }).count()) await d.click(d.page.getByRole('button', { name: 'Picking…' }).last());
      } },
    { id: 'threed', chapter: 'In 3D', chapterSub: 'A surface between the sticks',
      say: 'In the three D window the sticks are joined into a surface. Seen along strike, it curves from steep at the top to nearly flat at its base: the shape the rollover trap is built against.',
      sub: 'In the 3D window the sticks are joined into a surface. Seen along strike, it curves from steep at the top to nearly flat at its base: the shape the rollover trap is built against.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Windows/ }));
        await d.sleep(700);
        await d.click(d.page.getByText('3D', { exact: true }).last());
        await d.sleep(900);
        await d.page.keyboard.press('Escape');
        const c = d.page.locator('[data-testid="window-3d"] canvas').first();
        await c.waitFor();
        await d.sleep(2500);
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(1500);
        const b = await c.boundingBox();
        const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
        await d.moveTo({ x: cx, y: cy });
        await d.page.mouse.move(cx, cy); await d.page.mouse.down();
        for (let i = 1; i <= 24; i++) { await d.page.mouse.move(cx - 6 * i, cy + 1.5 * i); await d.sleep(45); }
        await d.page.mouse.up();
        await d.sleep(1500);
      } },
    { id: 'edit', chapter: 'Editing', chapterSub: 'The fault tools',
      say: 'Every point stays editable. The toolbox can extend or shorten a stick, move or delete a point, trim the top or the bottom, and add sticks later on other lines. Next lesson, the computer proposes the sticks instead.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(1000);
        await d.click(d.page.locator('button[title="Close 3D"]'));
        await d.sleep(800);
        const tab = d.page.getByRole('tab', { name: 'Toolbox' });
        if (await tab.count()) await d.click(tab.first());
        await d.sleep(800);
        const fp = t(d, 'sl-toolbox').getByText('Fault picking', { exact: false }).first();
        await fp.scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.highlight(fp.locator('..'));
      } },
    { id: 'next',
      say: 'Next lesson, automatic fault detection: variance, fault likelihood, and the area of interest.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Automatic fault detection', body: '<ul><li>Variance</li><li>Fault likelihood</li><li>The area of interest</li></ul>' });
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
        await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' }).catch(() => {});
      } },
  ],
};
