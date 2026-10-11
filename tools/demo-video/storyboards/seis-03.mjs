// Seismolord, video 3: from horizons to volumes (Ekene kit v3).
// The amplitude map of the Ekene Sand, a variance volume that finds the
// growth fault below the reservoir, the velocity model from the stacking
// velocities calibrated to the six wells, the depth surfaces published to the
// registry, and ReservoirCalc Pro: the volume inside the area the six
// development wells prove, down to the 5,036 ft TVDSS contact.
// The structure keeps rising to the west edge of the survey, so the full trap
// does not close inside this 3D; the narration says so, and "Trap only" stays
// unticked. Figures from the 2026-10-11 dry run; `expectText` steps stop the
// take if the screen disagrees with the narration.
import {
  login, expectText, openSeismolord, explorerRow, setVisible, deleteSurface, deleteVolumesStarting, FULL,
} from './seis-common.mjs';

const RMS_TABLE = '47 1500\n331 1975\n926 2458\n1041 2456\n1289 2388\n1311 2397\n1517 2352\n1572 2341\n1625 2347\n1782 2329';
const LAYERS = ['Benin Formation (2)', 'Agbada Formation (2)', 'Ogbia Shale (2)', 'Ekene Sand (2)', 'Ekene Sand Base (2)',
  'Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation'];
const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const TOP = 'Ekene Sand (2) (depth ft)';
const BASE = 'Ekene Sand Base (2) (depth ft)';
const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';
// the six development wells, Ekene-1 to 6 (UTM, EPSG:32632); Ekene-6 lies inside
const WELL_HULL = [[401000, 521000], [402200, 521150], [402600, 522500], [401400, 522300], [400600, 521900]];

const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog').last();
const combo = (d, name) => d.page.getByRole('combobox', { name });
const mapSel = (d, i) => d.page.locator('[data-testid="window-map"] select').nth(i);
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const layerSel = (d) => dialog(d).locator('select:has(option:text-is("down to horizon…"))');

async function goTo(d, value) {
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(2500);
}

/** Off camera: a layer cake on the nine framework horizons, every V0 2000 m/s. */
async function resetVelocity(d) {
  await d.page.getByTestId('sl-ribbon-tab-interpretation').click();
  await d.page.getByRole('button', { name: /Velocity model/ }).click();
  await d.sleep(1500);
  await dialog(d).locator('select').first().selectOption('layercake');
  await d.sleep(500);
  while (await layerSel(d).count() > LAYERS.length) { await dialog(d).locator('button[title="Remove this layer"]').first().click(); await d.sleep(150); }
  while (await layerSel(d).count() < LAYERS.length) { await dialog(d).getByRole('button', { name: 'Add layer' }).click(); await d.sleep(150); }
  for (let i = 0; i < LAYERS.length; i++) await layerSel(d).nth(i).selectOption({ label: LAYERS[i] });
  const v0s = dialog(d).locator('input[placeholder="m/s at layer top"]');
  for (let i = 0; i < await v0s.count(); i++) await v0s.nth(i).fill('2000');
  await dialog(d).getByRole('button', { name: /Save to volume/ }).click();
  await d.sleep(2500);
  await d.page.keyboard.press('Escape');
  await d.sleep(800);
}

/** World coordinates to page pixels on the RCP 2D map (its canvas carries the transform). */
async function mapToScreen(d) {
  const cv = t(d, 'rcp-map-canvas');
  const a = await cv.evaluate((e) => ({ scale: +e.dataset.scale, cx: +e.dataset.cx, cy: +e.dataset.cy, vw: +e.dataset.vw, vh: +e.dataset.vh }));
  const b = await cv.boundingBox();
  return ([x, y]) => ({ x: b.x + a.vw / 2 + (x - a.cx) * a.scale, y: b.y + a.vh / 2 - (y - a.cy) * a.scale });
}

/** Make surface for one horizon in depth (ft), fault-aware, then Publish. */
async function publishSurface(d, hz, nm, { onCamera }) {
  const click = (l) => (onCamera ? d.click(l) : l.click());
  const pick = (l, v) => (onCamera ? d.select(l, v) : l.selectOption(v));
  await click(d.page.getByRole('button', { name: 'Make surface' }));
  await dialog(d).waitFor();
  const sels = dialog(d).locator('select');
  await pick(sels.nth(0), { label: hz });
  await pick(sels.nth(1), { label: 'Depth (ft)' });
  await d.sleep(400);
  await expectText(d, dialog(d), /Fault-aware \(1 fault\)/, 'fault-aware gridding');
  await click(dialog(d).getByRole('button', { name: /Publish to the registry/ }));
}

