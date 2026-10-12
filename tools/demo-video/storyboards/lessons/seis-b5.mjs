// Seismolord lesson B5: tracking QC (Ekene kit v4, EKENE3D-v4-full.sgy).
// The correlation-tracked top Ekene Sand of lesson B4 (rebuilt off camera:
// seed at Ekene-1, NCC 0.7, Track 3D) crosses the growth fault onto a deeper
// event in the footwall. The Map window shows it, the tracker confidence
// only partly flags it (Reject below 0.90 removes 869 picks and keeps
// 20,592), a polygon erase in the Map window removes the footwall, and the
// horizon's history keeps every version. Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, sectionPoint, clickAt, deleteHorizonsMatching, explorerItem, explorerRow,
  setVisible, FULL, RECORD_MS, xlFrac, closeWindow,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const H = 'Lesson Ekene correlation';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });
const mapCanvas = (d) => d.page.locator('[data-testid="window-map"] canvas').first();
const toolbox = (d) => t(d, 'sl-toolbox');
// a polygon west of the growth fault, in fractions of the map canvas at
// "fit survey" (checked against the dry-run frames)
const FOOTWALL = [[0.02, 0.02], [0.444, 0.02], [0.399, 0.19], [0.366, 0.459], [0.371, 0.675], [0.395, 0.891], [0.414, 0.998], [0.02, 0.998]];

async function goTo(d, v) { await t(d, 'sl-goto').fill(String(v)); await t(d, 'sl-goto-btn').click(); await d.sleep(1500); }

/** Off camera: the lesson B4 horizon, tracked again from the same seed. */
async function rebuild(d) {
  await deleteHorizonsMatching(d, /^Lesson Ekene correlation/);
  await combo(d, 'Orientation').selectOption({ label: 'Inline' });
  await goTo(d, 1027);
  await t(d, 'sl-ribbon-tab-interpretation').click(); await d.sleep(600);
  await combo(d, 'Event').selectOption({ label: 'Peak (+)' });
  await combo(d, 'Window').selectOption({ value: '3' });
  const seed = d.page.getByRole('button', { name: /^(Pick seed|Picking…)$/ }).first();
  if ((await seed.innerText()).includes('Pick seed')) await seed.click();
  const p = await at(d, 2051, 1289); await d.page.mouse.click(p.x, p.y); await d.sleep(800);
  await combo(d, 'Event').selectOption({ label: 'Correlation (NCC)' });
  await combo(d, 'Threshold').selectOption({ value: '0.7' });
  await d.page.getByRole('button', { name: 'Track 3D' }).click();
  await d.page.getByText('Horizon tracked').waitFor({ timeout: 300000 });
  if (await d.page.getByRole('button', { name: 'Picking…' }).count()) await d.page.getByRole('button', { name: 'Picking…' }).first().click();
  await combo(d, 'Event').selectOption({ label: 'Peak (+)' });
  await d.sleep(1500);
}

async function openMapTab(d) {
  if (await d.page.locator('button[title="Show Map"]').count()) { await d.click(d.page.locator('button[title="Show Map"]')); } else {
    await d.click(d.page.getByRole('button', { name: /Windows/ }));
    await d.sleep(600);
    await d.click(d.page.getByText('Map', { exact: true }).last());
    await d.sleep(600);
    await d.page.keyboard.press('Escape');
  }
  await mapCanvas(d).waitFor();
  await d.sleep(2000);
}

