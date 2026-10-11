// Seismolord, video 3: from horizons to volumes (Ekene kit v4).
// The Ekene Sand in time, closing against the listric growth fault; a
// variance volume where the growth fault, Ekene East and the crestal
// grabens show; the velocity model from the stacking velocities calibrated
// to the six wells; the depth surfaces published to the registry; and
// ReservoirCalc Pro measuring the closed rollover trap down to the
// 5,036 ft TVDSS contact (Trap only). Builds on demo 2's framework ("Ekene
// Sand", "Ekene Sand Base", faults Auto-1 and Auto-2 on EKENE3D-v4-full.sgy).
// Kit truth for checking (truth/ekene-structure-truth.json): crest
// 1511.8 m (4,960 ft), spill 1559.1 m (5,115 ft) TVDSS, 3.35 km2 (828 acres)
// and GRV 39.7 million m3 (32,190 acre-ft) above the 1535 m contact.
// `expectText` steps stop the take if the screen disagrees with the narration.
import {
  login, expectText, openSeismolord, explorerRow, setVisible, deleteSurface, deleteVolumesStarting, closeWindow,
  fullscreenBtn, sectionPoint, sectionCanvas, xlFrac, RECORD_MS, FULL,
} from './seis-common.mjs';

const RMS_TABLE = '47 1500\n331 1975\n926 2458\n1041 2456\n1289 2388\n1311 2397\n1517 2352\n1572 2341\n1625 2347\n1782 2329\n2467 2239';
const LAYERS = ['Benin Formation', 'Agbada Formation', 'Ogbia Shale', 'Ekene Sand', 'Ekene Sand Base',
  'Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation'];
const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const SAND = 'Ekene Sand';
const SAND_BASE = 'Ekene Sand Base';
const TOP = `${SAND} (depth ft)`;
const BASE = `${SAND_BASE} (depth ft)`;
const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';