/** ReservoirCalc Pro: import one registry surface through the Import dialog. */
async function importRcpSurface(d, nm, onCamera) {
  const click = (l) => (onCamera ? d.click(l) : l.click());
  await click(t(d, 'rcp-import-open'));
  await dialog(d).waitFor();
  const use = dialog(d).getByText(nm, { exact: true }).first().locator('xpath=ancestor::*[.//button[normalize-space()="Use"]][1]').getByRole('button', { name: 'Use' });
  await click(use);
  await d.sleep(600);
  await click(dialog(d).getByRole('button', { name: 'Import Surface' }));
  await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
  await d.sleep(600);
}

const rcpCard = (d, nm) => d.page.getByText(nm, { exact: true }).first().locator('xpath=ancestor::*[.//button[contains(normalize-space(),"Set Top")]][1]');

export default {
  id: 'seis-03',
  app: 'Seismolord',
  eyebrow: 'Seismolord · 3 of 3',
  title: 'From horizons to *volumes*',
  subtitle: 'An amplitude map, a variance volume, depth from a calibrated velocity model, and the volume in ReservoirCalc Pro',
  outroTitle: 'Seismic interpretation *with Petrolord*',
  outroSub: 'Seismolord and ReservoirCalc Pro · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(6000);
    // an earlier take's variance volume and published surfaces
    await deleteVolumesStarting(d, `${FULL} [Variance`);
    await combo(d, 'Active volume').selectOption({ label: FULL }).catch(() => {});
    await d.sleep(3000);
    await deleteSurface(d, TOP);
    await deleteSurface(d, BASE);
    await resetVelocity(d);
    // nothing drawn over the seismic but the Ekene Sand
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) await setVisible(d, n, false);
    await setVisible(d, 'Ekene Sand (2)', true);
    for (const w of WELLS) await setVisible(d, w, true);
    await d.page.getByText('Home', { exact: true }).first().click();
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await t(d, 'sl-goto').fill('1064'); await t(d, 'sl-goto-btn').click();
    await d.sleep(2500);
    // the Map window, in time, showing structure
    await d.page.getByRole('button', { name: /Windows/ }).click();
    await d.sleep(600);
    await d.page.getByText('Map', { exact: true }).last().click();
    await d.sleep(1200);
    await d.page.keyboard.press('Escape');
    await d.sleep(4000);
    await mapSel(d, 2).selectOption({ label: 'Structure' });
    await mapSel(d, 4).selectOption({ label: 'TWT ms' });
    await mapSel(d, 3).selectOption({ label: 'Spectrum' });
    await d.sleep(2500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Horizons to volumes', chapterSub: 'Maps, depth and a volume from the framework',
      say: 'The framework becomes maps and a volume. This is the top of the Ekene Sand in two way time: shallowest in the blue, and still rising toward the west edge of the survey.',
      sub: 'The framework becomes maps and a volume. This is the top of the Ekene Sand in two-way time: shallowest in the blue, and still rising toward the west edge of the survey.',
      do: async (d) => {
        await expectText(d, mapSel(d, 0).locator('option:checked'), /Ekene Sand \(2\)/, 'mapped horizon');
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.55 });
        await d.sleep(2500);
        await d.moveTo({ x: b.x + b.width * 0.06, y: b.y + b.height * 0.1 });
        await d.sleep(1500);
      } },
    { id: 'amplitude', chapter: 'The amplitude map', chapterSub: 'The oil leg dims the top of the sand',
      say: 'At the pick, the amplitude is dimmer over the crest, in a ring that follows the structure: the oil leg softens the sand.',
      do: async (d) => {
        await d.select(mapSel(d, 2), { label: 'Amplitude' });
        await d.sleep(3500);
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.38, y: b.y + b.height * 0.62 });
        await d.sleep(2000);
      } },
    { id: 'variance', chapter: 'A variance volume', chapterSub: 'Edges in the seismic, computed in the browser',
      say: 'A variance volume, computed in the browser, lights up faults and edges.',
      do: async (d) => {
        await d.select(mapSel(d, 2), { label: 'Structure' });
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: /Attribute volume/ }));
        await dialog(d).waitFor();
        await d.select(dialog(d).locator('select').first(), { label: 'Variance (discontinuity)' });
        await d.sleep(800);
        const local = dialog(d).getByRole('radio', { name: /In this browser/ });
        if (!(await local.isChecked())) await d.click(local);
        await d.click(dialog(d).getByRole('button', { name: 'Compute', exact: true }));
        await dialog(d).getByText(/Computing/).waitFor({ timeout: 60000 });
      },
      wait: async (d) => {
        await ex(d).locator('div[role=button]').filter({ hasText: `${FULL} [Variance` }).first().waitFor({ timeout: 600000 });
        await d.sleep(1500);
        await d.page.keyboard.press('Escape');
        await d.sleep(1000);
      },
      waitLabel: 'A minute later' },
    { id: 'fault',
      say: 'At seventeen hundred milliseconds the growth fault is a sharp line. At the Ekene Sand, twelve hundred and ninety two milliseconds, there is none: the reservoir is one block.',
      sub: 'At 1700 ms the growth fault is a sharp line. At the Ekene Sand, 1292 ms, there is none: the reservoir is one block.',
      do: async (d) => {
        await d.click(d.page.getByText('Home', { exact: true }).first());
        await d.sleep(600);
        const v = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).find((n) => n.startsWith(`${FULL} [Variance`));
        await d.select(combo(d, 'Active volume'), { label: v });
        await d.sleep(2500);
        await d.click(d.page.locator('button[title="Show Section"]'));
        await d.sleep(800);
        await d.select(combo(d, 'Orientation'), { label: 'Time slice' });
        await d.select(combo(d, 'Colormap'), { label: 'Grayscale' });
        await d.sleep(1500);
        await goTo(d, 1700);
        await expectText(d, d.page.locator('text=/^Time slice \\d+ ms$/ >> visible=true'), /^Time slice 1700 ms$/, 'time slice 1700 ms');
        await d.sleep(2200);
        await goTo(d, 1292);
        await expectText(d, d.page.locator('text=/^Time slice \\d+ ms$/ >> visible=true'), /^Time slice 1292 ms$/, 'time slice 1292 ms');
        await d.sleep(2000);
      } },
    { id: 'velocity', chapter: 'Time to depth', chapterSub: 'A velocity model from the stacking velocities',
      say: 'For depth, the stacking velocities become interval velocities with the Dix equation, filled into a layer cake on nine framework horizons.',
      do: async (d) => {
        await d.select(combo(d, 'Active volume'), { label: FULL });
        await d.sleep(2500);
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(600);
        await d.click(d.page.getByRole('button', { name: /Velocity model/ }));
        await dialog(d).waitFor();
        await d.sleep(800);
        const ta = dialog(d).getByTestId('sl-stacking-input');
        await ta.scrollIntoViewIfNeeded();
        await d.click(ta);
        await ta.fill(RMS_TABLE);
        await dialog(d).getByTestId('sl-dix-table').waitFor();
        await expectText(d, dialog(d).getByTestId('sl-dix-table'), /Depth at base \(ft\)/, 'Dix depths in feet');
        await d.highlight(dialog(d).getByTestId('sl-dix-table'));
        await d.sleep(1200);
        await d.unhighlight();
        await d.click(dialog(d).getByTestId('sl-dix-use-layers'));
        await d.sleep(800);
        await d.click(dialog(d).getByRole('button', { name: /Save to volume/ }));
        await d.sleep(2500);
      } },
    { id: 'calibrate',
      say: 'We calibrate it to the six wells, leaving out the seabed pick, which sits on a zero crossing below the sea floor.',
      do: async (d) => {
        await d.click(dialog(d).getByRole('button', { name: /Calibrate from wells/ }));
        await dialog(d).getByTestId('welltie').waitFor();
        await d.sleep(800);
        for (const top of ['Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation']) {
          await expectText(d, dialog(d).getByTestId(`welltie-pair-${top}`).locator('option:checked'), new RegExp(`^${top}$`), `${top} paired with the framework horizon`);
        }
        const sb = dialog(d).getByTestId('welltie-pair-Seabed');
        await sb.scrollIntoViewIfNeeded();
        await d.select(sb, '');
        await d.sleep(800);
      } },
    { id: 'fit',
      say: 'The miss at the wells falls from thirteen point six feet to two point six feet, over forty ties, and we apply it.',
      sub: 'The miss at the wells falls from 13.6 ft to 2.6 ft, over 40 ties, and we apply it.',
      do: async (d) => {
        await d.click(dialog(d).getByTestId('welltie-fit'));
        await dialog(d).getByTestId('welltie-result').waitFor({ timeout: 120000 });
        await d.sleep(800);
        await expectText(d, dialog(d).getByTestId('welltie-rms'), /RMS 13\.6 ft → 2\.6 ft \(40 ties\)/, 'calibration RMS');
        await d.highlight(dialog(d).getByTestId('welltie-rms'));
        await d.sleep(1800);
        await d.unhighlight();
        await d.click(dialog(d).getByTestId('welltie-apply'));
        await d.sleep(3000);
        await d.page.keyboard.press('Escape');
        await d.sleep(1000);
      } },
    { id: 'depthmap', chapter: 'Depth surfaces', chapterSub: 'Gridded fault-aware and published',
      say: 'In depth, the top of the sand closes around the crest at five thousand feet, and the west edge of the survey is as shallow: the structure is still rising where the data stop.',
      sub: 'In depth, the top of the sand closes around the crest at 5,000 ft, and the west edge of the survey is as shallow: the structure is still rising where the data stop.',
      do: async (d) => {
        await d.click(d.page.locator('button[title="Show Map"]'));
        await d.sleep(800);
        await setVisible(d, 'Ekene Sand (2)', true, { onCamera: true });
        await d.sleep(1500);
        await d.select(mapSel(d, 4), { label: 'Depth ft' });
        await d.sleep(3500);
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.45, y: b.y + b.height * 0.6 });
        await d.sleep(2000);
        await d.moveTo({ x: b.x + b.width * 0.05, y: b.y + b.height * 0.08 });
        await d.sleep(1500);
      } },
    { id: 'publish',
      say: 'Make surface grids the top and base of the sand in depth, fault aware, and publishes them to the registry.',
      sub: 'Make surface grids the top and base of the sand in depth, fault-aware, and publishes them to the registry.',
      do: async (d) => {
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        await publishSurface(d, 'Ekene Sand (2)', TOP, { onCamera: true });
      },
      wait: async (d) => {
        await explorerRow(d, TOP).waitFor({ timeout: 120000 });
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
        await publishSurface(d, 'Ekene Sand Base (2)', BASE, { onCamera: false });
        await explorerRow(d, BASE).waitFor({ timeout: 120000 });
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      },
      waitLabel: 'Seconds later' },
    { id: 'rcp', chapter: 'In ReservoirCalc Pro', chapterSub: 'The volume the wells prove',
      say: 'ReservoirCalc Pro takes both surfaces straight from the registry, as the top and the base.',
      do: async (d, shared) => {
        await d.page.goto(`${shared.baseUrl}${RCP}`, { waitUntil: 'domcontentloaded' });
        await d.page.locator('label[for="im-surfaces"]').waitFor({ timeout: 60000 });
        await d.sleep(2500);
        await d.click(d.page.locator('label[for="im-surfaces"]'));
        // then fold Project Settings away so the input tabs and results sit side by side
        const fold = d.page.getByText('Project Settings', { exact: true }).first().locator('xpath=ancestor::*[.//button][1]').getByRole('button').first();
        await fold.click().catch(() => {});
        await d.sleep(500);
        await d.click('rcp-tab-surfaces');
        await importRcpSurface(d, TOP, true);
      },
      wait: async (d) => {
        await importRcpSurface(d, BASE, false);
        await rcpCard(d, TOP).getByRole('button', { name: /Set Top/ }).click();
        await rcpCard(d, BASE).getByRole('button', { name: /Set Base/ }).click();
        await d.sleep(1000);
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(800);
      },
      waitLabel: 'Seconds later' },
    { id: 'contact',
      say: 'The contact is at five thousand and thirty six feet T V D S S. Trap only stays unticked: it would fill just a closure at the survey edge.',
      sub: 'The contact is at 5,036 ft TVDSS. Trap only stays unticked: it would fill just a closure at the survey edge.',
      do: async (d) => {
        await expectText(d, t(d, `rcp-surface-minz-${TOP}`), / ft$/, 'surface depths in feet');
        await d.click('rcp-tab-geometry');
        await d.sleep(800);
        const owc = d.page.getByLabel(/OWC/).first();
        await d.click(owc);
        await owc.fill('');
        await d.page.keyboard.type('-5036', { delay: 90 });
        await d.page.keyboard.press('Enter');
        await d.sleep(800);
        const spill = t(d, 'rcp-fill-to-spill').locator('input');
        if (await spill.isChecked()) await d.click(spill);
        await d.highlight(t(d, 'rcp-fill-to-spill'));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'aoi', chapter: 'The area the wells prove', chapterSub: 'Six development wells',
      say: 'Because the structure keeps rising to the edge of the survey, the full trap is not closed inside this 3D. So we count only the area the wells prove, drawn round the six development wells.',
      sub: 'Because the structure keeps rising to the edge of the survey, the full trap is not closed inside this 3D. So we count only the area the wells prove, drawn round the six development wells.',
      do: async (d) => {
        await d.click('rcp-tab-aoi');
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: '2D map view' }));
        await d.sleep(1500);
        await t(d, 'rcp-map-canvas').waitFor();
        // the fit shows the whole registry frame; zoom onto the survey first
        for (let i = 0; i < 6; i++) {
          const to0 = await mapToScreen(d);
          const c = to0([401590, 521740]);
          const b = await t(d, 'rcp-map-canvas').boundingBox();
          const pts = WELL_HULL.map(to0);
          const w = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
          if (w > b.width * 0.45) break;
          await d.page.mouse.move(c.x, c.y);
          await d.page.mouse.wheel(0, -300);
          await d.sleep(500);
        }
        await d.click(d.page.getByRole('button', { name: /Draw New Polygon/ }));
        await d.sleep(600);
        const to = await mapToScreen(d);
        for (const w of WELL_HULL) {
          const q = to(w);
          await d.moveTo(q);
          await d.page.evaluate(([x, y]) => window.__demo.ripple(x, y), [q.x, q.y]);
          await d.page.mouse.click(q.x, q.y);
          await d.sleep(500);
        }
        await d.click(d.page.getByRole('button', { name: /^Finish$/ }));
        await dialog(d).waitFor();
        await d.type(dialog(d).locator('input').first(), 'Six development wells');
        await d.click(dialog(d).getByRole('button', { name: 'Save Area' }));
        await d.sleep(1500);
      } },
    { id: 'zone',
      say: 'The averages come from the published Ekene Sand zone. Ekene two and Ekene four are left out: they have no net pay, because the sand there is below the contact.',
      sub: 'The averages come from the published Ekene Sand zone. Ekene-2 and Ekene-4 are left out: they have no net pay, because the sand there is below the contact.',
      do: async (d) => {
        await d.click('rcp-tab-registry');
        await d.sleep(1500);
        await d.select(t(d, 'rcp-reg-zone'), { label: 'Ekene Sand (4 of 5 wells published)' });
        await d.sleep(2000);
        for (const w of ['Ekene-2', 'Ekene-4']) {
          await expectText(d, t(d, `rcp-reg-nopay-${w}`), /no net pay/, `${w} no net pay`);
          const cb = t(d, `rcp-reg-use-${w}`);
          if (await cb.isChecked()) await d.click(cb);
          await d.sleep(600);
        }
        await expectText(d, 'rcp-reg-preview', /porosity 0\.191, Sw 0\.442, NTG 0\.453[\s\S]*from Ekene-1, Ekene-3/, 'zone averages');
        await d.highlight('rcp-reg-preview');
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('rcp-reg-apply-zone');
        await d.sleep(1200);
      } },
    { id: 'volume', chapter: 'The volume', chapterSub: 'Inside the area the wells prove',
      say: 'Inside the area, the gross rock volume is fourteen thousand six hundred and thirty acre feet, over four hundred and fourteen acres, and the stock tank oil initially in place is four point five six million barrels: the oil in the area the wells prove.',
      sub: 'Inside the area, the gross rock volume is 14,630 acre-feet, over 414 acres, and the stock tank oil initially in place is 4.56 million barrels: the oil in the area the wells prove.',
      do: async (d) => {
        // the zone panel scrolled the page: bring the result card back into view
        await d.page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: /Recalculate/ }));
        await d.sleep(5000);
        const body = d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
        await expectText(d, body, /4\.56 MM[\s\S]*Bulk Vol:\s*14,630 Ac-ft[\s\S]*HC Area:\s*414 acres/, 'volume summary');
        await d.highlight(body);
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'report',
      say: 'The report keeps the chain from rock to oil, with the contact at five thousand and thirty six feet T V D S S.',
      sub: 'The report keeps the chain from rock to oil, with the contact at 5,036 ft TVDSS.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await d.sleep(2500);
        await expectText(d, dialog(d), /OWC -5,036 ft TVDSS/, 'contact in the report');
        await d.sleep(3000);
      } },
    { id: 'next', chapter: 'From SEG-Y to volume', chapterSub: 'Three videos, one workflow',
      say: 'From SEG-Y to a framework, maps, depth and a volume, every step ties back to the wells. That is seismic interpretation with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