export default {
  id: 'lesson-seis-b5',
  ...seisLessonMeta(5, 'B', 'Tracking QC: *trust, then verify*', 'Reading a tracked horizon in the Map window, what tracker confidence can and cannot tell you, rejecting and erasing picks, and versions to go back to'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(H) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await d.page.locator('button[title="Tabs (one window at a time)"]').click().catch(() => {});
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await rebuild(d);
    await setVisible(d, H, true);
    // a colour and weight that read over red, white and blue at 100 %
    await explorerItem(d, H).click({ button: 'right' }); await d.sleep(500);
    await d.page.getByText('Settings…').click();
    const dlg = d.page.getByRole('dialog');
    await dlg.getByText('Interpretation color', { exact: false }).waitFor();
    await dlg.locator('button[aria-label^="Color #"]').nth(2).click();
    const weight = dlg.getByRole('combobox').first();
    const opts = await weight.locator('option').allInnerTexts();
    await weight.selectOption({ label: opts[opts.length - 1] });
    await d.sleep(600);
    await d.page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(async () => { await dlg.getByRole('button', { name: 'Close' }).last().click(); });
    await d.sleep(800);
    // a fresh page: the closed dialog can leave the page refusing clicks
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click();
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await setVisible(d, H, true);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await goTo(d, 1027);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 5', chapterSub: 'Module B · Horizons',
      say: 'A tracker can pick twenty thousand traces in seconds, and it can be wrong on most of them without any warning. This lesson checks the correlation-tracked horizon from the last lesson, finds what went wrong, and repairs it.',
      sub: 'A tracker can pick 20,000 traces in seconds, and it can be wrong on most of them without any warning. This lesson checks the correlation-tracked horizon from the last lesson, finds what went wrong, and repairs it.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 5', title: 'Tracking QC',
        body: '<ul><li>Read the horizon as a map</li><li>Tracker confidence</li><li>Reject, erase, save</li><li>Versions to go back to</li></ul>' }) },
    { id: 'map', chapter: 'Read it as a map', chapterSub: 'The Map window',
      say: 'The quickest check is a map. In the Map window the hanging wall looks right: the rollover closes in rings, contoured here at thirteen hundred milliseconds. West of the fault the map is striped and patchy. Real geology rarely looks like that.',
      sub: 'The quickest check is a map. In the Map window the hanging wall looks right: the rollover closes in rings, contoured here at 1300 ms. West of the fault the map is striped and patchy. Real geology rarely looks like that.',
      do: async (d) => {
        await d.hideSlide();
        await openMapTab(d);
        await d.select(d.page.locator('select[title^="Mapped layer"]'), { label: H });
        await d.sleep(2500);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.68, y: b.y + b.height * 0.5 }, { ms: 1200 });
        await d.sleep(1800);
        await d.moveTo({ x: b.x + b.width * 0.22, y: b.y + b.height * 0.35 }, { ms: 1500 });
        await d.moveTo({ x: b.x + b.width * 0.2, y: b.y + b.height * 0.7 }, { ms: 1500 });
      } },
    { id: 'confidence', chapter: 'Tracker confidence', chapterSub: 'The correlation of every pick',
      say: 'Each pick kept its correlation from tracking, and the map can show it. The hanging wall is close to one throughout. West of the fault the confidence is speckled, and the fault itself is a line of low values, where the tracker had least to go on.',
      do: async (d) => {
        await d.select(d.page.locator('select[title^="Mapped attribute"]'), { label: 'Tracker confidence' });
        await d.sleep(3500);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.5 }, { ms: 1000 });
        await d.sleep(1500);
        await d.moveTo({ x: b.x + b.width * 0.25, y: b.y + b.height * 0.5 }, { ms: 1400 });
        await d.sleep(1200);
        await d.moveTo({ x: b.x + b.width * 0.38, y: b.y + b.height * 0.55 }, { ms: 900 });
      } },
    { id: 'section', chapter: 'On the section', chapterSub: 'The wrong event',
      say: 'A section shows why. On inline ten twenty seven, through Ekene one, the horizon follows the top of the sand in the hanging wall. In the footwall the sand is thrown up by the fault: it is the strong event higher up. The tracker crossed the fault on a deeper reflection, and followed that instead.',
      sub: 'A section shows why. On inline 1027, through Ekene-1, the horizon follows the top of the sand in the hanging wall. In the footwall the sand is thrown up by the fault: it is the strong event higher up. The tracker crossed the fault on a deeper reflection, and followed that instead.',
      do: async (d) => {
        await d.click(d.page.locator('button[title="Show Section"]'));
        await d.sleep(1200);
        await combo(d, 'Orientation').selectOption({ label: 'Inline' });
        await d.type('sl-goto', '1027'); await d.click('sl-goto-btn'); await d.sleep(2000);
        await d.moveTo(await at(d, 2080, 1295), { ms: 1200 });
        await d.sleep(1500);
        await d.moveTo(await at(d, 1990, 1222), { ms: 1300 });
        await d.sleep(1500);
        await d.moveTo(await at(d, 1990, 1300), { ms: 900 });
      } },
    { id: 'snapshot', chapter: 'Versions', chapterSub: 'Keep a copy before editing',
      say: 'Before editing, keep a copy. New version takes a snapshot of the horizon as it is, so nothing done next is beyond recall.',
      do: async (d) => {
        await d.moveTo(explorerItem(d, H));
        await explorerItem(d, H).click({ button: 'right' });
        await d.sleep(700);
        await d.click(d.page.getByText('New version (snapshot)'));
        await d.sleep(2500);
        await d.highlight(explorerRow(d, H));
      } },
    { id: 'reject', chapter: 'Reject on confidence', chapterSub: 'What a threshold removes',
      say: 'In the interpretation toolbox, we reject every pick below nought point nine. It removes eight hundred and sixty nine picks and keeps twenty thousand five hundred and ninety two. Most of the footwall stays: neighbouring picks on the wrong reflection still look alike, so their correlation is high. On the map, a few holes open in the footwall and the rest stays. Confidence measures how similar neighbouring picks are. It cannot tell whether they are on the right reflection.',
      sub: 'In the interpretation toolbox, we reject every pick below 0.9. It removes 869 picks and keeps 20,592. Most of the footwall stays: neighbouring picks on the wrong reflection still look alike, so their correlation is high. On the map, a few holes open in the footwall and the rest stays. Confidence measures how similar neighbouring picks are. It cannot tell whether they are on the right reflection.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        if (!(await toolbox(d).isVisible().catch(() => false))) {
          const tab = d.page.getByRole('tab', { name: 'Toolbox' });
          if (await tab.count()) await d.click(tab.first()); else await d.click(d.page.getByRole('button', { name: 'Toolbox' }).first());
          await d.sleep(800);
          if (!(await toolbox(d).isVisible().catch(() => false))) await d.click(d.page.getByRole('button', { name: 'Toolbox' }).first());
        }
        await toolbox(d).waitFor();
        await d.select(toolbox(d).getByLabel('Horizon target'), { label: H });
        await d.sleep(600);
        await d.select(toolbox(d).getByLabel('Confidence threshold'), { label: 'below 0.90' });
        await d.click(toolbox(d).getByRole('button', { name: 'Reject', exact: true }));
        const toast = d.page.getByText('Low-confidence picks rejected').locator('..');
        await toast.waitFor({ timeout: 30000 });
        await expectText(d, toast, /869 picks below 0\.90 removed from Lesson Ekene correlation; 20592 kept\./, 'reject counts');
        await d.click(d.page.locator('button[title="Show Map"]'));
        await d.sleep(1200);
        await d.select(d.page.locator('select[title^="Mapped attribute"]'), { label: 'Structure' }).catch(() => {});
        await d.sleep(1500);
        const b = await mapCanvas(d).boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.2, y: b.y + b.height * 0.4 }, { ms: 1200 });
        await d.moveTo({ x: b.x + b.width * 0.25, y: b.y + b.height * 0.75 }, { ms: 1500 });
      } },
    { id: 'erase', chapter: 'Erase', chapterSub: 'A polygon on the map',
      say: 'The footwall has to go by hand. In the Map window, the eraser draws a polygon along the west side of the fault, and every pick inside it is removed.',
      do: async (d) => {
        await d.click(d.page.locator('button[title^="Erase the mapped horizon"]'));
        const b = await mapCanvas(d).boundingBox();
        const pts = FOOTWALL.map(([fx, fy]) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy }));
        for (let i = 0; i < pts.length; i++) {
          await d.moveTo(pts[i], { ms: 500 });
          if (i === pts.length - 1) await d.page.mouse.dblclick(pts[i].x, pts[i].y); else await d.page.mouse.click(pts[i].x, pts[i].y);
          await d.sleep(200);
        }
        await d.sleep(2000);
      } },
    { id: 'save',
      say: 'What is left is the hanging wall, picked on the right event. We save it. The footwall will be tracked from its own seed, with the fault as a barrier, in the next lesson.',
      do: async (d) => {
        await d.click(toolbox(d).getByRole('button', { name: /^Save$/ }).first());
        await d.sleep(3000);
        await expectText(d, explorerRow(d, H), /v\d+/, 'saved version');
        await d.highlight(explorerRow(d, H));
      } },
    { id: 'history', chapter: 'History', chapterSub: 'Every version kept',
      say: 'The history keeps every version. Any of them can be shown beside the current one, or restored as a new version. Nothing is lost by editing, so edit freely.',
      do: async (d) => {
        await d.unhighlight();
        await d.moveTo(explorerItem(d, H));
        await explorerItem(d, H).click({ button: 'right' });
        await d.sleep(700);
        await d.page.getByText(/^History \(/).hover();
        await d.sleep(900);
        await d.highlight(d.page.getByText('Restore v1 as new version'));
        await d.sleep(2500);
        await d.page.keyboard.press('Escape');
        await d.page.keyboard.press('Escape');
      } },
    { id: 'next',
      say: 'Next lesson, tops to horizons: a framework of horizons from the well tops, with the faults as barriers, and the misties left when a well is left out.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'Tops to horizons', body: '<ul><li>A framework from the wells</li><li>Faults as barriers</li><li>Leave-one-well-out misties</li></ul>' });
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
      } },
  ],
};