const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog').last();
const combo = (d, name) => d.page.getByRole('combobox', { name });
const mapSel = (d, i) => d.page.locator('[data-testid="window-map"] select').nth(i);
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const layerSel = (d) => dialog(d).locator('select:has(option:text-is("down to horizon…"))');
const at = (d, xl, ms) => sectionPoint(d, { frac: xlFrac(xl), ms, recordMs: RECORD_MS });

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
  await expectText(d, dialog(d), /Fault-aware \(2 faults\)/, 'fault-aware gridding');
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
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await resetVelocity(d);
    // nothing drawn over the seismic but the Ekene Sand
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) await setVisible(d, n, false);
    await setVisible(d, SAND, true);
    for (const w of WELLS) await setVisible(d, w, true);
    await d.page.getByText('Home', { exact: true }).first().click();
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await combo(d, 'Colormap').selectOption({ label: 'Red-White-Blue' });
    await d.page.getByRole('slider', { name: /Gain/ }).fill('1');
    await t(d, 'sl-goto').fill('1080'); await t(d, 'sl-goto-btn').click();
    await d.sleep(2500);
    // the Map window, in time, showing structure
    await d.page.getByRole('button', { name: /Windows/ }).click();
    await d.sleep(600);
    await d.page.getByText('Map', { exact: true }).last().click();
    await d.sleep(1200);
    await d.page.keyboard.press('Escape');
    await d.sleep(4000);
    await mapSel(d, 0).selectOption({ label: SAND }).catch(() => {});
    await d.sleep(1500);
    await mapSel(d, 2).selectOption({ label: 'Structure' });
    await mapSel(d, 4).selectOption({ label: 'TWT ms' });
    await mapSel(d, 3).selectOption({ label: 'Spectrum' });
    await d.sleep(2500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Horizons to volumes', chapterSub: 'Maps, depth and a volume from the framework',
      say: 'The framework becomes maps and a volume. This is the top of the Ekene Sand in two way time: the rings close around the crest of the rollover, against the growth fault.',
      sub: 'The framework becomes maps and a volume. This is the top of the Ekene Sand in two-way time: the rings close around the crest of the rollover, against the growth fault.',
      do: async (d) => {
        await expectText(d, mapSel(d, 0).locator('option:checked'), /^Ekene Sand$/, 'mapped horizon');
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.45, y: b.y + b.height * 0.45 });
        await d.sleep(2000);
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.5 }, { ms: 1200 });
        await d.sleep(1500);
      } },
    { id: 'variance', chapter: 'A variance volume', chapterSub: 'Edges in the seismic, computed in the browser',
      say: 'A variance volume, computed in the browser, lights up faults and edges.',
      do: async (d) => {
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
        await ex(d).locator('div[role=button]').filter({ hasText: `${FULL} [Variance` }).first().waitFor({ timeout: 900000 });
        await d.sleep(1500);
        await d.page.keyboard.press('Escape');
        await d.sleep(1000);
        // still inside the cut: the variance on a time slice, ready to show
        await d.page.getByText('Home', { exact: true }).first().click();
        await d.sleep(600);
        const v = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).find((n) => n.startsWith(`${FULL} [Variance`));
        await combo(d, 'Active volume').selectOption({ label: v });
        await d.sleep(2500);
        await d.page.locator('button[title="Show Section"]').click();
        await d.sleep(800);
        await combo(d, 'Orientation').selectOption({ label: 'Time slice' });
        await combo(d, 'Colormap').selectOption({ label: 'Grayscale' });
        await d.sleep(800);
        await t(d, 'sl-goto').fill('900'); await t(d, 'sl-goto-btn').click();
        await d.sleep(2500);
      },
      waitLabel: 'A minute later' },
    { id: 'graben', chapter: 'Faults in plan', chapterSub: 'The variance on time slices, in full view',
      say: 'On a time slice at nine hundred milliseconds, in full view, the growth fault curves across the survey, and the crestal grabens show at both ends of the crest: small faults in pairs, in the beds above the reservoir.',
      sub: 'On a time slice at 900 ms, in full view, the growth fault curves across the survey, and the crestal grabens show at both ends of the crest: small faults in pairs, in the beds above the reservoir.',
      do: async (d) => {
        await expectText(d, d.page.locator('text=/^Time slice \\d+ ms$/ >> visible=true'), /^Time slice 900 ms$/, 'shallow time slice');
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1500);
        const c = sectionCanvas(d);
        const b = await c.boundingBox();
        const pt = (il, xl) => ({ x: b.x + b.width * ((xl - 1960 + 0.5) / 168), y: b.y + b.height * ((il - 1000 + 0.5) / 128) });
        await d.moveTo(pt(1010, 2024), { ms: 900 });
        await d.moveTo(pt(1064, 2010), { ms: 1300 });
        await d.moveTo(pt(1118, 2022), { ms: 1300 });
        await d.sleep(500);
        await d.moveTo(pt(1105, 2041), { ms: 900 });
        await d.sleep(1200);
        await d.moveTo(pt(1008, 2037), { ms: 1400 });
        await d.sleep(1000);
      } },
    { id: 'deepslice',
      say: 'At seventeen hundred milliseconds the growth fault has moved basinward as it flattens, and Ekene East, the buried fault, is a straight line beside it.',
      sub: 'At 1700 ms the growth fault has moved basinward as it flattens, and Ekene East, the buried fault, is a straight line beside it.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(800);
        await goTo(d, 1700);
        await expectText(d, d.page.locator('text=/^Time slice \\d+ ms$/ >> visible=true'), /^Time slice 1700 ms$/, 'deep time slice');
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1200);
        const b = await sectionCanvas(d).boundingBox();
        const pt = (il, xl) => ({ x: b.x + b.width * ((xl - 1960 + 0.5) / 168), y: b.y + b.height * ((il - 1000 + 0.5) / 128) });
        await d.moveTo(pt(1064, 2028), { ms: 1000 });
        await d.sleep(1200);
        await d.moveTo(pt(1030, 2066), { ms: 900 });
        await d.moveTo(pt(1100, 2070), { ms: 1400 });
        await d.sleep(1200);
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(800);
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
      say: 'The miss at the wells falls from thirteen point nine feet to eight point one feet, over forty ties, and we apply it.',
      sub: 'The miss at the wells falls from 13.9 ft to 8.1 ft, over 40 ties, and we apply it.',
      do: async (d) => {
        await d.click(dialog(d).getByTestId('welltie-fit'));
        await dialog(d).getByTestId('welltie-result').waitFor({ timeout: 120000 });
        await d.sleep(800);
        await expectText(d, dialog(d).getByTestId('welltie-rms'), /RMS 13\.9 ft → 8\.1 ft \(40 ties\)/, 'calibration RMS');
        await d.highlight(dialog(d).getByTestId('welltie-rms'));
        await d.sleep(1800);
        await d.unhighlight();
        await d.click(dialog(d).getByTestId('welltie-apply'));
        await d.sleep(3000);
        await d.page.keyboard.press('Escape');
        await d.sleep(1000);
      } },
    { id: 'depthmap', chapter: 'Depth surfaces', chapterSub: 'Gridded fault-aware and published',
      lead: 5, // the map is shown and switched to depth first
      say: 'In depth, the five thousand foot contour closes around the crest, against the growth fault.',
      sub: 'In depth, the 5,000 ft contour closes around the crest, against the growth fault.',
      do: async (d) => {
        await d.click(d.page.locator('button[title="Show Map"]'));
        await d.sleep(800);
        await setVisible(d, SAND, true, { onCamera: true });
        await d.sleep(1500);
        await d.select(mapSel(d, 4), { label: 'Depth ft' });
        await d.sleep(3500);
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.45, y: b.y + b.height * 0.45 });
        await d.sleep(2000);
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.5 }, { ms: 1200 });
        await d.sleep(1500);
      } },
    { id: 'publish',
      say: 'Make surface grids the top and base of the sand in depth, fault aware, and publishes them to the registry.',
      sub: 'Make surface grids the top and base of the sand in depth, fault-aware, and publishes them to the registry.',
      do: async (d) => {
        await d.click('sl-ribbon-tab-interpretation');
        await d.sleep(500);
        await publishSurface(d, SAND, TOP, { onCamera: true });
      },
      wait: async (d) => {
        await explorerRow(d, TOP).waitFor({ timeout: 120000 });
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
        await publishSurface(d, SAND_BASE, BASE, { onCamera: false });
        await explorerRow(d, BASE).waitFor({ timeout: 120000 });
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      },
      waitLabel: 'Seconds later' },
    { id: 'rcp', chapter: 'In ReservoirCalc Pro', chapterSub: 'The closed rollover trap',
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
      say: 'The contact is at five thousand and thirty six feet T V D S S. Trap only counts the closure around the crest, filled at most to its spill point.',
      sub: 'The contact is at 5,036 ft TVDSS. Trap only counts the closure around the crest, filled at most to its spill point.',
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
        if (!(await spill.isChecked())) await d.click(spill);
        await d.highlight(t(d, 'rcp-fill-to-spill'));
        await d.sleep(1500);
        await d.unhighlight();
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
    { id: 'volume', chapter: 'The volume', chapterSub: 'The closed trap to the contact',
      say: 'The closed trap holds a gross rock volume of thirty four thousand three hundred and thirty one acre feet, over eight hundred and seventeen acres, and the stock tank oil initially in place is ten point six nine million barrels.',
      sub: 'The closed trap holds a gross rock volume of 34,331 acre-feet, over 817 acres, and the stock tank oil initially in place is 10.69 million barrels.',
      do: async (d) => {
        // the zone panel scrolled the page: bring the result card back into view
        await d.page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: /Recalculate/ }));
        await d.sleep(5000);
        const body = d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
        await expectText(d, body, /10\.69 MM[\s\S]*Bulk Vol:\s*34,331 Ac-ft[\s\S]*HC Area:\s*817 acres/, 'volume summary');
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
